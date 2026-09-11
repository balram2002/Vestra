import type { Metadata } from 'next';
import { Suspense } from 'react';

import { BottomNav, BottomNavBar } from '@/components/layout/bottom-nav';
import { ReelsFeed } from '@/components/live/reels-feed';
import { currentOwner } from '@/server/auth/session';
import { getBagCount } from '@/server/services/cart';
import { getReels } from '@/server/services/live';
import { getWishlistCount } from '@/server/services/wishlist';

/**
 * The reel feed.
 *
 * Lives in the immersive group, so it gets no site header and no footer — an
 * `h-dvh` scroll-snap container only works when it owns the viewport, and
 * inside the storefront shell the PAGE scrolled instead of the feed.
 *
 * It does mount the bottom bar, which the immersive layout deliberately leaves
 * out: this is a browse surface people arrive at with no destination in mind,
 * so it needs a way back out. The live room, in the same group, must not have
 * one — a "Bag" tab under a video call invites exactly the tap that ends it.
 *
 * Indexed, unlike the other live surfaces: this is a browsable view of real
 * products at real prices, with no session or shopper identity in it.
 */

export const metadata: Metadata = {
  title: 'Reels',
  description: 'Short videos from local stores. Discover and shop instantly.',
};

export default function ReelsPage() {
  return (
    <>
      <Suspense fallback={<div className="h-dvh bg-slate-950" aria-hidden />}>
        <Feed />
      </Suspense>

      {/*
        The same fallback pattern the storefront uses: the bar renders with
        nothing highlighted and no counts, so navigation works from the first
        paint and the badges simply appear rather than shifting the bar.
      */}
      <Suspense fallback={<BottomNavBar pathname={null} />}>
        <NavWithCounts />
      </Suspense>
    </>
  );
}

async function Feed() {
  const reels = await getReels();
  return <ReelsFeed reels={reels} />;
}

async function NavWithCounts() {
  const owner = await currentOwner();
  const [bagCount, wishlistCount] = await Promise.all([
    getBagCount(owner),
    getWishlistCount(owner),
  ]);

  return <BottomNav bagCount={bagCount} wishlistCount={wishlistCount} />;
}
