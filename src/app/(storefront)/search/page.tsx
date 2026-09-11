import { SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { ListingView } from '@/components/commerce/listing-view';
import { ProductGridSkeleton } from '@/components/skeletons/product-card-skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { getDepartments } from '@/server/services/catalog';
import { parseProductQuery, type RawSearchParams } from '@/lib/product-query';
import { listProducts } from '@/server/services/listing';

/**
 * Search results.
 *
 * Never indexed: search result pages are infinite, thin and duplicative, and
 * letting a crawler into them is a classic way to bury the category pages that
 * should be ranking instead.
 *
 * The page owns three things — its heading, its two empty states, and the
 * query. Everything about how a filtered listing LOOKS lives in `ListingView`,
 * which the category, brand and store pages share.
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
    <div className="gutter shell-max py-6 sm:py-8">
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

  /*
   * No query at all is a DIFFERENT state from "no results", and it gets its own
   * screen. Rendering an empty grid for someone who has not searched yet tells
   * them the shop is empty; this tells them what to type.
   */
  if (!query.q) {
    return <EmptySearchPrompt />;
  }

  const result = await listProducts(query);

  return (
    <ListingView
      result={result}
      params={raw}
      basePath={basePath}
      sort={query.sort ?? 'relevance'}
      heading={
        <header>
          <h1 className="headline text-ink text-2xl sm:text-3xl">
            Results for <span className="text-accent-ink">{query.q}</span>
          </h1>
        </header>
      }
      emptyState={<NoResults query={query.q} />}
    />
  );
}

/**
 * Somewhere to go when the query found nothing.
 *
 * "0 results" and a blank page is a dead end, and a dead end on a marketplace
 * is a lost sale. This does the three things a no-results screen has to: says
 * plainly that nothing matched, suggests why, and offers a way onward that is
 * not the back button. The departments are real links from the taxonomy, not
 * invented suggestions.
 */
async function NoResults({ query }: { query: string }) {
  const departments = await getDepartments();

  return (
    <div className="border-line rounded-xl border border-dashed">
      <EmptyState
        icon={SearchX}
        title={`Nothing matched “${query}”`}
        body="Check the spelling, or try a broader word — “kurta” finds more than “block print cotton kurta”."
      />

      <div className="border-line mx-6 border-t pb-8 pt-6">
        <p className="eyebrow mb-3 text-center">Or browse a department</p>
        <ul className="flex flex-wrap justify-center gap-2">
          {departments.map((department) => (
            <li key={department.id}>
              <Button asChild variant="secondary" size="sm" shape="pill">
                <Link href={`/category/${department.slug}`}>{department.name}</Link>
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

async function EmptySearchPrompt() {
  const departments = await getDepartments();

  return (
    <div className="py-16 text-center sm:py-24">
      <h1 className="headline text-ink text-3xl sm:text-4xl">What are you looking for?</h1>
      <p className="text-muted mx-auto mt-3 max-w-md text-sm">
        Search by product, brand, colour or fabric — try &ldquo;linen shirt&rdquo; or
        &ldquo;block print kurta&rdquo;.
      </p>

      <ul className="mt-8 flex flex-wrap justify-center gap-2">
        {departments.map((department) => (
          <li key={department.id}>
            <Button asChild variant="secondary" size="sm" shape="pill">
              <Link href={`/category/${department.slug}`}>{department.name}</Link>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
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
