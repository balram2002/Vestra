import 'server-only';

import { campaignStatus, type CampaignStatus } from '@/domain/campaign-status';
import { describeCoupon, type CouponRuleInput } from '@/domain/coupon-rules';
import type { Coupon } from '@/domain/types';
import type { CouponDraft } from '@/components/console/coupons/coupon-editor';
import { formatMoney } from '@/lib/format';

import { requirePermission } from '../auth/session';
import { collections, toEntities, toEntity } from '../db/collections';

/**
 * Coupons, as the admin console sees them.
 *
 * Status is derived here, with the clock, and never stored: see
 * `domain/campaign-status`. The list is small enough (hundreds, not millions)
 * to filter in memory after one read, which keeps the counts on the status
 * tabs exact without a second aggregation per tab.
 */

export type CouponFilter = CampaignStatus | 'all' | 'archived';
export type CouponSort = 'newest' | 'ending' | 'most-used';

export interface TargetOption {
  value: string;
  label: string;
}

export interface CouponTargets {
  categories: TargetOption[];
  brands: TargetOption[];
  sellers: TargetOption[];
}

export interface CouponRow {
  coupon: Coupon;
  status: CampaignStatus;
  archived: boolean;
  summary: string;
}

/**
 * The categories, brands and stores a coupon may be limited to.
 *
 * Values are ids, the convention for offer targeting: the cart puts both a
 * product's ancestor slugs AND their ids into the path it evaluates against
 * (see `services/cart.ts`), so ids match there and stay stable if a category
 * is renamed and its slug moves.
 */
export async function couponTargetOptions(): Promise<CouponTargets> {
  const [categoryCol, brandCol, sellerCol] = await Promise.all([
    collections.categories(),
    collections.brands(),
    collections.sellers(),
  ]);
  const [categories, brands, sellers] = await Promise.all([
    categoryCol.find({}, { projection: { name: 1, depth: 1 } }).sort({ depth: 1, name: 1 }).toArray(),
    brandCol.find({}, { projection: { name: 1 } }).sort({ name: 1 }).toArray(),
    sellerCol
      .find({ status: { $in: ['ACTIVE', 'APPROVED'] } }, { projection: { displayName: 1 } })
      .sort({ displayName: 1 })
      .toArray(),
  ]);

  return {
    categories: categories.map((category) => ({
      value: String(category._id),
      label: category.depth > 0 ? `${'— '.repeat(Math.min(category.depth, 3))}${category.name}` : category.name,
    })),
    brands: brands.map((brand) => ({ value: String(brand._id), label: brand.name })),
    sellers: sellers.map((seller) => ({ value: String(seller._id), label: seller.displayName })),
  };
}

function namesFor(coupon: Coupon, targets: CouponTargets): string[] {
  const lookup = (options: TargetOption[], values: string[]) =>
    values.map((value) => options.find((option) => option.value === value)?.label.replace(/^(— )+/, '') ?? value);
  switch (coupon.scope) {
    case 'CATEGORY':
      return lookup(targets.categories, coupon.categoryIds);
    case 'BRAND':
      return lookup(targets.brands, coupon.brandIds);
    case 'SELLER':
      return lookup(targets.sellers, coupon.sellerIds);
    case 'PRODUCT':
      return coupon.productIds.length ? [`${coupon.productIds.length} products`] : [];
    default:
      return [];
  }
}

export function ruleInput(coupon: Coupon, targetNames: string[]): CouponRuleInput {
  return {
    type: coupon.type,
    value: coupon.value,
    maxDiscount: coupon.maxDiscount,
    minCartValue: coupon.minCartValue,
    audience: coupon.audience,
    scope: coupon.scope,
    targetNames,
    paymentMethods: coupon.paymentMethods,
    totalUsageLimit: coupon.totalUsageLimit,
    perUserLimit: coupon.perUserLimit,
  };
}

