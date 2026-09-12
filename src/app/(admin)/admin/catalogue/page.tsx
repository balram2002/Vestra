import { Inbox, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

import { ItemDecision, ProductDecision } from '@/components/console/catalogue-inbox-actions';
import { PageHeader } from '@/components/console/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateShort, formatMoney } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { catalogueInbox } from '@/server/services/catalog-review';

export const metadata: Metadata = { title: 'New from sellers' };

/**
 * The catalogue inbox.
 *
 * Sellers publish their own products, brands and categories, so this is not an
 * approval queue: everything on this page is ALREADY in the shop. It is the
 * record of what staff have not looked at yet, and the place to act when
 * something should not have gone up.
 *
 * That distinction drives the whole layout. An approval queue leads with
 * accept and reject, because nothing is live until someone clicks. Here the
 * first thing each row shows is what shoppers can currently see -- the
 * photograph, the price, the stock -- and the decisions come after it, with
 * "Keep" as the plainest of the three.
 */
export default function AdminCataloguePage() {
  return (
    <>
      <PageHeader
        title="New from sellers"
        description="Everything sellers have put in the shop that nobody here has checked yet."
        actions={
          <Button asChild size="sm">
            <Link href="/admin/products/new">
              <Plus className="size-4" aria-hidden />
              Add a product
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <Inboxes />
      </Suspense>
    </>
  );
}

async function Inboxes() {
  await requirePermission('catalog:read');
  const inbox = await catalogueInbox();

  if (inbox.total === 0) {
    return (
      <EmptyState
        className="border-line bg-raised mt-6 rounded-lg border"
        icon={Inbox}
        title="Nothing waiting"
        body="When a seller adds a product, a brand or a category, it goes straight into the shop and appears here for you to check."
        action={
          <Button asChild size="sm" variant="secondary">
            <Link href="/admin/products">Browse the whole catalogue</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="mt-6 space-y-10">
      {inbox.products.length > 0 ? (
        <section aria-labelledby="new-products">
          <SectionHead
            id="new-products"
            title="Products"
            count={inbox.products.length}
            note="Live in the shop now. Keep marks it checked; taking it down tells the seller why."
          />

          <ul className="grid gap-3 lg:grid-cols-2">
            {inbox.products.map((product) => (
              <li
                key={product.id}
                className="border-line bg-raised flex gap-3 rounded-lg border p-3"
              >
                <Link
                  href={`/product/${product.slug}`}
                  className="bg-sunken relative aspect-3/4 w-20 shrink-0 overflow-hidden rounded-md"
                >
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt=""
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  ) : null}
                </Link>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/product/${product.slug}`}
                    className="text-ink block truncate text-sm font-medium hover:underline"
                  >
                    {product.title}
                  </Link>
                  <p className="text-muted mt-0.5 truncate text-xs">
                    {product.sellerName} · {product.brandName}
                  </p>
                  <p className="text-faint mt-0.5 truncate text-2xs">{product.categoryName}</p>

                  <p className="text-ink mt-1.5 text-xs font-medium">
                    {formatMoney(product.price)}
                    <span className="text-faint font-normal"> · {product.stock} in stock</span>
                  </p>

                  <p className="text-faint mt-0.5 text-2xs">
                    {product.photoCount} photos
                    {product.videoCount > 0 ? ' · video' : ''}
                    {product.reelCount > 0 ? ` · ${product.reelCount} reels` : ''}
                    {product.publishedAt ? ` · ${formatDateShort(product.publishedAt)}` : ''}
                  </p>

                  <div className="mt-2.5">
                    <ProductDecision productId={product.id} title={product.title} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {inbox.brands.length > 0 ? (
        <section aria-labelledby="new-brands">
          <SectionHead
            id="new-brands"
            title="Brands"
            count={inbox.brands.length}
            note="Added by a seller so they could list. Hiding one leaves its products reachable by link."
          />

          <ul className="space-y-2">
            {inbox.brands.map((brand) => (
              <li
                key={brand.id}
                className="border-line bg-raised flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5"
              >
                <div className="bg-sunken relative size-9 shrink-0 overflow-hidden rounded">
                  <Image src={brand.logoUrl} alt="" fill sizes="36px" className="object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/brand/${brand.slug}`}
                    className="text-ink block truncate text-xs font-medium hover:underline"
                  >
                    {brand.name}
                  </Link>
                  <p className="text-faint truncate text-2xs">
                    {brand.sellerName} · {brand.productCount} products ·{' '}
                    {formatDateShort(brand.createdAt)}
                  </p>
                </div>
                <ItemDecision kind="brand" id={brand.id} name={brand.name} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {inbox.categories.length > 0 ? (
        <section aria-labelledby="new-categories">
          <SectionHead
            id="new-categories"
            title="Categories"
            count={inbox.categories.length}
            note="New shelves under existing departments. They inherit the parent's size chart and tax slab."
          />

          <ul className="space-y-2">
            {inbox.categories.map((category) => (
              <li
                key={category.id}
                className="border-line bg-raised flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/category/${category.slug}`}
                    className="text-ink block truncate text-xs font-medium hover:underline"
                  >
                    {category.name}
                  </Link>
                  <p className="text-faint truncate text-2xs">
                    under {category.trail} · {category.sellerName} ·{' '}
                    {formatDateShort(category.createdAt)}
                  </p>
                </div>
                <ItemDecision kind="category" id={category.id} name={category.name} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SectionHead({
  id,
  title,
  count,
  note,
}: {
  id: string;
  title: string;
  count: number;
  note: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-baseline gap-2">
        <h2 id={id} className="text-ink text-md font-semibold">
          {title}
        </h2>
        <span className="text-faint tabular text-xs">{count}</span>
      </div>
      <p className="text-muted mt-0.5 max-w-2xl text-xs">{note}</p>
    </div>
  );
}
