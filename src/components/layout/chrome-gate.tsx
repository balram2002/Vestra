'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';

import { modeAt, type ChromeMode, type PartModes } from '@/domain/page-chrome';

/**
 * One piece of the storefront frame, shown or not on the current page.
 *
 * On the client because the layout never learns the path: reading it on the
 * server would mean reading the request, and that would make every storefront
 * page dynamic for the sake of a switch most pages never touch. The slots in
 * the layout only mount a gate when some page actually changes the piece, so
 * the default frame stays in the static shell exactly as before.
 *
 * A piece limited to one kind of device is hidden with CSS, not removed:
 * `display: contents` keeps the wrapper out of layout, so a sticky header
 * inside it behaves exactly as it does without one.
 */
function Scoped({ mode, children }: { mode: ChromeMode; children: React.ReactNode }) {
  if (mode === 'desktop') return <div className="hidden lg:contents">{children}</div>;
  if (mode === 'mobile') return <div className="contents lg:hidden">{children}</div>;
  return children;
}

/**
 * `spacerModes` is the bottom bar's rules, passed only for the footer: where
 * the footer is gone on phones but the bar still is, the last thing on the
 * page needs the room the footer used to reserve under the fixed bar.
 */
export function ChromeGate({
  modes,
  spacerModes,
  children,
}: {
  modes: PartModes;
  spacerModes?: PartModes;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const mode = modeAt(pathname, modes);

  const goneOnPhones = mode === 'none' || mode === 'desktop';
  const barOnPhones = spacerModes ? modeAt(pathname, spacerModes) !== 'none' && modeAt(pathname, spacerModes) !== 'desktop' : false;
  const spacer = goneOnPhones && barOnPhones ? <div aria-hidden className="h-(--spacing-bottom-nav) lg:hidden" /> : null;

  if (mode === 'none') return spacer;
  return (
    <>
      <Scoped mode={mode}>{children}</Scoped>
      {mode === 'desktop' ? spacer : null}
    </>
  );
}

const WIDE = '(min-width: 1024px)';
/** Whether the desktop layout is showing; false while server-rendering. */
function useWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener('change', notify);
      return () => query.removeEventListener('change', notify);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

/**
 * The promotion strip, gated.
 *
 * The header slides up by the strip's height once the page scrolls, so where
 * the strip is not showing -- on this page, or at this screen size -- the
 * header must be told there is nothing to slide past, or the bar itself would
 * tuck 36px under the top of the screen.
 */
export function StripGate({ modes, children }: { modes: PartModes; children: React.ReactNode }) {
  const mode = modeAt(usePathname(), modes);
  const wide = useWide();
  const hiddenNow = mode === 'none' || (mode === 'desktop' && !wide) || (mode === 'mobile' && wide);

  useEffect(() => {
    if (!hiddenNow) return;
    const root = document.documentElement;
    root.style.setProperty('--app-strip-height', '0px');
    return () => {
      root.style.removeProperty('--app-strip-height');
    };
  }, [hiddenNow]);

  if (mode === 'none') return null;
  return <Scoped mode={mode}>{children}</Scoped>;
}