export async function listAdminCoupons(input: {
  q?: string;
  filter?: CouponFilter;
  sort?: CouponSort;
}): Promise<{ rows: CouponRow[]; counts: Record<CouponFilter, number> }> {
  await requirePermission('coupon:read');
  const now = Date.now();

  const [couponCol, targets] = await Promise.all([collections.coupons(), couponTargetOptions()]);
  const coupons = toEntities(await couponCol.find({}).toArray());

  const all: CouponRow[] = coupons.map((coupon) => ({
    coupon,
    archived: Boolean(coupon.archivedAt),
    status: campaignStatus({ ...coupon, limit: coupon.totalUsageLimit, used: coupon.usedCount }, now),
    summary: describeCoupon(ruleInput(coupon, namesFor(coupon, targets)), formatMoney),
  }));

  const counts: Record<CouponFilter, number> = {
    all: 0, live: 0, scheduled: 0, paused: 0, expired: 0, exhausted: 0, archived: 0,
  };
  for (const row of all) {
    if (row.archived) {
      counts.archived += 1;
      continue;
    }
    counts.all += 1;
    counts[row.status] += 1;
  }

  const filter = input.filter ?? 'all';
  const q = input.q?.trim().toLowerCase() ?? '';

  const rows = all
    .filter((row) => (filter === 'archived' ? row.archived : !row.archived && (filter === 'all' || row.status === filter)))
    .filter(
      (row) =>
        !q ||
        row.coupon.code.toLowerCase().includes(q) ||
        row.coupon.title.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      switch (input.sort) {
        case 'ending':
          return Date.parse(a.coupon.endsAt) - Date.parse(b.coupon.endsAt);
        case 'most-used':
          return b.coupon.usedCount - a.coupon.usedCount;
        default:
          return Date.parse(b.coupon.createdAt) - Date.parse(a.coupon.createdAt);
      }
    });

  return { rows, counts };
}

/* ------------------------------------------------------------- insight */

export interface CouponInsight {
  redemptions: number;
  discountGiven: number;
  revenue: number;
  averageOrder: number;
  /** Redemptions per day, oldest first, for the last 30 days. */
  series: number[];
  recent: Array<{ orderNumber: string; customer: string; discount: number; at: string }>;
}

export async function getCouponEditor(id: string): Promise<{
  coupon: Coupon;
  row: CouponRow;
  insight: CouponInsight;
  targets: CouponTargets;
} | null> {
  await requirePermission('coupon:read');

  const couponCol = await collections.coupons();
  const coupon = toEntity(await couponCol.findOne({ _id: id }));
  if (!coupon) return null;

  const [targets, insight] = await Promise.all([couponTargetOptions(), couponInsight(coupon)]);
  const row: CouponRow = {
    coupon,
    archived: Boolean(coupon.archivedAt),
    status: campaignStatus({ ...coupon, limit: coupon.totalUsageLimit, used: coupon.usedCount }, Date.now()),
    summary: describeCoupon(ruleInput(coupon, namesFor(coupon, targets)), formatMoney),
  };
  return { coupon, row, insight, targets };
}

async function couponInsight(coupon: Coupon): Promise<CouponInsight> {
  const [redemptionCol, orderCol, userCol] = await Promise.all([
    collections.couponRedemptions(),
    collections.orders(),
    collections.users(),
  ]);

  const redemptions = toEntities(
    await redemptionCol.find({ couponId: coupon.id, revokedAt: null }).sort({ redeemedAt: -1 }).toArray(),
  );
  const orders = toEntities(
    await orderCol
      .find(
        { _id: { $in: redemptions.map((redemption) => redemption.orderId) } },
        { projection: { orderNumber: 1, pricing: 1, userId: 1 } },
      )
      .toArray(),
  );
  const orderById = new Map(orders.map((order) => [order.id, order]));

  const recentUserIds = [...new Set(redemptions.slice(0, 10).map((redemption) => redemption.userId))];
  const users = toEntities(
    await userCol.find({ _id: { $in: recentUserIds } }, { projection: { fullName: 1 } }).toArray(),
  );
  const nameById = new Map(users.map((user) => [user.id, user.fullName]));

  const revenue = orders.reduce((sum, order) => sum + (order.pricing?.payable ?? 0), 0);
  const day = 86_400_000;
  const start = Date.now() - 29 * day;
  const series = Array.from({ length: 30 }, () => 0);
  for (const redemption of redemptions) {
    const index = Math.floor((Date.parse(redemption.redeemedAt) - start) / day);
    if (index >= 0 && index < 30) series[index] += 1;
  }

  return {
    redemptions: redemptions.length,
    discountGiven: redemptions.reduce((sum, redemption) => sum + redemption.discount, 0),
    revenue,
    averageOrder: orders.length ? Math.round(revenue / orders.length) : 0,
    series,
    recent: redemptions.slice(0, 10).map((redemption) => ({
      orderNumber: orderById.get(redemption.orderId)?.orderNumber ?? '—',
      customer: nameById.get(redemption.userId) ?? 'Customer',
      discount: redemption.discount,
      at: redemption.redeemedAt,
    })),
  };
}

