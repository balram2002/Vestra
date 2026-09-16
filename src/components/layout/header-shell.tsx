'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * The sticky header's behaviour, as a client shell around server-rendered
 * chrome.
 *
 * The header itself — the wordmark, the department mega menu, the icon rail —
 * stays a Server Component. Only the three lines of scroll state live here, so
 * the eighty category links in the menu are still prerendered into the static
 * shell and served from the CDN.
 *
 * THREE STATES, ONE TRANSFORM
 *
 *   at the top      the whole header, announcement strip included
 *   scrolling up    the strip slides away, the bar stays
 *   scrolling down  the whole thing leaves
 *
 * All three are the same `translateY` on one element. That matters more than it
 * sounds: the obvious implementation collapses the strip's height, which
 * relayouts the document on every scroll direction change, and on a long
 * product grid that is a reflow of several thousand nodes. A transform on a
 * sticky element composites and touches nothing below it.
 *
 * WHY HIDE ON SCROLL AT ALL
 *
 * On a phone the header is 56px of a 640px viewport — nearly a tenth of the
 * screen, permanently, on a page whose entire job is showing photographs.
 * Giving it back while someone is reading downward and returning it the instant
 * they reach upward is the pattern every native shopping app uses, and reaching
 * upward is already what someone does when they want to navigate.
 *
 * FOUR RULES THAT KEEP IT FROM BEING ANNOYING, and each was a real bug:
 *
 *  1. It never hides near the top. Hiding within the first screen makes a small
 *     scroll feel like the page snatched the navigation away.
 *  2. It needs a real direction change, not a jitter. A trackpad emits
 *     alternating one-pixel deltas; without a threshold the bar flickers.
 *  3. It never hides while something inside it has focus. Tabbing into a
 *     search field that then slides off screen is a keyboard trap in all but
 *     name.
 *  4. It returns immediately when the page is scrolled to the very top, even if
 *     the last gesture was downward — an overscroll bounce on iOS otherwise
 *     leaves the header hidden at the top of the document.
 */
export function HeaderShell({
  children,
  /** Height of the announcement strip, in the same units as the token. */
  stripHeight = 'var(--spacing-announce)',
  className,
}: {
  children: React.ReactNode;
  stripHeight?: string;
  className?: string;
}) {
  const [atTop, setAtTop] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    let ticking = false;

    const update = () => {
      ticking = false;
      const y = window.scrollY;

      setAtTop(y <= 4);

      const delta = y - last;
      // Rule 2: ignore anything that could be a trackpad jitter or a rubber band.
      if (Math.abs(delta) < 6) return;
      last = y;

      // Rule 1: the first ~2.5 header-heights are always safe.
      setHidden(delta > 0 && y > 160);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Rule 4. `atTop` is derived from the position rather than the direction, so
  // it corrects the state a bounce left behind.
  const away = hidden && !held && !atTop;

  useEffect(() => {
    document.documentElement.style.setProperty('--app-sticky-offset', away ? '0px' : 'var(--app-header-row)');
    return () => { document.documentElement.style.removeProperty('--app-sticky-offset'); };
  }, [away]);

  return (
    <header
      /*
       * Rule 3, and it costs one handler each way. `FocusCapture` rather than
       * `onFocus` so it fires for anything focused anywhere inside, including
       * the mega menu's eighty links.
       */
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      className={cn(
        'sticky top-0 z-50 w-full',
        /*
         * ITS OWN COMPOSITING LAYER, and this is the whole fix for the stutter
         * on the first scroll.
         *
         * The bar is glass: a 20px `backdrop-filter` over whatever is behind
         * it. Moving a blurred element without a promoted layer makes the
         * browser re-read and re-blur the page underneath on every frame, and
         * the first scroll also pays to create that layer -- which is exactly
         * when it was felt. `transform-gpu` and `will-change` hand it a layer
         * up front, so the scroll only moves a texture that is already drawn.
         */
        'transform-gpu will-change-transform',
        'transition-transform duration-(--duration-base) ease-(--ease-out)',
        // The border and the shadow only exist once there is something
        // underneath to separate from. At the top of the page the header should
        // read as part of the page, not as a bar bolted onto it.
        !atTop && 'border-line border-b shadow-sm',
        className,
      )}
      style={{
        transform: away
          ? 'translateY(-100%)'
          : atTop
            ? 'translateY(0)'
            : `translateY(calc(-1 * ${stripHeight}))`,
      }}
      data-state={away ? 'away' : atTop ? 'top' : 'stuck'}
    >
      {children}
    </header>
  );
}
