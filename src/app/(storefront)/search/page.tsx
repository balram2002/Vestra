import type { Metadata } from 'next';
import { Suspense } from 'react';

import { FilterRail } from '@/components/commerce/filter-rail';
import { ListingToolbar } from '@/components/commerce/listing-toolbar';
import { Pagination } from '@/components/commerce/pagination';
import { ProductGrid } from '@/components/commerce/product-grid';
import { ProductGridSkeleton } from '@/components/skeletons/product-card-skeleton';
import { parseProductQuery, type RawSearchParams } from '@/lib/product-query';
import { listProducts } from '@/server/services/listing';

/**
 * Search results.
 *
 * Never indexed: search result pages are infinite, thin and duplicative, and
 * letting a crawler into them is a classic way to bury the category pages that
 * should be ranking instead.
 */
export const metadata: Metadata = {
  title: 'Search',
  robots: { index: false, follow: true },
};

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <div className="gutter shell-max py-6">
      <Suspense fallback={<SearchSkeleton />}>
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SearchResults({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const query = parseProductQuery(raw);
  const basePath = '/search';

  // No query at all is a distinct state from "no results" and deserves its own
  // screen rather than an empty grid.
  if (!query.q) {
    return (
      <div className="py-16 text-center">
        <h1 className="font-display text-ink text-2xl">What are you looking for?</h1>
        <p className="text-muted mt-2 text-sm">
          Search by product, brand, colour or fabric — try &ldquo;linen shirt&rdquo; or
          &ldquo;block print kurta&rdquo;.
        </p>
      </div>
    );
  }

  const result = await listProducts(query);

  return (
    <>
      <header>
        <h1 className="font-display text-ink text-xl sm:text-2xl">
          Results for <span className="text-accent-ink">{query.q}</span>
        </h1>
      </header>

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
            activeSort={query.sort ?? 'relevance'}
            params={raw}
            basePath={basePath}
          />

          <div className="mt-5">
            {result.total === 0 ? (
              <div className="border-line rounded-lg border border-dashed px-6 py-16 text-center">
                <h2 className="text-ink text-md font-semibold">
                  Nothing matched &ldquo;{query.q}&rdquo;
                </h2>
                <p className="text-muted mx-auto mt-2 max-w-sm text-sm">
                  Check the spelling, try a broader term, or browse a department from the menu
                  above.
                </p>
              </div>
            ) : (
              <ProductGrid products={result.items} />
            )}
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

function SearchSkeleton() {
  return (
    <div className="flex gap-8">
      <div className="hidden w-60 shrink-0 lg:block" aria-hidden>
        <div className="skeleton h-64 w-full rounded-md" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="skeleton h-8 w-56 rounded-sm" aria-hidden />
        <ProductGridSkeleton className="mt-5" count={15} />
      </div>
    </div>
  );
}
