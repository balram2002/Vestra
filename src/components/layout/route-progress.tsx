'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

/**
 * Top-of-page navigation progress.
 *
 * The brief asks for both this and per-link `useLinkStatus` indicators, and
 * they genuinely do different jobs: `useLinkStatus` tells you *which* link you
 * clicked is working, this tells you the *page* is working. On a slow route the
 * per-link spinner scrolls out of view; this does not.
 *
 * Implemented directly rather than pulled from a package because the behaviour
 * that matters is subtle:
 *
 *  - it only appears after a short delay, so a fast cached navigation does not
 *    flash a bar and make an instant transition feel slower than it was;
 *  - it eases towards 90% and waits there, because a bar that completes before
 *    the page does is a lie;
 *  - it is `aria-hidden` and paired with a polite live region, so a screen
 *    reader hears "Loading" once instead of tracking a percentage.
 */
function RouteProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const first = useRef(true);

  // A completed navigation is observable as a pathname change; that is the
  // signal to finish the bar.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }

    setState('done');
    const timer = setTimeout(() => setState('idle'), 320);
    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  // Start the bar on any link click that will actually navigate.
  useEffect(() => {
    let delay: ReturnType<typeof setTimeout>;

    const onClick = (event: MouseEvent) => {
      // Modifier-clicks open a new tab; nothing is loading in this one.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (event.button !== 0) return;

      const anchor = (event.target as HTMLElement | null)?.closest('a');
      if (!anchor) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same page: no navigation will occur, so no progress should show.
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      // 140ms is roughly the point where a transition stops feeling instant.
      delay = setTimeout(() => setState('loading'), 140);
    };

    document.addEventListener('click', onClick, { capture: true });
    return () => {
      clearTimeout(delay);
      document.removeEventListener('click', onClick, { capture: true });
    };
  }, []);

  if (state === 'idle') return null;

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden"
      >
        <div
          className="bg-accent h-full w-full origin-left"
          style={
            state === 'loading'
              ? { animation: 'route-progress 8s cubic-bezier(0.22, 1, 0.36, 1) forwards' }
              : { transform: 'translateX(0)', transition: 'transform 220ms ease-out' }
          }
        />
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {state === 'loading' ? 'Loading page' : 'Page loaded'}
      </span>
    </>
  );
}

/**
 * `useSearchParams` needs a Suspense boundary, and wrapping it here keeps every
 * consumer from having to remember that.
 */
export function RouteProgress() {
  return (
    <Suspense fallback={null}>
      <RouteProgressInner />
    </Suspense>
  );
}
