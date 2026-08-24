import { TrendingDown, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * A headline figure with its trend.
 *
 * The comparison is the point. "₹4.2L this month" is not actionable on its
 * own; "₹4.2L, up 12% on last month" is. So `delta` is a required part of the
 * design rather than an optional decoration, and a metric with nothing to
 * compare against says so explicitly instead of showing a fake 0%.
 *
 * Direction is not assumed to be good: a rise in cancellations is bad, and
 * `goodDirection` lets the caller say which way is up for that metric.
 */
export function StatCard({
  label,
  value,
  hint,
  delta,
  goodDirection = 'up',
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Percentage change against the previous period. Null when unavailable. */
  delta?: number | null;
  goodDirection?: 'up' | 'down';
  className?: string;
}) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta);
  const rising = hasDelta && delta > 0;
  const flat = hasDelta && Math.round(delta * 10) === 0;
  const good = rising === (goodDirection === 'up');

  return (
    <div className={cn('border-line bg-raised rounded-lg border p-4', className)}>
      <p className="text-faint text-2xs font-medium uppercase tracking-[0.12em]">{label}</p>

      <p className="text-ink tabular mt-2 text-2xl font-semibold leading-none">{value}</p>

      <div className="mt-2.5 flex items-center gap-1.5">
        {hasDelta && !flat ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-medium',
              good ? 'text-success-600' : 'text-danger-600',
            )}
          >
            {rising ? (
              <TrendingUp className="size-3.5" aria-hidden />
            ) : (
              <TrendingDown className="size-3.5" aria-hidden />
            )}
            {Math.abs(delta).toFixed(1)}%
          </span>
        ) : hasDelta ? (
          <span className="text-faint text-xs">No change</span>
        ) : null}

        {hint ? <span className="text-faint truncate text-xs">{hint}</span> : null}
      </div>
    </div>
  );
}
