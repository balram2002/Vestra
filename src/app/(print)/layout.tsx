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
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="bg-canvas min-h-full">{children}</div>;
}
