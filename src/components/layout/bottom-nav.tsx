'use client';

import { Clapperboard, Home, LayoutGrid, ShoppingBag, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { CountBubble } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { isImmersivePath } from '@/lib/immersive';

/**
 * Mobile bottom navigation.
 *
 * On a phone the top of the screen is the hardest place to reach and the
 * easiest to lose — a header scrolls away, and the five things people actually
 * move between were behind a hamburger. This puts them under the thumb, where
 * every native shopping app has trained people to look.
 *
 * Five destinations and no more. A sixth turns a bar into a menu, and the
 * targets get too narrow to hit without looking.
 *
 * THE ACTIVE STATE is a pill that TRAVELS between destinations rather than a
 * colour that switches. One element, one `translateX`, positioned by fraction
 * of the bar — so it needs no measurement, no `ResizeObserver`, and no layout
 * read. The travel is what makes a tap feel connected to the tab it came from;
 * a colour swap reads as two unrelated events.
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
  /** Also treat these prefixes as "here", so a PDP still lights Shop. */
  matches?: string[];
}

/*
 * Five destinations, and five is the ceiling.
 *
 * A sixth tab on a 320px screen gives every item 53px, which is under the touch
 * minimum before any padding — so adding Reels meant taking something out
 * rather than squeezing everything.
 *
 * SAVED came out. It is one tap from Account, it is the least used of the five
 * on any storefront, and unlike the others it has no state a shopper is midway
 * through. Reels earns the slot because it is a browse surface people open with
 * no destination in mind, which is exactly what a bottom tab is for — and
 * because it is the entry point to live commerce for anyone not already looking
 * at a product.
 */
const DESTINATIONS: Destination[] = [
  { href: '/', label: 'Home', icon: Home },
  {
    href: '/categories',
    label: 'Shop',
    icon: LayoutGrid,
    matches: ['/category', '/product', '/search', '/brands', '/brand', '/stores', '/store'],
  },
  { href: '/reels', label: 'Reels', icon: Clapperboard, matches: ['/live'] },
  { href: '/bag', label: 'Bag', icon: ShoppingBag, matches: ['/checkout'] },
  { href: '/account', label: 'Account', icon: User, matches: ['/orders', '/wishlist'] },
];

/**
 * The bar itself, with no hooks.
 *
 * Split from the pathname lookup because `usePathname()` makes its whole
 * subtree dynamic under Cache Components, and a bar rendered in a Suspense
 * FALLBACK cannot read it at all — the fallback stands in for the boundary, so
 * it is outside it. Taking `pathname` as a prop lets the same bar render during
 * prerender with nothing highlighted, then again with the current route once it
 * is known.
 */
export function BottomNavBar({
  pathname,
  bagCount = 0,
  wishlistCount = 0,
  hide = [],
}: {
  pathname: string | null;
  bagCount?: number;
  wishlistCount?: number;
  /**
   * Destinations an administrator has switched off, by href.
   *
   * The bar reflows around what is left rather than leaving a gap: four tabs
   * on a phone are wider and easier to hit than five, which is the whole
   * reason turning one off is worth doing.
   */
  hide?: string[];
}) {
  const shown = DESTINATIONS.filter((destination) => !hide.includes(destination.href));

  const isActive = (destination: Destination) => {
    if (!pathname) return false;
    if (destination.href === '/') return pathname === '/';
    if (pathname.startsWith(destination.href)) return true;
    return (destination.matches ?? []).some((prefix) => pathname.startsWith(prefix));
  };

  const activeIndex = DESTINATIONS.findIndex(isActive);

  /*
   * The saved count moved to Account along with the destination itself.
   *
   * When Saved lost its tab to Reels, this mapping still pointed at `/wishlist`
   * — a href no tab renders — so the count silently stopped appearing anywhere.
   * A number that is fetched on every page and shown on none is worse than not
   * fetching it: it is a bag badge's worth of work for nothing.
   *
   * Account now carries it, which is where the wishlist itself lives.
   */
  const countFor = (href: string) =>
    href === '/bag' ? bagCount : href === '/account' ? wishlistCount : 0;

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'bg-raised border-line fixed inset-x-0 bottom-0 z-40 border-t shadow-[0_-6px_22px_rgba(0,0,0,0.05)]',
        'pb-[env(safe-area-inset-bottom)] lg:hidden',
      )}
    >
      <ul className="relative flex items-stretch">
        {/*
          The travelling pill.

          Hidden until a destination actually matches, so the prerendered bar
          does not flash a highlight on "Home" before the route is known.
        */}
        {activeIndex >= 0 ? (
          <li
            aria-hidden
            className={cn(
              'bg-sunken pointer-events-none absolute inset-y-1.5 left-0 rounded-xl',
              'transition-transform duration-(--duration-slow) ease-(--ease-spring)',
            )}
            style={{
              width: `${100 / DESTINATIONS.length}%`,
              transform: `translateX(${activeIndex * 100}%)`,
            }}
          />
        ) : null}

        {shown.map((destination) => {
          const active = isActive(destination);
          const Icon = destination.icon;
          const count = countFor(destination.href);

          return (
            <li key={destination.href} className="relative flex-1">
              {/*
                An anchor for immersive destinations, a `<Link>` for the rest.

                `/reels` lives in the immersive route group, and a soft
                navigation into it leaves the storefront's header, footer and
                bottom bar mounted around the feed — two navigation bars on one
                screen. See `lib/immersive`.
              */}
              <NavTarget
                href={destination.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-(--spacing-bottom-nav) flex-col items-center justify-center gap-1 text-2xs',
                  'font-medium transition-colors duration-(--duration-base)',
                  'focus-visible:outline-accent focus-visible:-outline-offset-2 focus-visible:outline-2',
                  'focus-visible:rounded-xl',
                  active ? 'text-ink' : 'text-faint',
                )}
              >
                <span className="relative">
                  <Icon
                    className="size-[1.3rem]"
                    /*
                     * A heavier stroke reads as "you are here" faster than
                     * colour alone, survives bright sunlight, and works for a
                     * viewer who cannot separate the two colours at all.
                     */
                    strokeWidth={active ? 2.4 : 1.8}
                    aria-hidden
                  />
                  <CountBubble count={count} className="absolute -right-2.5 -top-1.5" aria-hidden />
                </span>
                {destination.label}
                {/*
                  The count needs a NOUN now that two tabs can carry one.
                  
                  "Account, 3 items" is ambiguous the moment the badge stopped
                  being only the bag's; "Account, 3 saved items" is not.
                */}
                {count > 0 ? (
                  <span className="sr-only">
                    , {count} {destination.href === '/bag' ? 'items in your bag' : 'saved items'}
                  </span>
                ) : null}
              </NavTarget>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * A `<Link>`, unless the destination is in another route group.
 *
 * See `lib/immersive`: crossing a group boundary softly renders the new layout
 * INSIDE the old one, so those destinations need a document navigation and a
 * plain anchor is exactly that.
 */
function NavTarget({
  href,
  children,
  ...props
}: { href: string; children: React.ReactNode } & React.ComponentProps<'a'>) {
  if (isImmersivePath(href)) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
}

/**
 * The bar, wired to the current route.
 *
 * Kept separate so the layout can render `BottomNavBar` directly as a fallback.
 */
export function BottomNav(props: {
  bagCount?: number;
  wishlistCount?: number;
  hide?: string[];
}) {
  const pathname = usePathname();
  return <BottomNavBar pathname={pathname} {...props} />;
}
