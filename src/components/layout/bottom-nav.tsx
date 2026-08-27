'use client';

import { Heart, Home, LayoutGrid, ShoppingBag, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

/**
 * Mobile bottom navigation.
 *
 * On a phone the top of the screen is the hardest place to reach and the
 * easiest to lose: a header scrolls away, and the five things people actually
 * move between were behind a hamburger. This puts them under the thumb, where
 * every native shopping app has trained people to look.
 *
 * Five destinations and no more. A sixth turns a bar into a menu, and the
 * targets get too narrow to hit without looking.
 *
 * Two details that are easy to miss and obvious once wrong:
 *
 *   - `pb-[env(safe-area-inset-bottom)]` keeps the row clear of the home
 *     indicator on a notched phone, where otherwise the last few pixels of the
 *     bar are simply not tappable.
 *   - The page needs matching bottom padding or the bar covers the final
 *     element of every screen. That lives in the storefront layout, next to
 *     where this is mounted, rather than being every page's problem.
 */

interface Destination {
  href: string;
  label: string;
  icon: typeof Home;
  /** Also treat these prefixes as "here", so a PDP still lights Categories. */
  matches?: string[];
}

const DESTINATIONS: Destination[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/categories', label: 'Shop', icon: LayoutGrid, matches: ['/category', '/product', '/search'] },
  { href: '/wishlist', label: 'Saved', icon: Heart },
  { href: '/bag', label: 'Bag', icon: ShoppingBag, matches: ['/checkout'] },
  { href: '/account', label: 'Account', icon: User, matches: ['/orders'] },
];

/**
 * The bar itself, with no hooks.
 *
 * Split from the pathname lookup because `usePathname()` makes its whole
 * subtree dynamic under Cache Components, and a bar rendered in a Suspense
 * FALLBACK cannot read it at all — the fallback is what stands in for the
 * boundary, so it is outside it. Taking `pathname` as a prop lets the same bar
 * render during prerender with nothing highlighted, then again with the
 * current route once it is known.
 */
export function BottomNavBar({
  pathname,
  bagCount = 0,
  wishlistCount = 0,
}: {
  pathname: string | null;
  bagCount?: number;
  wishlistCount?: number;
}) {
  const isActive = (destination: Destination) => {
    if (!pathname) return false;
    if (destination.href === '/') return pathname === '/';
    if (pathname.startsWith(destination.href)) return true;
    return (destination.matches ?? []).some((prefix) => pathname.startsWith(prefix));
  };

  const countFor = (href: string) =>
    href === '/bag' ? bagCount : href === '/wishlist' ? wishlistCount : 0;

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'border-line bg-raised/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-md',
        'pb-[env(safe-area-inset-bottom)] lg:hidden',
      )}
    >
      <ul className="flex items-stretch">
        {DESTINATIONS.map((destination) => {
          const active = isActive(destination);
          const Icon = destination.icon;
          const count = countFor(destination.href);

          return (
            <li key={destination.href} className="flex-1">
              <Link
                href={destination.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-14 flex-col items-center justify-center gap-0.5 text-2xs font-medium transition-colors',
                  'focus-visible:outline-accent focus-visible:-outline-offset-2 focus-visible:outline-2',
                  active ? 'text-ink' : 'text-faint',
                )}
              >
                <span className="relative">
                  <Icon
                    className="size-[1.3rem]"
                    // A filled icon reads as "you are here" faster than colour
                    // alone, and survives being looked at in bright sun.
                    strokeWidth={active ? 2.4 : 1.8}
                    aria-hidden
                  />
                  {count > 0 ? (
                    <span
                      className="bg-accent text-on-inverse absolute -right-2 -top-1 grid min-w-4 place-items-center rounded-full px-1 text-[0.6rem] font-semibold leading-4"
                      aria-hidden
                    >
                      {count > 9 ? '9+' : count}
                    </span>
                  ) : null}
                </span>
                {destination.label}
                {count > 0 ? <span className="sr-only">, {count} items</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The bar, wired to the current route.
 *
 * Kept separate so the layout can render `BottomNavBar` directly as a fallback.
 */
export function BottomNav(props: { bagCount?: number; wishlistCount?: number }) {
  const pathname = usePathname();
  return <BottomNavBar pathname={pathname} {...props} />;
}
