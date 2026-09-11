import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';

import { atLeastOne, PLACEHOLDER_SLUG } from '@/lib/static-params';
import { ListingView } from '@/components/commerce/listing-view';
import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { JsonLd } from '@/components/seo/json-ld';
import { ProductGridSkeleton } from '@/components/skeletons/product-card-skeleton';
import { Badge } from '@/components/ui/badge';
import { absoluteUrl } from '@/config/site';
import { isIndexableListing, parseProductQuery, type RawSearchParams } from '@/lib/product-query';
import { breadcrumbListJsonLd, sellerJsonLd } from '@/lib/seo/structured-data';
import { formatCompactNumber } from '@/lib/format';
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

  if (!seller) notFound();
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

      <header className="border-line mt-3 rounded-lg border p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-ink text-2xl sm:text-3xl">{seller.displayName}</h1>
              {seller.rating.average >= 4.5 ? <Badge tone="success">Top rated</Badge> : null}
            </div>
            {seller.tagline ? <p className="text-muted mt-1 text-sm">{seller.tagline}</p> : null}
          </div>

          <p className="text-faint text-xs">
            {seller.kyc.registeredAddress.city}, {seller.kyc.registeredAddress.state} · Since{' '}
            {new Date(seller.joinedAt).getFullYear()}
          </p>
        </div>

        <p className="text-muted mt-3 max-w-3xl text-pretty text-sm">{seller.about}</p>

        {/* Their record, stated plainly. */}
        <dl className="border-line mt-5 grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
          <Stat label="Rating" value={`${seller.rating.average}★`} hint={`${formatCompactNumber(seller.rating.count)} ratings`} />
          <Stat
            label="Dispatched on time"
            value={`${seller.rating.onTimeDispatchRate}%`}
            hint={`within ${seller.policies.dispatchSlaHours}h`}
          />
          <Stat
            label="Orders shipped"
            value={formatCompactNumber(seller.metrics.orderCount)}
            hint="lifetime"
          />
          <Stat
            label="Returns"
            value={`${seller.rating.returnRate}%`}
            hint={`${seller.policies.returnWindowDays}-day window`}
          />
        </dl>
      </header>

      <Suspense fallback={<ProductGridSkeleton className="mt-6" count={15} />}>
        <StoreListing slug={seller.slug} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <dt className="text-faint text-2xs uppercase tracking-wider">{label}</dt>
      <dd className="text-ink tabular mt-0.5 text-lg font-semibold">{value}</dd>
      <p className="text-faint text-2xs">{hint}</p>
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
      result={result}
      params={raw}
      basePath={basePath}
      sort={query.sort ?? 'popularity'}
      className="mt-6"
    />
  );
}
