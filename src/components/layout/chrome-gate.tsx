'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { chromePageFor, type ChromePageKey } from '@/domain/page-chrome';

/**
 * One piece of the storefront frame, shown or not on the current page.
 *
 * On the client because the layout never learns the path: reading it on the
 * server would mean reading the request, and that would make every storefront
 * page dynamic for the sake of a switch most pages never touch. The slots in
 * the layout only mount this gate when some page actually hides the piece, so
 * the default frame stays in the static shell exactly as before.
 *
 * `replacement` stands in on some of the hidden pages. The footer uses it:
 * with the footer gone but the bottom bar still fixed over the page, the last
 * thing on the page needs the room the footer used to reserve.
 */
export function ChromeGate({
  hiddenOn,
  replaceOn = [],
  replacement = null,
  children,
}: {
  hiddenOn: ChromePageKey[];
  replaceOn?: ChromePageKey[];
  replacement?: React.ReactNode;
  children: React.ReactNode;
}) {
  const page = chromePageFor(usePathname());
  if (!page || !hiddenOn.includes(page)) return children;
  return replaceOn.includes(page) ? replacement : null;
}

/**
 * The promotion strip, gated.
 *
 * The header slides up by the strip's height once the page scrolls, so a page
 * without the strip must also tell the header there is nothing to slide past --
 * otherwise the bar itself would tuck 36px under the top of the screen.
 */
export function StripGate({
  hiddenOn,
  children,
}: {
  hiddenOn: ChromePageKey[];
  children: React.ReactNode;
}) {
  const page = chromePageFor(usePathname());
  const hidden = Boolean(page && hiddenOn.includes(page));

  useEffect(() => {
    if (!hidden) return;
    const root = document.documentElement;
    root.style.setProperty('--app-strip-height', '0px');
    return () => {
      root.style.removeProperty('--app-strip-height');
    };
  }, [hidden]);

  return hidden ? null : children;
}
