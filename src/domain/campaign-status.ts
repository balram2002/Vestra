/**
 * Where a coupon or promotion stands, derived from its window, its switch and
 * its usage -- never stored. A campaign whose end date has passed is expired
 * whether or not anyone remembered to switch it off.
 *
 * `nowMs` is passed in: reading the clock belongs to the service layer.
 */
export type CampaignStatus = 'live' | 'scheduled' | 'paused' | 'expired' | 'exhausted';

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  live: 'Live',
  scheduled: 'Scheduled',
  paused: 'Paused',
  expired: 'Expired',
  exhausted: 'Used up',
};

export function campaignStatus(
  campaign: { isActive: boolean; startsAt: string; endsAt: string; limit?: number | null; used?: number },
  nowMs: number,
): CampaignStatus {
  if (Date.parse(campaign.endsAt) <= nowMs) return 'expired';
  if (campaign.limit != null && (campaign.used ?? 0) >= campaign.limit) return 'exhausted';
  if (!campaign.isActive) return 'paused';
  if (Date.parse(campaign.startsAt) > nowMs) return 'scheduled';
  return 'live';
}

/** Live, and ending inside the window: worth a look this week. */
export function endingSoon(endsAt: string, nowMs: number, days = 7): boolean {
  const end = Date.parse(endsAt);
  return end > nowMs && end - nowMs <= days * 86_400_000;
}
