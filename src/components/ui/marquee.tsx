import { cn } from '@/lib/cn';

/**
 * Marquee.
 *
 * A single-row ticker for site-wide promises: free delivery, returns window,
 * verified sellers. Used once, in the announcement strip above the header.
 *
 * This is one of the very few places auto-motion is defensible, and it is
 * defensible only because of how it is built:
 *
 *  - the content is DUPLICATED and the track translates by exactly -50%, so the
 *    loop is seamless with no measurement, no JavaScript and no reflow;
 *  - the duplicate is `aria-hidden`, so the promises are announced once rather
 *    than twice — the commonest bug in every marquee implementation;
 *  - it PAUSES ON HOVER, so anything worth reading can be read;
 *  - under `prefers-reduced-motion` the animation is disabled by the global
 *    rule, and the track is `flex-wrap` there so the content is still fully
 *    readable rather than clipped at whatever frame it stopped on.
 *
 * It is a Server Component. There is no state here — the whole effect is one
 * keyframe on a transform.
 */
/**
 * Where the list stops moving and simply sits still.
 *
 * The announcement strip is on EVERY page and never goes away, so permanent
 * motion at the top of the viewport is a real cost — it is exactly the kind of
 * ambient movement that makes a page tiring to read. Above this width the whole
 * list fits, so there is nothing to scroll and the marquee becomes decoration
 * with a downside and no upside. It stops.
 *
 * Below it, the list genuinely does not fit, and scrolling is the only way to
 * show the fourth promise at all.
 */
const STATIC_FROM = {
  never: '',
  sm: 'sm:w-full sm:animate-none sm:flex-wrap sm:justify-center',
  md: 'md:w-full md:animate-none md:flex-wrap md:justify-center',
  lg: 'lg:w-full lg:animate-none lg:flex-wrap lg:justify-center',
} as const;

const HIDE_CLONE_FROM = {
  never: '',
  sm: 'sm:hidden',
  md: 'md:hidden',
  lg: 'lg:hidden',
} as const;

export function Marquee({
  items,
  speed = 42,
  className,
  separator = '·',
  staticFrom = 'never',
}: {
  items: React.ReactNode[];
  /** Seconds for one full pass. Longer is slower. */
  speed?: number;
  className?: string;
  separator?: string;
  /** Breakpoint at which the list stops moving because it already fits. */
  staticFrom?: keyof typeof STATIC_FROM;
}) {
  if (items.length === 0) return null;

  const row = (hidden: boolean) => (
    <ul
      className="flex shrink-0 items-center gap-8 px-4"
      aria-hidden={hidden || undefined}
    >
      {items.map((item, index) => (
        <li key={index} className="flex shrink-0 items-center gap-8">
          {item}
          <span aria-hidden className="text-current/40">
            {separator}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div
      className={cn(
        'group relative flex overflow-hidden',
        // Dissolve at both edges so items enter and leave rather than being
        // sliced off by the viewport. Pointless once the row is static, and the
        // mask would then clip the first and last promise permanently.
        staticFrom === 'never' ? 'fade-edges-x' : 'fade-edges-x md:mask-none',
        className,
      )}
    >
      <div
        className={cn(
          'flex w-max',
          'motion-safe:animate-[mrd-marquee_linear_infinite]',
          // Hovering to read must stop it. Without this the promise someone is
          // halfway through reading slides away.
          'motion-safe:group-hover:[animation-play-state:paused]',
          // Under reduced motion the track is static, so it must be allowed to
          // wrap or the tail of the list is simply unreachable.
          'motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center',
          STATIC_FROM[staticFrom],
        )}
        style={{ animationDuration: `${speed}s` }}
      >
        {row(false)}
        {/*
          The seamless half.

          Hidden from assistive tech always, and removed entirely wherever the
          track is static — a duplicate list sitting beside a stationary one is
          just the promises printed twice.
        */}
        <div className={cn('flex motion-reduce:hidden', HIDE_CLONE_FROM[staticFrom])}>
          {row(true)}
        </div>
      </div>
    </div>
  );
}
