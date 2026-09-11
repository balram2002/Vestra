import { cn } from '@/lib/cn';

/**
 * Progress and meters.
 *
 * Two different things that look the same and are not:
 *
 *   Progress   a task advancing towards completion — an upload, an onboarding
 *              flow, a settlement run. `role="progressbar"`.
 *   Meter      a measurement within a known range — stock remaining, rating
 *              distribution, quota used. `role="meter"`.
 *
 * Announcing a stock bar as a progressbar tells a screen-reader user that
 * something is loading and will finish, which is a lie about a static fact.
 * That is the entire reason these are two exports and not one prop.
 *
 * Both are Server Components: a width is a style, not state.
 */

const TONE = {
  accent: 'bg-accent',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  ink: 'bg-ink',
} as const;

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

export function Progress({
  value,
  max = 100,
  label,
  tone = 'accent',
  size = 'md',
  showValue = false,
  className,
}: {
  value: number;
  max?: number;
  /** Required for assistive tech. There is no such thing as an unnamed progress bar. */
  label: string;
  tone?: keyof typeof TONE;
  size?: 'sm' | 'md';
  showValue?: boolean;
  className?: string;
}) {
  const percent = clamp(value, max);

  return (
    <div className={className}>
      {showValue ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <span className="text-muted text-xs">{label}</span>
          <span className="tabular text-ink text-xs font-medium">{Math.round(percent)}%</span>
        </div>
      ) : null}

      <div
        role="progressbar"
        aria-label={showValue ? undefined : label}
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          'bg-sunken w-full overflow-hidden rounded-full',
          size === 'sm' ? 'h-1' : 'h-1.5',
        )}
      >
        {/*
          Scaled on the X axis rather than sized by `width`.

          A width transition relayouts the bar and everything after it on every
          frame; a transform composites. `origin-left` is the half people forget
          — without it the bar grows outward from its centre.
        */}
        <div
          className={cn(
            'h-full w-full origin-left rounded-full',
            'transition-transform duration-(--duration-slow) ease-(--ease-out)',
            TONE[tone],
          )}
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </div>
    </div>
  );
}

export function Meter({
  value,
  max = 100,
  label,
  tone = 'ink',
  size = 'md',
  className,
}: {
  value: number;
  max?: number;
  label: string;
  tone?: keyof typeof TONE;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const percent = clamp(value, max);

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn(
        'bg-sunken w-full overflow-hidden rounded-full',
        size === 'sm' ? 'h-1' : 'h-1.5',
        className,
      )}
    >
      <div
        className={cn(
          'h-full w-full origin-left rounded-full',
          'transition-transform duration-(--duration-slow) ease-(--ease-out)',
          TONE[tone],
        )}
        style={{ transform: `scaleX(${percent / 100})` }}
      />
    </div>
  );
}

/**
 * An indeterminate bar, for work whose duration is unknown.
 *
 * Never shows a percentage, because it does not have one — a bar that
 * pretends to know how far along an unbounded task is teaches people the
 * progress readouts are decoration. `aria-busy` on the region says the same
 * thing without inventing a number.
 */
export function ProgressIndeterminate({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-busy
      className={cn('bg-sunken relative h-1 w-full overflow-hidden rounded-full', className)}
    >
      <div className="bg-accent absolute inset-y-0 w-1/3 rounded-full motion-safe:animate-[mrd-sheen_1.4s_var(--ease-in-out)_infinite]" />
    </div>
  );
}
