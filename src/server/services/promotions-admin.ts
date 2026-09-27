import 'server-only';

import { campaignStatus, type CampaignStatus } from '@/domain/campaign-status';
import { promotionValueKind } from '@/domain/enums';
import { describePromotion, findOverlap, type Overlap, type OverlapCandidate, type PromotionRuleInput } from '@/domain/promotion-rules';
import type { Promotion } from '@/domain/types';
import type { PromotionDraft } from '@/components/console/promotions/promotion-editor';
import { formatMoney } from '@/lib/format';

import { requirePermission } from '../auth/session';
import { collections, toEntities, toEntity } from '../db/collections';
import { couponTargetOptions, type CouponTargets } from './coupons-admin';

/**
 * Promotions, as the admin console sees them: automatic offers with no code,
 * which is why the screen spends so much of itself on "what else is running
 * at the same time on the same things".
 */

export type PromotionFilter = CampaignStatus | 'all' | 'archived';
export type PromotionSort = 'priority' | 'newest' | 'ending';

export interface PromotionRow {
  promotion: Promotion;
  status: CampaignStatus;
  archived: boolean;
  summary: string;
  overlaps: number;
}

function nameIndex(targets: CouponTargets): (id: string) => string {
  const map = new Map(
    [...targets.categories, ...targets.brands, ...targets.sellers].map((option) => [
      option.value,
      option.label.replace(/^(— )+/, ''),
    ]),
  );
  return (id) => map.get(id) ?? id;
}

export function promotionRuleInput(promotion: Promotion, names: (id: string) => string): PromotionRuleInput {
  return {
    type: promotion.type,
    valueKind: promotionValueKind(promotion),
    value: promotion.value,
    maxDiscount: promotion.maxDiscount,
    minOrderValue: promotion.minOrderValue,
    buyXGetY: promotion.buyXGetY,
    paymentMethods: promotion.paymentMethods,
    bankName: promotion.bankName,
    targetNames: [
      ...promotion.categoryIds,
      ...promotion.brandIds,
      ...promotion.sellerIds,
    ].map(names).concat(promotion.productIds.length ? [`${promotion.productIds.length} products`] : []),
    stockLimit: promotion.stockLimit,
  };
}

export function overlapCandidate(promotion: Promotion): OverlapCandidate {
  return {
    id: promotion.id,
    title: promotion.title,
    startsAt: promotion.startsAt,
    endsAt: promotion.endsAt,
    priority: promotion.priority,
    valueKind: promotionValueKind(promotion),
    value: promotion.value,
    type: promotion.type,
    categoryIds: promotion.categoryIds,
    brandIds: promotion.brandIds,
    sellerIds: promotion.sellerIds,
    productIds: promotion.productIds,
    paymentMethods: promotion.paymentMethods,
  };
}

/** Promotions that could still collide with something: not archived, not over. */
function inPlay(promotion: Promotion, now: number): boolean {
  return !promotion.archivedAt && Date.parse(promotion.endsAt) > now;
}

function statusOf(promotion: Promotion, now: number): CampaignStatus {
  return campaignStatus(
    { ...promotion, limit: promotion.stockLimit, used: promotion.stockSold },
    now,
  );
}

async function loadAll(): Promise<{ promotions: Promotion[]; targets: CouponTargets; now: number }> {
  const [promotionCol, targets] = await Promise.all([collections.promotions(), couponTargetOptions()]);
  const promotions = toEntities(await promotionCol.find({}).toArray());
  return { promotions, targets, now: Date.now() };
}

