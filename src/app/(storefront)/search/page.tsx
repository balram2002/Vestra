import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ProductGridSkeleton } from '@/components/skeletons/product-card-skeleton';
import type { SearchPageSettings, SearchPageVariant } from '@/domain/page-designs/search';
import type { RawSearchParams } from '@/lib/product-query';
import { getLiveDesign } from '@/server/services/page-designs';

import { SearchFrame } from './search-frame';

/**
 * Search results.
 *
 * Never indexed: search result pages are infinite, thin and duplicative, and
 * letting a crawler into them is a classic way to bury the category pages that
 * should be ranking instead.
 *
 * The page owns its heading, its empty states and the query. Everything about
 * how a filtered listing LOOKS lives in `ListingView`, which the category,
 * brand and store pages share. Which layout, and which of its parts, is
 * decided under Admin › Page designs › Search results.
 */
export const metadata: Metadata = {
  title: 'Search',
  robots: { index: false, follow: true },
};

export default function SearchPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return (
    <div className="gutter shell-max py-6 sm:py-8">
      <Suspense fallback={<SearchSkeleton />}>
        <LiveSearch searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function LiveSearch({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const design = await getLiveDesign('search');
  const variant = design.variant as SearchPageVariant;
  return <SearchFrame variant={variant} settings={design.settings[variant] as SearchPageSettings} searchParams={searchParams} />;
}

function SearchSkeleton() {
  return (
    <div>
      <div className="skeleton h-9 w-64 rounded-md" aria-hidden />
      <div className="mt-6 flex gap-8 lg:gap-10">
        <div className="hidden w-60 shrink-0 lg:block" aria-hidden>
          <div className="skeleton h-96 w-full rounded-lg" />
        </div>
        <div className="min-w-0 flex-1">
          <ProductGridSkeleton count={15} />
        </div>
      </div>
    </div>
  );
}
