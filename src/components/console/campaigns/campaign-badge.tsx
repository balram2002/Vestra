import { Badge } from '@/components/ui/badge';
import { CAMPAIGN_STATUS_LABEL, type CampaignStatus } from '@/domain/campaign-status';

const TONE = {
  live: 'success',
  scheduled: 'info',
  paused: 'warning',
  expired: 'neutral',
  exhausted: 'neutral',
} as const satisfies Record<CampaignStatus, string>;

/** Where a coupon or promotion stands, in the same colours everywhere. */
export function CampaignBadge({ status, archived = false }: { status: CampaignStatus; archived?: boolean }) {
  if (archived) {
    return (
      <Badge tone="neutral" size="sm">
        Archived
      </Badge>
    );
  }
  return (
    <Badge tone={TONE[status]} size="sm">
      {CAMPAIGN_STATUS_LABEL[status]}
    </Badge>
  );
}

/** Used against the limit, as a thin bar. Nothing to draw when unlimited. */
export function UsageMeter({ used, limit }: { used: number; limit: number | null }) {
  const share = limit ? Math.min(1, used / limit) : 0;
  return (
    <span className="inline-flex min-w-16 flex-col items-end gap-1">
      <span className="text-ink tabular text-xs">
        {used.toLocaleString('en-IN')}
        {limit ? <span className="text-faint"> / {limit.toLocaleString('en-IN')}</span> : null}
      </span>
      {limit ? (
        <span className="bg-sunken block h-1 w-16 overflow-hidden rounded-full" aria-hidden>
          <span
            className={share >= 0.9 ? 'bg-warning-fill block h-full' : 'bg-accent block h-full'}
            style={{ width: `${Math.max(4, share * 100)}%` }}
          />
        </span>
      ) : null}
    </span>
  );
}
