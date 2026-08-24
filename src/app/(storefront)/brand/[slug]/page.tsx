import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';

import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { FilterRail } from '@/components/commerce/filter-rail';
import { ListingToolbar } from '@/components/commerce/listing-toolbar';
import { Pagination } from '@/components/commerce/pagination';
import { ProductGrid } from '@/components/commerce/product-grid';
import { JsonLd } from '@/components/seo/json-ld';
import { ProductGridSkeleton } from '@/components/skeletons/product-card-skeleton';
import { Badge } from '@/components/ui/badge';
import { absoluteUrl } from '@/config/site';
import { isIndexableListing, parseProductQuery, type RawSearchParams } from '@/lib/product-query';
import { breadcrumbListJsonLd } from '@/lib/seo/structured-data';
import { getBrandBySlug, listBrands } from '@/server/services/catalog';
import { listProducts } from '@/server/services/listing';

/**
 * Brand page.
 *
 * Structurally the same as a category listing — same filters, same sort, same
 * pagination — because it is the same question asked with a different filter.
 * Sharing `listProducts` is what keeps the two from drifting apart.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

export async function generateStaticParams() {
  const brands = await listBrands(100);
  return brands.map((brand) => ({ slug: brand.slug }));
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) return {};

  const query = parseProductQuery(await searchParams, { brandSlugs: [slug] });

  return {
    title: brand.metaTitle ?? `${brand.name} — Shop Online`,
    description: brand.metaDescription ?? brand.description.slice(0, 155),
    alternates: { canonical: absoluteUrl(`/brand/${brand.slug}`) },
    robots: isIndexableListing(query) ? undefined : { index: false, follow: true },
  };
}

export default async function BrandPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);

  if (!brand) notFound();
  if (brand.slug !== slug) permanentRedirect(`/brand/${brand.slug}`);

  return (
    <div className="gutter shell-max py-5">
      <Breadcrumbs
        items={[
          { href: '/', label: 'Home' },
          { href: '/brands', label: 'Brands' },
          { href: `/brand/${brand.slug}`, label: brand.name },
        ]}
      />

      <JsonLd
        data={breadcrumbListJsonLd([
          { name: 'Home', url: absoluteUrl('/') },
          { name: 'Brands', url: absoluteUrl('/brands') },
          { name: brand.name, url: absoluteUrl(`/brand/${brand.slug}`) },
        ])}
      />

      <header className="mt-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-ink text-2xl sm:text-3xl">{brand.name}</h1>
          {brand.isPremium ? <Badge tone="brass">Premium</Badge> : null}
        </div>
        <p className="text-muted mt-2 max-w-2xl text-pretty text-sm">{brand.description}</p>
        <p className="text-faint mt-2 text-xs">
          Founded {brand.foundedYear} · {brand.originCountry} · {brand.productCount} styles
        </p>
      </header>

      <Suspense fallback={<ProductGridSkeleton className="mt-6" count={15} />}>
        <BrandListing slug={brand.slug} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function BrandListing({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: Promise<RawSearchParams>;
}) {
  const raw = await searchParams;
  const query = parseProductQuery(raw, { brandSlugs: [slug] });
  const result = await listProducts(query);
  const basePath = `/brand/${slug}`;

  return (
    <div className="mt-6 flex gap-8">
      <div className="hidden w-60 shrink-0 lg:block">
        <FilterRail
          facets={result.facets.filter((f) => f.key !== 'brand')}
          priceFacet={result.priceFacet}
          params={raw}
          basePath={basePath}
          appliedCount={result.appliedFilterCount}
        />
      </div>

      <div className="min-w-0 flex-1">
        <ListingToolbar
          total={result.total}
          activeSort={query.sort ?? 'popularity'}
          params={raw}
          basePath={basePath}
        />
        <div className="mt-5">
          <ProductGrid
            products={result.items}
            emptyAction={{ href: basePath, label: 'Clear all filters' }}
          />
        </div>
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          params={raw}
          basePath={basePath}
        />
      </div>
    </div>
  );
}
