import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';

import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { FilterDrawer } from '@/components/commerce/filter-drawer';
import { FilterRail } from '@/components/commerce/filter-rail';
import { ListingToolbar, SortChips } from '@/components/commerce/listing-toolbar';
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
      /*
       * No `images` here on purpose.
       *
       * Setting it would override the generated card in `opengraph-image.tsx`,
       * and the banner is the weaker choice: it is a wide lifestyle crop that
       * loses its subject at 1200×630, it is often shared across a whole
       * department, and it carries no text — so a shared link would not say
       * which category it was.
       */
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

      {/*
        Tight on a phone.
        
        Breadcrumb, heading, description, a filter button, a count and a sort
        row used to fill roughly two thirds of a 844px screen before the first
        product. The description is clamped to two lines and the rest is folded
        into the sticky bar below, so the grid starts near the top where someone
        who came to shop is already looking.
      */}
      <header className="mt-2 sm:mt-3">
        <h1 className="font-display text-ink text-xl sm:text-3xl">{category.name}</h1>
        {category.description ? (
          <p className="text-muted mt-1 line-clamp-2 max-w-2xl text-sm sm:mt-1.5 sm:line-clamp-none">
            {category.description}
          </p>
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

      {/*
        The rail is built once and rendered twice: docked on desktop, and inside
        the drawer on mobile. Re-implementing it for small screens would
        guarantee the two sets of filters drift apart.
      */}
      <div className="bg-canvas/95 gutter sticky top-[var(--header-height)] z-30 -mx-4 mt-3 flex items-center gap-2 border-b border-line py-2 backdrop-blur-md sm:-mx-6 lg:hidden">
        <FilterDrawer appliedCount={result.appliedFilterCount}>
          <FilterRail
            facets={result.facets}
            priceFacet={result.priceFacet}
            params={raw}
            basePath={basePath}
            appliedCount={result.appliedFilterCount}
          />
        </FilterDrawer>

        {/*
          The chips scroll and the count does not.
          
          A fade on the trailing edge is what says "there is more sort to the
          right"; without it the last chip is simply sliced in half against the
          count and reads as a rendering fault.
        */}
        <div className="relative min-w-0 flex-1">
          <SortChips activeSort={query.sort ?? 'popularity'} params={raw} basePath={basePath} />
          <div
            aria-hidden
            className="from-canvas pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l to-transparent"
          />
        </div>

        <p className="text-faint tabular border-line shrink-0 border-l pl-2.5 text-2xs" role="status">
          {result.total} items
        </p>
      </div>

      <div className="mt-4 flex gap-8 lg:mt-5">
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
            className="hidden lg:flex"
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
