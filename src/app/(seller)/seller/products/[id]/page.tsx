import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { ListingForm } from '@/components/seller/listing-form';
import { ListingStatus } from '@/components/seller/listing-status';
import { MediaManager } from '@/components/seller/media-manager';
import { VariantGrid } from '@/components/seller/variant-grid';
import { StatusBadge } from '@/components/ui/badge';
import { PRODUCT_STATUS_META } from '@/domain/enums';
import { requireSeller } from '@/server/auth/session';
import { authoringOptions, blockersFor, getSellerProduct } from '@/server/services/authoring';

export const metadata: Metadata = { title: 'Listing' };

/**
 * The listing editor.
 *
 * Four independent panels, each saving on its own. A seller correcting a price
 * should not have to re-submit their description, and an upload that fails
 * should not take the rest of the form with it.
 */
export default function SellerListingPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="skeleton h-[36rem] rounded-lg" aria-hidden />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireSeller()]);

  // Scoped to the seller in the query: another store's listing simply does not
  // exist here, so a guessed id is a 404 rather than a permission message.
  const product = await getSellerProduct(user.sellerId, id);
  if (!product) notFound();

  const [options, blockers] = await Promise.all([
    authoringOptions(user.sellerId),
    blockersFor(product),
  ]);

  return (
    <>
      <nav className="text-2xs mb-3">
        <Link href="/seller/products" className="text-muted hover:text-ink">
          ← All products
        </Link>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-ink truncate text-xl">{product.title}</h1>
          <p className="text-faint mt-1 font-mono text-2xs">{product.styleCode}</p>
        </div>
        <div className="flex items-center gap-3">
          {product.status === 'PUBLISHED' ? (
            <a
              href={`/product/${product.slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-muted hover:text-ink text-2xs underline-offset-2 hover:underline"
            >
              View on the shop
            </a>
          ) : null}
          <StatusBadge meta={PRODUCT_STATUS_META[product.status]} size="sm" />
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <ListingForm
            product={product}
            brands={options.brands}
            categories={options.categories}
          />

          <VariantGrid
            productId={product.id}
            variants={product.variants}
            sizeSystem={product.sizeSystem}
          />
        </div>

        <aside className="space-y-6">
          <ListingStatus
            productId={product.id}
            status={product.status}
            blockers={blockers}
            rejectionReason={product.rejectionReason}
          />

          <MediaManager productId={product.id} media={product.media} />
        </aside>
      </div>
    </>
  );
}
