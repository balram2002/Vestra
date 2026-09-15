'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * Marquee.
 *
 * A single-row ticker for site-wide promises: free delivery, returns window,
 * verified sellers. Used in the announcement strip above the header.
 *
 * IT MOVES ONLY WHEN IT HAS TO, and that is measured rather than guessed. The
 * old version stopped at a breakpoint on the theory that the list always fits
 * on a desktop -- which is true of four short promises and false of five, or of
 * one long one, or of any translation. So it measures the row against the space
 * it has: wider, and it scrolls; narrower, and it sits still, CENTRED.
 *
 * Centred matters. A strip of three promises pinned to the left edge of a
 * 1600px screen reads as a mistake, and that is exactly what it looked like.
 *
 * SPEED IS PIXELS PER SECOND, not a fixed duration. A duration makes a long
 * list race and a short list crawl; a velocity reads the same whatever the
 * content, at any width.
 *
 * The rest is what makes an auto-scrolling strip defensible at all: the
 * duplicate half is `aria-hidden`, so the promises are announced once rather
 * than twice; it pauses on hover so anything worth reading can be read; and
 * under `prefers-reduced-motion` it never animates, wrapping instead so the
 * tail of the list stays reachable.
 */
export function Marquee({
  items,
  pixelsPerSecond = 60,
  className,
  separator = '·',
}: {
  items: React.ReactNode[];
  /** Travel speed. Higher is faster; the duration follows the content's width. */
  pixelsPerSecond?: number;
  className?: string;
  separator?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLUListElement>(null);
  const [travel, setTravel] = useState(0);

  /*
   * Does the row need to move?
   *
   * Measured on mount and on every resize, because the answer changes with the
   * window, with a font swap, and with whatever an administrator just typed
   * into the strip. `travel` doubles as the flag and as the distance: zero
   * means it fits.
   */
  useEffect(() => {
    const box = viewport.current;
    const list = row.current;
    if (!box || !list) return;

    const measure = () => {
      const overflowing = list.scrollWidth > box.clientWidth + 1;
      setTravel(overflowing ? list.scrollWidth : 0);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(list);
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  const moving = travel > 0;

  const list = (ref: React.Ref<HTMLUListElement> | undefined, clone: boolean) => (
    <ul
      ref={ref}
      className="flex shrink-0 items-center gap-8 px-4"
      aria-hidden={clone || undefined}
    >
      {items.map((item, index) => (
        <li key={index} className="flex shrink-0 items-center gap-8">
          {item}
          {/* The separator after the last item is what makes the loop read as
              continuous rather than as two lists butted together. It is dropped
              when the row is still, where it would be a full stop nobody asked
              for. */}
          {moving || index < items.length - 1 ? (
            <span aria-hidden className="text-current/40">
              {separator}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );

  return (
    <div
      ref={viewport}
      className={cn(
        'group relative flex w-full overflow-hidden',
        // Dissolve at both edges so items enter and leave rather than being
        // sliced off. Pointless when the row is still, where the mask would
        // permanently clip the first and last promise.
        moving ? 'fade-edges-x' : null,
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center',
          moving
            ? [
                'w-max motion-safe:animate-[mrd-marquee_linear_infinite]',
                // Hovering to read must stop it: without this the promise
                // someone is halfway through slides away.
                'motion-safe:group-hover:[animation-play-state:paused]',
                // Reduced motion gets the full list, wrapped and still.
                'motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center',
              ]
            : 'w-full justify-center',
        )}
        style={moving ? { animationDuration: `${travel / pixelsPerSecond}s` } : undefined}
      >
        {list(row, false)}
        {moving ? <div className="flex motion-reduce:hidden">{list(undefined, true)}</div> : null}
      </div>
    </div>
  );
}