export async function listAdminPromotions(input: {
  q?: string;
  filter?: PromotionFilter;
  sort?: PromotionSort;
}): Promise<{ rows: PromotionRow[]; counts: Record<PromotionFilter, number> }> {
  await requirePermission('coupon:read');
  const { promotions, targets, now } = await loadAll();
  const names = nameIndex(targets);

  const active = promotions.filter((promotion) => inPlay(promotion, now) && promotion.isActive);
  const all: PromotionRow[] = promotions.map((promotion) => ({
    promotion,
    archived: Boolean(promotion.archivedAt),
    status: statusOf(promotion, now),
    summary: describePromotion(promotionRuleInput(promotion, names), formatMoney),
    // Only switched-on collisions count here: a paused promotion overlapping
    // is a plan, not a problem.
    overlaps:
      inPlay(promotion, now) && promotion.isActive
        ? active.filter((other) => findOverlap(overlapCandidate(promotion), overlapCandidate(other), names)).length
        : 0,
  }));

  const counts: Record<PromotionFilter, number> = {
    all: 0, live: 0, scheduled: 0, paused: 0, expired: 0, exhausted: 0, archived: 0,
  };
  for (const row of all) {
    if (row.archived) counts.archived += 1;
    else {
      counts.all += 1;
      counts[row.status] += 1;
    }
  }

  const filter = input.filter ?? 'all';
  const q = input.q?.trim().toLowerCase() ?? '';
  const rows = all
    .filter((row) => (filter === 'archived' ? row.archived : !row.archived && (filter === 'all' || row.status === filter)))
    .filter((row) => !q || row.promotion.title.toLowerCase().includes(q) || (row.promotion.badgeText ?? '').toLowerCase().includes(q))
    .sort((a, b) => {
      switch (input.sort) {
        case 'newest':
          return Date.parse(b.promotion.createdAt) - Date.parse(a.promotion.createdAt);
        case 'ending':
          return Date.parse(a.promotion.endsAt) - Date.parse(b.promotion.endsAt);
        default:
          return b.promotion.priority - a.promotion.priority || Date.parse(b.promotion.createdAt) - Date.parse(a.promotion.createdAt);
      }
    });

  return { rows, counts };
}

/* ------------------------------------------------------------- calendar */

export interface CalendarBar {
  id: string;
  title: string;
  status: CampaignStatus;
  /** Position within the window, 0–100, clipped at the edges. */
  left: number;
  width: number;
  startsBefore: boolean;
  endsAfter: boolean;
  startsAt: string;
  endsAt: string;
}

export interface PromotionCalendar {
  from: string;
  days: number;
  /** Where "now" falls, 0–100. */
  today: number;
  /** Week boundaries for the ruler, 0–100, with their label. */
  weeks: Array<{ at: number; label: string }>;
  bars: CalendarBar[];
}

/**
 * The next eight weeks as a timeline: one bar per promotion that touches it,
 * so two sales stacked on the same weekend are visible before they happen.
 */
export async function promotionCalendar(days = 56): Promise<PromotionCalendar> {
  await requirePermission('coupon:read');
  const { promotions, now } = await loadAll();

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday this week
  const from = start.getTime();
  const to = from + days * 86_400_000;
  const span = to - from;
  const at = (ms: number) => Math.min(100, Math.max(0, ((ms - from) / span) * 100));

  const bars = promotions
    .filter((promotion) => !promotion.archivedAt)
    .filter((promotion) => Date.parse(promotion.endsAt) >= from && Date.parse(promotion.startsAt) <= to)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .map((promotion) => {
      const s = Date.parse(promotion.startsAt);
      const e = Date.parse(promotion.endsAt);
      const left = at(s);
      return {
        id: promotion.id,
        title: promotion.title,
        status: statusOf(promotion, now),
        left,
        width: Math.max(0.8, at(e) - left),
        startsBefore: s < from,
        endsAfter: e > to,
        startsAt: promotion.startsAt,
        endsAt: promotion.endsAt,
      };
    });

  const label = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
  return {
    from: new Date(from).toISOString(),
    days,
    today: at(now),
    weeks: Array.from({ length: days / 7 }, (_, index) => ({
      at: (index * 7 * 86_400_000 / span) * 100,
      label: label.format(new Date(from + index * 7 * 86_400_000)),
    })),
    bars,
  };
}

/* --------------------------------------------------------------- editor */

export interface PromotionPeer extends OverlapCandidate {
  isActive: boolean;
}