/** A coupon to start a duplicate from: same rules, fresh code and dates. */
export async function getCouponForDuplicate(id: string): Promise<Coupon | null> {
  await requirePermission('coupon:write');
  const couponCol = await collections.coupons();
  return toEntity(await couponCol.findOne({ _id: id }));
}

/* ---------------------------------------------------------- form drafts */

/** Paise to the rupee string a form field shows; blank for "none". */
function toRupeeField(paise: number | null): string {
  return paise == null ? '' : String(paise / 100);
}

/**
 * A stored coupon as the editor's draft. With `duplicate`, the rules are kept
 * but the code, dates and usage start fresh -- a copy that went live with the
 * original's dates would be expired or clashing on arrival.
 */
export function couponDraftFrom(coupon: Coupon, options: { duplicate?: boolean } = {}): CouponDraft {
  const fresh = options.duplicate ? newCouponDraft() : null;
  return {
    code: fresh ? '' : coupon.code,
    title: fresh ? `${coupon.title} (copy)`.slice(0, 80) : coupon.title,
    description: coupon.description === coupon.title ? '' : coupon.description,
    type: coupon.type === 'BUY_X_GET_Y' ? 'PERCENTAGE' : coupon.type,
    value: coupon.type === 'FIXED' ? toRupeeField(coupon.value) : coupon.type === 'PERCENTAGE' ? String(coupon.value) : '',
    maxDiscount: toRupeeField(coupon.maxDiscount),
    minCartValue: toRupeeField(coupon.minCartValue),
    audience: coupon.audience === 'SEGMENT' ? 'ALL' : coupon.audience,
    scope: coupon.scope === 'PRODUCT' ? 'PLATFORM' : coupon.scope,
    targets:
      coupon.scope === 'CATEGORY'
        ? coupon.categoryIds
        : coupon.scope === 'BRAND'
          ? coupon.brandIds
          : coupon.scope === 'SELLER'
            ? coupon.sellerIds
            : [],
    paymentMethods: coupon.paymentMethods,
    totalUsageLimit: coupon.totalUsageLimit == null ? '' : String(coupon.totalUsageLimit),
    perUserLimit: String(coupon.perUserLimit),
    startsAt: fresh ? fresh.startsAt : coupon.startsAt,
    endsAt: fresh ? fresh.endsAt : coupon.endsAt,
    visible: coupon.visible,
    stackableWithOffers: coupon.stackableWithOffers,
    fundedBy: coupon.fundedBy,
  };
}

/** A blank coupon: starts now, runs thirty days. The clock is read here. */
export function newCouponDraft(): CouponDraft {
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 86_400_000);
  end.setHours(23, 59, 0, 0);
  return {
    code: '',
    title: '',
    description: '',
    type: 'PERCENTAGE',
    value: '10',
    maxDiscount: '',
    minCartValue: '0',
    audience: 'ALL',
    scope: 'PLATFORM',
    targets: [],
    paymentMethods: [],
    totalUsageLimit: '',
    perUserLimit: '1',
    startsAt: now.toISOString(),
    endsAt: end.toISOString(),
    visible: true,
    stackableWithOffers: false,
    fundedBy: 'PLATFORM',
  };
}
