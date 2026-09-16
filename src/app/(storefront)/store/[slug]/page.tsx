import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';

import { atLeastOne, PLACEHOLDER_SLUG } from '@/lib/static-params';
import { ListingView } from '@/components/commerce/listing-view';
import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { JsonLd } from '@/components/seo/json-ld';
import { ProductGridSkeleton } from '@/components/skeletons/product-card-skeleton';
import { StoreProfile } from '@/components/commerce/store-profile';
import { absoluteUrl } from '@/config/site';
import { isIndexableListing, parseProductQuery, type RawSearchParams } from '@/lib/product-query';
import { breadcrumbListJsonLd, sellerJsonLd } from '@/lib/seo/structured-data';
import { getSellerBySlug, listSellers } from '@/server/services/catalog';
import { listProducts } from '@/server/services/listing';

/**
 * Public store page.
 *
 * Note the path: `/store/[slug]`, not `/seller/[slug]`. The brief lists both a
 * public seller page and a `/seller/*` console; those collide, and a store
 * whose slug happened to be "orders" would shadow a console route. `/store` is
 * unambiguous and matches what a shopper thinks they are looking at.
 *
 * The operational numbers (dispatch rate, rating, order count) are shown
 * deliberately: on a marketplace the seller is part of what is being bought,
 * and hiding their record helps only the bad ones.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

export async function generateStaticParams() {
  return atLeastOne(
    async () => (await listSellers(100)).map((seller) => ({ slug: seller.slug })),
    { slug: PLACEHOLDER_SLUG },
  );
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const seller = await getSellerBySlug(slug);
  if (!seller) return {};

  const query = parseProductQuery(await searchParams, { sellerSlug: slug });

  return {
    title: `${seller.displayName} — Store`,
    description: seller.tagline ?? seller.about.slice(0, 155),
    alternates: { canonical: absoluteUrl(`/store/${seller.slug}`) },
    robots: isIndexableListing(query) ? undefined : { index: false, follow: true },
  };
}

export default async function StorePage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const seller = await getSellerBySlug(slug);

  if (!seller || !['ACTIVE', 'APPROVED'].includes(seller.status)) notFound();
  if (seller.slug !== slug) permanentRedirect(`/store/${seller.slug}`);

  const url = absoluteUrl(`/store/${seller.slug}`);

  return (
    <div className="gutter shell-max py-5">
      <Breadcrumbs
        items={[
          { href: '/', label: 'Home' },
          { href: '/stores', label: 'Sellers' },
          { href: `/store/${seller.slug}`, label: seller.displayName },
        ]}
      />

      <JsonLd
        data={[
          breadcrumbListJsonLd([
            { name: 'Home', url: absoluteUrl('/') },
            { name: 'Sellers', url: absoluteUrl('/stores') },
            { name: seller.displayName, url },
          ]),
          sellerJsonLd(seller, url),
        ]}
      />

      <StoreProfile seller={seller} />

      <Suspense fallback={<ProductGridSkeleton className="mt-6" count={15} />}>
        <StoreListing slug={seller.slug} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function StoreListing({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: Promise<RawSearchParams>;
}) {
  const raw = await searchParams;
  const query = parseProductQuery(raw, { sellerSlug: slug });
  const result = await listProducts(query);
  const basePath = `/store/${slug}`;

  return (
    <ListingView
      heading={<div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl font-semibold sm:text-2xl">Shop this store</h2><form action={basePath} className="flex w-full gap-2 sm:w-auto"><input name="q" defaultValue={query.q} aria-label="Search this store" placeholder="Search this store?" className="bg-raised border-line h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm" /><button className="bg-ink text-canvas rounded-xl px-4 text-sm">Search</button></form></div>}
      result={result}
      params={raw}
      basePath={basePath}
      sort={query.sort ?? 'popularity'}
      className="mt-6"
    />
  );
}
