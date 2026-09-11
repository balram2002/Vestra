import { TrendingDown, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * A headline figure with its trend.
 *
 * The comparison is the point. "₹4.2L this month" is not actionable on its own;
 * "₹4.2L, up 12% on last month" is. So `delta` is a required part of the design
 * rather than an optional decoration, and a metric with nothing to compare
 * against says so explicitly instead of showing a fake 0%.
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
  series,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Percentage change against the previous period. Null when unavailable. */
  delta?: number | null;
  goodDirection?: 'up' | 'down';
  /**
   * The period's values, oldest first, for the sparkline.
   *
   * Optional because not every metric has a series worth drawing — a current
   * stock count has no history, and a flat line under it is a lie about shape.
   * Fewer than three points is not a trend, so it is ignored.
   */
  series?: number[];
  className?: string;
}) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta);
  const rising = hasDelta && delta > 0;
  const flat = hasDelta && Math.round(delta * 10) === 0;
  const good = rising === (goodDirection === 'up');

  return (
    <div className={cn('border-line bg-raised relative rounded-xl border p-4 sm:p-5', className)}>
      <p className="text-faint text-2xs font-semibold uppercase tracking-[0.14em]">{label}</p>

      {/*
        The figure is the point of the card, so it gets the largest step in the
        console's type scale and nothing else on the card comes near it. Tabular
        figures are not optional here: a row of four of these is read as a
        column, and proportional digits make ₹1,11,000 and ₹4,22,000 different
        widths for the same number of characters.
      */}
      <p className="text-ink tabular mt-2.5 text-3xl font-semibold leading-none">{value}</p>

      <div className="mt-3 flex items-center gap-2">
        {hasDelta && !flat ? (
          <span
            className={cn(
              // A tinted pill rather than bare coloured text: at 13px a green
              // number and a red number are the same number to a viewer who
              // cannot separate the two hues, and the arrow plus the ground
              // carry the direction independently of the colour.
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-semibold',
              good ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700',
            )}
          >
            {rising ? (
              <TrendingUp className="size-3" aria-hidden />
            ) : (
              <TrendingDown className="size-3" aria-hidden />
            )}
            {Math.abs(delta).toFixed(1)}%
          </span>
        ) : hasDelta ? (
          <span className="text-faint text-xs">No change</span>
        ) : null}

        {hint ? <span className="text-faint truncate text-xs">{hint}</span> : null}
      </div>

      {series && series.length >= 3 ? (
        <Sparkline values={series} good={good || !hasDelta} className="mt-4" />
      ) : null}
    </div>
  );
}

/**
 * The shape of the period, drawn in about forty lines of SVG.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT RECHARTS
 * ---------------------------------------------------------------------------
 * The console already bundles Recharts for the revenue chart, so reaching for
 * it here would cost nothing extra in bytes — but it would cost the SERVER
 * BOUNDARY. Recharts is client-only, so every KPI tile on the dashboard would
 * become a client island that has to hydrate before it can draw, on a screen
 * whose entire job is to be read at a glance. A polyline needs no interaction,
 * no tooltip and no axis, so it stays a Server Component and ships as markup.
 *
 * ---------------------------------------------------------------------------
 * THE NORMALISATION
 * ---------------------------------------------------------------------------
 * The line is scaled to its OWN min and max, not to zero. A sparkline is about
 * shape, not magnitude — the magnitude is the enormous number directly above
 * it. Anchoring to zero flattens every real business series into a straight
 * line, because week-to-week revenue rarely varies by more than a few percent
 * of its own value.
 *
 * A flat series is the one case that breaks the maths: `max - min` is zero and
 * every point divides by it. That renders as a centred straight line, which is
 * both correct and the only honest picture of a metric that did not move.
 *
 * ---------------------------------------------------------------------------
 * COLOUR
 * ---------------------------------------------------------------------------
 * It follows the delta's judgement, not the line's slope, because "good" is a
 * property of the METRIC — a falling cancellation rate is a green line going
 * down. `aria-hidden` throughout: the figure and the delta beside it already
 * say everything this shows, and a screen reader has no use for a path.
 */
function Sparkline({
  values,
  good,
  className,
}: {
  values: number[];
  good: boolean;
  className?: string;
}) {
  const WIDTH = 100;
  const HEIGHT = 28;
  // Half the stroke, so the line never clips against the top or bottom edge.
  const PAD = 1.5;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * WIDTH;
    // A flat series pins to the middle rather than dividing by zero.
    const ratio = span === 0 ? 0.5 : (value - min) / span;
    const y = HEIGHT - PAD - ratio * (HEIGHT - PAD * 2);
    return [x, y] as const;
  });

  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

  // Closed back along the floor so the area under the line can be tinted.
  const area = `${line} ${WIDTH},${HEIGHT} 0,${HEIGHT}`;

  const stroke = good ? 'var(--color-success-500)' : 'var(--color-danger-500)';
  const last = points.at(-1);

  return (
    <div className={cn('relative h-7 w-full', className)} aria-hidden>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        // `none` lets the card's width drive the line while the height stays
        // fixed, which is what keeps a row of four tiles the same height.
        preserveAspectRatio="none"
        className="h-full w-full"
      >
        <polygon points={area} fill={stroke} opacity={0.1} />
        <polyline
          points={line}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          // The viewBox is stretched horizontally by `preserveAspectRatio="none"`,
          // which would stretch the stroke with it and make the line thinner on
          // a wide card. This pins the stroke to screen pixels instead.
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/*
        The end dot is HTML, not SVG, and that is not a stylistic choice.

        `preserveAspectRatio="none"` stretches the coordinate system
        horizontally, so a `<circle>` inside it paints as an ellipse — wider the
        wider the card gets. `vector-effect` rescues a stroke from that but does
        nothing for a fill. Positioning a real round element over the chart in
        percentages sidesteps the transform entirely and stays a circle at every
        width.
      */}
      {last ? (
        <span
          className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${(last[0] / WIDTH) * 100}%`,
            top: `${(last[1] / HEIGHT) * 100}%`,
            backgroundColor: stroke,
          }}
        />
      ) : null}
    </div>
  );
}
