import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';

import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { FilterRail } from '@/components/commerce/filter-rail';
import { ListingToolbar } from '@/components/commerce/listing-toolbar';
import { Pagination } from '@/components/commerce/pagination';
import { ProductGrid } from '@/components/commerce/product-grid';
import { ProductGridSkeleton } from '@/components/skeletons/product-card-skeleton';
import { absoluteUrl } from '@/config/site';
import { isIndexableListing, parseProductQuery, type RawSearchParams } from '@/lib/product-query';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbListJsonLd, itemListJsonLd } from '@/lib/seo/structured-data';
import {
  getCategoryAncestors,
  getCategoryBySlug,
  getCategoryTree,
} from '@/server/services/catalog';
import { listProducts } from '@/server/services/listing';

/**
 * Category listing.
 *
 * The page splits into a cached shell and a dynamic grid on purpose:
 *
 *  - the breadcrumb, heading and SEO copy come from the category document and
 *    prerender, so the page paints immediately with real content;
 *  - the grid depends on `searchParams` (filters, sort, page), which is request
 *    state, so it sits behind `<Suspense>` and streams.
 *
 * That is why `searchParams` is awaited INSIDE the suspended child rather than
 * at the top: awaiting it in the page body would make the whole route dynamic
 * and throw away the static shell.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

/**
 * The taxonomy is a small fixed set, so every category page is prerendered.
 * Without this the route has no known params at build time and its shell
 * cannot be prerendered at all.
 */
export async function generateStaticParams() {
  const categories = await getCategoryTree();
  return categories.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return {};

  const raw = await searchParams;
  const query = parseProductQuery(raw, { categorySlug: slug });
  const indexable = isIndexableListing(query);
  const page = query.page ?? 1;

  const title = category.metaTitle ?? `${category.name} — Buy ${category.name} Online`;

  return {
    title: page > 1 ? `${title} — Page ${page}` : title,
    description: category.metaDescription ?? category.description,
    alternates: {
      // Filtered and sorted variants all canonicalise to the clean category
      // URL, so their ranking signals consolidate rather than compete.
      canonical: absoluteUrl(`/category/${category.slug}`),
    },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: {
      title,
      description: category.description,
      url: absoluteUrl(`/category/${category.slug}`),
      images: category.bannerUrl ? [{ url: category.bannerUrl }] : undefined,
    },
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) notFound();

  // The slug resolved through history, so the canonical URL has moved. A 301
  // keeps inbound links and old sitemap entries working.
  if (category.slug !== slug) {
    permanentRedirect(`/category/${category.slug}`);
  }

  const ancestors = await getCategoryAncestors(category.slug);

  return (
    <div className="gutter shell-max py-5">
      <Breadcrumbs
        items={[
          { href: '/', label: 'Home' },
          ...ancestors.map((c) => ({ href: `/category/${c.slug}`, label: c.name })),
        ]}
      />

      <JsonLd
        data={breadcrumbListJsonLd([
          { name: 'Home', url: absoluteUrl('/') },
          ...ancestors.map((c) => ({
            name: c.name,
            url: absoluteUrl(`/category/${c.slug}`),
          })),
        ])}
      />

      <header className="mt-3">
        <h1 className="font-display text-ink text-2xl sm:text-3xl">{category.name}</h1>
        {category.description ? (
          <p className="text-muted mt-1.5 max-w-2xl text-sm">{category.description}</p>
        ) : null}
      </header>

      <Suspense fallback={<ListingSkeleton />}>
        <CategoryListing slug={category.slug} searchParams={searchParams} />
      </Suspense>

      {/*
        SEO copy sits BELOW the grid: it is written for crawlers and for
        shoppers who scrolled the whole page, and putting it above would push
        the products people came for off the fold.
      */}
      {category.seoIntro ? (
        <section className="border-line mt-12 border-t pt-6">
          <h2 className="text-ink text-sm font-semibold">About {category.name}</h2>
          <p className="text-muted mt-2 max-w-3xl text-pretty text-sm">{category.seoIntro}</p>
        </section>
      ) : null}
    </div>
  );
}

/** The dynamic half: everything that depends on the query string. */
async function CategoryListing({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: Promise<RawSearchParams>;
}) {
  const raw = await searchParams;
  const query = parseProductQuery(raw, { categorySlug: slug });
  const result = await listProducts(query);
  const basePath = `/category/${slug}`;

  return (
    <>
      <JsonLd
        data={itemListJsonLd(
          result.items.map((item) => ({
            name: item.title,
            url: absoluteUrl(`/product/${item.slug}`),
          })),
        )}
      />

      <div className="mt-5 flex gap-8">
        <div className="hidden w-60 shrink-0 lg:block">
          <FilterRail
            facets={result.facets}
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
    </>
  );
}

function ListingSkeleton() {
  return (
    <div className="mt-5 flex gap-8">
      <div className="hidden w-60 shrink-0 space-y-4 lg:block" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className="skeleton h-4 w-24 rounded-xs" />
            <div className="skeleton h-3 w-full rounded-xs" />
            <div className="skeleton h-3 w-5/6 rounded-xs" />
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="skeleton h-8 w-full rounded-sm" aria-hidden />
        <ProductGridSkeleton className="mt-5" count={15} />
      </div>
    </div>
  );
}
