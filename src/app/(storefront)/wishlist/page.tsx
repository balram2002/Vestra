import { Heart } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { ProductGrid } from '@/components/commerce/product-grid';
import { ProductGridSkeleton } from '@/components/skeletons/product-card-skeleton';
import { Button } from '@/components/ui/button';
import { currentOwner } from '@/server/auth/session';
import { getWishlistView } from '@/server/services/wishlist';

export const metadata: Metadata = {
  title: 'Your wishlist',
  robots: { index: false, follow: false },
};

/**
 * Wishlist.
 *
 * Per-visitor, so the contents stream behind `<Suspense>` while the heading
 * renders immediately.
 */
export default function WishlistPage() {
  return (
    <div className="gutter shell-max py-6">
      <h1 className="font-display text-ink text-2xl">Your wishlist</h1>

      <Suspense fallback={<ProductGridSkeleton className="mt-6" count={10} />}>
        <WishlistContents />
      </Suspense>
    </div>
  );
}

async function WishlistContents() {
  const owner = await currentOwner();
  const products = await getWishlistView(owner);

  if (products.length === 0) {
    return (
      <div className="border-line mt-8 flex flex-col items-center rounded-lg border border-dashed px-6 py-20 text-center">
        <Heart className="text-faint size-9" aria-hidden />
        <h2 className="text-ink mt-4 text-lg font-semibold">Nothing saved yet</h2>
        <p className="text-muted mt-1.5 max-w-sm text-sm">
          Tap the heart on anything you like and it will wait for you here — we will tell you if
          the price drops.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Start browsing</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <p className="text-muted mt-1 text-sm">
        {products.length} {products.length === 1 ? 'item' : 'items'}
      </p>
      <div className="mt-6">
        <ProductGrid products={products} />
      </div>
    </>
  );
}
