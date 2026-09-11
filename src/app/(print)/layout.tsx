import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Print surface.
 *
 * A separate route group purely to escape the console shell. A shipping label
 * printed with a sidebar and a nav bar down the side wastes most of a 4×6
 * thermal sticker, and a nested layout cannot remove a parent one — a sibling
 * group is the documented way out.
 *
 * Everything here is designed for paper first and screen second.
 *
 * **It does not follow the theme, and that is the point.** An invoice and a
 * shipping label are documents, not UI: they are ink on paper whichever way the
 * viewer has their screen set. The ground used to be `bg-canvas`, which flips
 * to near-black in dark mode, while everything drawn on it is fixed light-mode
 * neutrals — so a seller who prefers a dark console opened an invoice and got
 * dark grey text on a near-black page. Committing to white here is both the
 * correct document design and the fix.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-white text-neutral-900 [color-scheme:light]">{children}</div>
  );
}
