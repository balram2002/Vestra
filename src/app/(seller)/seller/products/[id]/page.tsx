import { ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/console/page-header';
import { ListingForm } from '@/components/seller/listing-form';
import { ListingStatus } from '@/components/seller/listing-status';
import { MediaManager } from '@/components/seller/media-manager';
import { DemoProductsEditor } from '@/components/seller/demo-products-editor';
import { collections } from '@/server/db/collections';
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
  const demoProducts = await (await collections.products()).find({ sellerId: user.sellerId, status: 'PUBLISHED', _id: { $ne: product.id } }, { projection: { id: 1, title: 1 } }).sort({ title: 1 }).limit(500).toArray();

  return (
    <>
      <PageHeader
        back={{ href: '/seller/products', label: 'All products' }}
        title={product.title}
        meta={
          <>
            <StatusBadge meta={PRODUCT_STATUS_META[product.status]} size="sm" />
            <span className="text-faint font-mono text-2xs">{product.styleCode}</span>
          </>
        }
        actions={
          product.status === 'PUBLISHED' ? (
            <Button asChild size="sm" variant="secondary">
              <a href={`/product/${product.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" aria-hidden />
                View on the shop
              </a>
            </Button>
          ) : null
        }
      />

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
          <DemoProductsEditor productId={product.id} slug={product.slug} media={product.media} products={demoProducts.map((item) => ({ id: item.id, title: item.title }))} />
        </aside>
      </div>
    </>
  );
}