export async function getPromotionEditor(id: string | null): Promise<{
  promotion: Promotion | null;
  row: PromotionRow | null;
  overlaps: Overlap[];
  /** Everything else still in play, for live overlap checks while editing. */
  peers: PromotionPeer[];
  targets: CouponTargets;
}> {
  await requirePermission('promotion:write');
  const { promotions, targets, now } = await loadAll();
  const names = nameIndex(targets);

  const promotion = id ? promotions.find((entry) => entry.id === id) ?? null : null;
  const peers = promotions
    .filter((entry) => entry.id !== id && inPlay(entry, now))
    .map((entry) => ({ ...overlapCandidate(entry), isActive: entry.isActive }));

  if (!promotion) return { promotion: null, row: null, overlaps: [], peers, targets };

  const overlaps = peers
    .map((peer) => findOverlap(overlapCandidate(promotion), peer, names))
    .filter((overlap): overlap is Overlap => overlap !== null);

  return {
    promotion,
    row: {
      promotion,
      archived: Boolean(promotion.archivedAt),
      status: statusOf(promotion, now),
      summary: describePromotion(promotionRuleInput(promotion, names), formatMoney),
      overlaps: overlaps.length,
    },
    overlaps,
    peers,
    targets,
  };
}

export async function getPromotion(id: string): Promise<Promotion | null> {
  await requirePermission('promotion:write');
  const promotionCol = await collections.promotions();
  return toEntity(await promotionCol.findOne({ _id: id }));
}

/* ---------------------------------------------------------- form drafts */

const rupeeField = (paise: number | null) => (paise == null ? '' : String(paise / 100));

export function promotionDraftFrom(promotion: Promotion, options: { duplicate?: boolean } = {}): PromotionDraft {
  const fresh = options.duplicate ? newPromotionDraft() : null;
  const kind = promotionValueKind(promotion);
  return {
    title: fresh ? `${promotion.title} (copy)`.slice(0, 80) : promotion.title,
    description: promotion.description,
    badgeText: promotion.badgeText ?? '',
    type: promotion.type,
    valueKind: kind,
    value: promotion.type === 'BUY_X_GET_Y' ? '' : kind === 'PERCENT' ? String(promotion.value) : rupeeField(promotion.value),
    maxDiscount: rupeeField(promotion.maxDiscount),
    minOrderValue: rupeeField(promotion.minOrderValue),
    buyQuantity: String(promotion.buyXGetY?.buyQuantity ?? 2),
    getQuantity: String(promotion.buyXGetY?.getQuantity ?? 1),
    bxgyPercent: String(promotion.buyXGetY?.discountPercent ?? 100),
    applyTo: promotion.buyXGetY?.applyTo ?? 'CHEAPEST',
    categoryIds: promotion.categoryIds,
    brandIds: promotion.brandIds,
    sellerIds: promotion.sellerIds,
    paymentMethods: promotion.paymentMethods,
    bankName: promotion.bankName ?? '',
    priority: String(promotion.priority),
    stockLimit: promotion.stockLimit == null ? '' : String(promotion.stockLimit),
    fundedBy: promotion.fundedBy,
    startsAt: fresh ? fresh.startsAt : promotion.startsAt,
    endsAt: fresh ? fresh.endsAt : promotion.endsAt,
  };
}

/** A blank promotion: starts tomorrow morning, runs a week. The clock is read here. */
export function newPromotionDraft(): PromotionDraft {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  end.setHours(23, 59, 0, 0);
  return {
    title: '',
    description: '',
    badgeText: '',
    type: 'PERCENT_DISCOUNT',
    valueKind: 'PERCENT',
    value: '10',
    maxDiscount: '',
    minOrderValue: '0',
    buyQuantity: '2',
    getQuantity: '1',
    bxgyPercent: '100',
    applyTo: 'CHEAPEST',
    categoryIds: [],
    brandIds: [],
    sellerIds: [],
    paymentMethods: [],
    bankName: '',
    priority: '10',
    stockLimit: '',
    fundedBy: 'PLATFORM',
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  };
}
