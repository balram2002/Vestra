import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageHeader } from '@/components/console/page-header';
import { QuickListingForm } from '@/components/seller/quick-listing-form';
import { mediaRole } from '@/domain/media';
import { requireSeller } from '@/server/auth/session';
import { collections, toEntity } from '@/server/db/collections';
import { startListing } from '@/server/services/authoring';
import { listingOptions } from '@/server/services/catalog-authoring';

export const metadata: Metadata = { title: 'Add a product' };

/**
 * Add a product.
 *
 * One screen, ending in something that is in the shop. It used to be a draft,
 * a separate media step, a separate size grid and then a review queue -- four
 * stages before a seller's first product could be bought, and three of them
 * existed because the fourth did.
 */
export default function NewListingPage() {
  return (
    <>
      <PageHeader
        back={{ href: '/seller/products', label: 'All products' }}
        title="Add a product"
        description="A name, a price, a photo and it is live. Everything else can follow."
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <Form />
      </Suspense>
    </>
  );
}

async function Form() {
  const user = await requireSeller();

  /*
   * The draft is claimed BEFORE the form renders, because files have to belong
   * to something to be stored against it -- and `startListing` reuses this
   * seller's blank draft, so opening the page twice claims the same one.
   */
  const [started, options] = await Promise.all([startListing(user.sellerId), listingOptions()]);

  if (!started.ok || !started.productId) {
    return (
      <p className="border-line text-muted mt-6 rounded-lg border border-dashed px-4 py-8 text-sm">
        {started.error ?? 'A listing could not be started. Try again in a moment.'}
      </p>
    );
  }

  // A reused draft may already carry files from the last attempt.
  const products = await collections.products();
  const draft = toEntity(await products.findOne({ _id: started.productId }));

  return (
    <QuickListingForm
      productId={started.productId}
      brands={options.brands}
      categories={options.categories}
      parents={options.parents}
      media={(draft?.media ?? []).map((asset) => ({
        id: asset.id,
        url: asset.url,
        kind: asset.kind,
        role: mediaRole(asset),
      }))}
      doneHref="/seller/products"
    />
  );
}
