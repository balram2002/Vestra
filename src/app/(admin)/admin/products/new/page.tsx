import { Store } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { PageHeader } from '@/components/console/page-header';
import { QuickListingForm } from '@/components/seller/quick-listing-form';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { mediaRole } from '@/domain/media';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntity } from '@/server/db/collections';
import { startListing } from '@/server/services/authoring';
import { listingOptions } from '@/server/services/catalog-authoring';

export const metadata: Metadata = { title: 'Add a product' };

/**
 * Staff adding a product, on a store's behalf.
 *
 * The same form sellers use, with one extra question at the front: whose store
 * is this? Every product belongs to a seller -- that is who is paid, who ships
 * it and who answers for it -- so there is no such thing as a platform-owned
 * listing, and the store is chosen before anything else is asked.
 *
 * It is a URL parameter rather than a field inside the form so the choice
 * survives a reload and can be linked to straight from a store's own page.
 */
export default function AdminNewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ seller?: string }>;
}) {
  return (
    <>
      <PageHeader
        back={{ href: '/admin/products', label: 'Products' }}
        title="Add a product"
        description="Lists into a seller's store, live immediately, exactly as theirs do."
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Body({ searchParams }: { searchParams: Promise<{ seller?: string }> }) {
  const [params] = await Promise.all([searchParams, requirePermission('catalog:write')]);

  if (!params.seller) return <StorePicker />;

  const [started, options] = await Promise.all([startListing(params.seller), listingOptions()]);
  if (!started.ok || !started.productId) {
    return (
      <p className="border-line text-muted mt-6 rounded-lg border border-dashed px-4 py-8 text-sm">
        {started.error ?? 'That store cannot take a listing right now.'}
      </p>
    );
  }

  const [products, sellers] = await Promise.all([collections.products(), collections.sellers()]);
  const [draft, store] = await Promise.all([
    products.findOne({ _id: started.productId }).then(toEntity),
    sellers.findOne({ _id: params.seller }).then(toEntity),
  ]);

  return (
    <>
      <p className="text-muted mt-4 text-sm">
        Listing into <span className="text-ink font-medium">{store?.displayName ?? 'a store'}</span>.{' '}
        <Link href="/admin/products/new" className="text-accent-ink underline">
          Choose a different store
        </Link>
      </p>

      <QuickListingForm
        productId={started.productId}
        sellerId={params.seller}
        brands={options.brands}
        categories={options.categories}
        parents={options.parents}
        media={(draft?.media ?? []).map((asset) => ({
          id: asset.id,
          url: asset.url,
          kind: asset.kind,
          role: mediaRole(asset),
        }))}
        doneHref="/admin/catalogue"
      />
    </>
  );
}

async function StorePicker() {
  const sellers = await collections.sellers();
  const stores = await sellers
    .find({ status: { $in: ['ACTIVE', 'APPROVED'] } })
    .sort({ displayName: 1 })
    .limit(200)
    .toArray();

  if (stores.length === 0) {
    return (
      <EmptyState
        className="border-line bg-raised mt-6 rounded-lg border"
        icon={Store}
        title="No stores are trading yet"
        body="A product belongs to a seller, so there is nowhere to list one until a store is approved."
        action={
          <Button asChild size="sm" variant="secondary">
            <Link href="/admin/sellers">Seller applications</Link>
          </Button>
        }
      />
    );
  }

  return (
    <section className="mt-6" aria-labelledby="choose-store">
      <h2 id="choose-store" className="text-ink text-sm font-semibold">
        Which store is this for?
      </h2>
      <p className="text-muted mt-0.5 text-xs">
        The store is paid for it, ships it and answers for it.
      </p>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {stores.map((store) => (
          <li key={store._id}>
            <Link
              href={`/admin/products/new?seller=${store._id}`}
              className="border-line bg-raised hover:border-accent-control block rounded-md border p-3 transition-colors"
            >
              <p className="text-ink truncate text-sm font-medium">{store.displayName}</p>
              <p className="text-faint truncate text-2xs">
                {store.metrics?.productCount ?? 0} products · {store.code}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
