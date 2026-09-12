import { Suspense } from 'react';

import { BottomNav, BottomNavBar } from '@/components/layout/bottom-nav';
import { getSiteContent } from '@/server/services/site-content';
import { RouteProgress } from '@/components/layout/route-progress';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader, SiteHeaderFallback } from '@/components/layout/site-header';
import { currentOwner } from '@/server/auth/session';
import { getBagCount } from '@/server/services/cart';
import { getWishlistCount } from '@/server/services/wishlist';

/**
 * Storefront shell.
 *
 * Header and footer live here rather than in the root layout because the seller
 * and admin consoles are a different shell entirely and would have to undo this
 * one.
 *
 * The skip link is the first focusable element on every storefront page: with a
 * mega menu this size, a keyboard user would otherwise tab through eighty
 * category links before reaching the product they came for.
 */
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <RouteProgress />

      <a
        href="#main"
        className="bg-accent text-on-accent sr-only z-[70] rounded-full px-5 py-2.5 text-sm font-medium shadow-lg focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      {/* The header reads the taxonomy, so it streams rather than blocking the page. */}
      <Suspense fallback={<SiteHeaderFallback />}>
        <SiteHeader />
      </Suspense>

      {/*
        The bottom bar is fixed, so the page needs room underneath it or it
        covers the last element of every screen. Paying for that here — once,
        next to where the bar is mounted — keeps it from becoming something
        every page has to remember. The value is the bar's own token, so the two
        cannot drift.
      */}
      <main id="main" className="flex-1 pb-(--spacing-bottom-nav) lg:pb-0">
        {children}
      </main>

      <Suspense fallback={null}>
        <SiteFooter />
      </Suspense>

      {/*
        The fallback is the same bar with nothing highlighted, so it is usable
        from the first paint and never shifts when the counts land.
      */}
      <Suspense fallback={<BottomNavBar pathname={null} />}>
        <BottomNavWithCounts />
      </Suspense>
    </div>
  );
}

/**
 * The bar with live counts.
 *
 * Its own boundary so reading the session never delays the page. The fallback
 * is the same bar without numbers, so navigation is usable from the first paint
 * and the badges simply appear — the bar itself never moves.
 */
async function BottomNavWithCounts() {
  const owner = await currentOwner();
  const [bagCount, wishlistCount, hide] = await Promise.all([
    getBagCount(owner),
    getWishlistCount(owner),
    hiddenDestinations(),
  ]);

  return <BottomNav bagCount={bagCount} wishlistCount={wishlistCount} hide={hide} />;
}
/**
 * Destinations an administrator has switched off.
 *
 * Read once, next to where the bar is mounted, so "turn off Reels" removes the
 * tab, the header icon and the menu entry together. A half-hidden action is
 * worse than either state.
 */
async function hiddenDestinations(): Promise<string[]> {
  const { headerActions } = await getSiteContent();
  const hidden: string[] = [];
  if (!headerActions.reels) hidden.push('/reels');
  if (!headerActions.bag) hidden.push('/bag');
  return hidden;
}

