import 'server-only';

import { campaignStatus, endingSoon, type CampaignStatus } from '@/domain/campaign-status';
import { CHROME_PAGES, CHROME_PARTS } from '@/domain/page-chrome';

import { requirePermission } from '../auth/session';
import { collections } from '../db/collections';
import { designSummaries, type DesignSummary } from './page-designs';
import { getSiteContent } from './site-content';

/**
 * Everything Marketing looks after, on one screen.
 *
 * Counts and short lists only -- each links to the screen that edits it. The
 * clock is read here, in the service, so the page stays a pure render.
 */

export interface CampaignLine {
  id: string;
  kind: 'coupon' | 'promotion';
  label: string;
  status: CampaignStatus;
  endsAt: string;
  startsAt: string;
}

export interface MarketingOverview {
  designs: DesignSummary[];
  coupons: Record<CampaignStatus, number>;
  promotions: Record<CampaignStatus, number>;
  endingSoon: CampaignLine[];
  startingSoon: CampaignLine[];
  content: { published: number; drafts: number };
  site: { stripShowing: boolean; activeAnnouncements: number; hiddenFrameRules: number };
}

const EMPTY: Record<CampaignStatus, number> = { live: 0, scheduled: 0, paused: 0, expired: 0, exhausted: 0 };

export async function getMarketingOverview(): Promise<MarketingOverview> {
  await requirePermission('cms:write');
  const now = Date.now();

  const [designs, couponCol, promotionCol, pageCol, site] = await Promise.all([
    designSummaries(),
    collections.coupons(),
    collections.promotions(),
    collections.cmsPages(),
    getSiteContent(),
  ]);

  const [coupons, promotions, published, drafts] = await Promise.all([
    couponCol
      .find({}, { projection: { code: 1, isActive: 1, startsAt: 1, endsAt: 1, totalUsageLimit: 1, usedCount: 1 } })
      .toArray(),
    promotionCol.find({}, { projection: { title: 1, isActive: 1, startsAt: 1, endsAt: 1 } }).toArray(),
    pageCol.countDocuments({ isPublished: true }),
    pageCol.countDocuments({ isPublished: false }),
  ]);

  const lines: CampaignLine[] = [
    ...coupons.map((coupon) => ({
      id: String(coupon._id),
      kind: 'coupon' as const,
      label: coupon.code,
      startsAt: coupon.startsAt,
      endsAt: coupon.endsAt,
      status: campaignStatus(
        { ...coupon, limit: coupon.totalUsageLimit, used: coupon.usedCount },
        now,
      ),
    })),
    ...promotions.map((promotion) => ({
      id: String(promotion._id),
      kind: 'promotion' as const,
      label: promotion.title,
      startsAt: promotion.startsAt,
      endsAt: promotion.endsAt,
      status: campaignStatus(promotion, now),
    })),
  ];

  const tally = (kind: CampaignLine['kind']) =>
    lines
      .filter((line) => line.kind === kind)
      .reduce((counts, line) => ({ ...counts, [line.status]: counts[line.status] + 1 }), { ...EMPTY });

  return {
    designs,
    coupons: tally('coupon'),
    promotions: tally('promotion'),
    endingSoon: lines
      .filter((line) => line.status === 'live' && endingSoon(line.endsAt, now))
      .sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt))
      .slice(0, 6),
    startingSoon: lines
      .filter((line) => line.status === 'scheduled' && Date.parse(line.startsAt) - now <= 7 * 86_400_000)
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .slice(0, 6),
    content: { published, drafts },
    site: {
      stripShowing: site.visibility.announcements,
      activeAnnouncements: site.announcements.filter((item) => item.isActive).length,
      hiddenFrameRules: CHROME_PAGES.reduce(
        (count, page) => count + CHROME_PARTS.filter((part) => site.pageChrome.pages[page.key][part] !== 'all').length,
        site.pageChrome.overrides.length,
      ),
    },
  };
}
