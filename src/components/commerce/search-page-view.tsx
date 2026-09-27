import { ArrowRight, Search, SearchX } from 'lucide-react';
import Form from 'next/form';
import Link from 'next/link';

import { ProductCard } from '@/components/commerce/product-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Picture } from '@/components/ui/picture';
import type { SearchPageVariant } from '@/domain/page-designs/search';
import type { Category, ProductSummary } from '@/domain/types';
import { cn } from '@/lib/cn';
import type { SearchResults } from '@/server/services/search';

/**
 * The pieces of the search page that differ by layout. The listing itself
 * is `ListingView`, shared with every other listing; the route assembles
 * these around it.
 */

/**
 * The words searched for, ready to change. A plain GET form under
 * `next/form`: it navigates client-side when it can and still works as an
 * ordinary form when it cannot.
 */
export function SearchBox({ q, basePath, size }: { q: string; basePath: string; size: 'regular' | 'hero' }) {
  const hero = size === 'hero';
  return (
    <Form action={basePath} role="search" className="relative">
      <label htmlFor="page-search" className="sr-only">
        Search products, brands and stores
      </label>
      <input
        key={q}
        id="page-search"
        name="q"
        type="search"
        defaultValue={q}
        placeholder="Search products, brands and stores"
        enterKeyHint="search"
        autoComplete="off"
        className={cn(
          'bg-raised text-ink placeholder:text-faint w-full rounded-full border outline-none transition-colors focus:border-ink',
          hero
            ? 'border-line-control font-display h-16 pl-6 pr-16 text-2xl font-bold sm:h-20 sm:pl-8 sm:text-4xl'
            : 'border-line-control h-12 pl-5 pr-14 text-base',
        )}
      />
      <button
        type="submit"
        aria-label="Search"
        className={cn(
          'bg-ink text-canvas absolute right-2 top-1/2 grid -translate-y-1/2 place-items-center rounded-full transition-transform hover:scale-105',
          hero ? 'size-12 sm:size-14' : 'size-9',
        )}
      >
        <Search className={hero ? 'size-5 sm:size-6' : 'size-4'} aria-hidden />
      </button>
    </Form>
  );
}

/** The heading each layout gives its results. */
export function ResultsHeading({ q, variant }: { q: string; variant: SearchPageVariant }) {
  if (variant === 'visual') {
    // The big search box is the visible heading; this names the page for
    // screen readers and the outline.
    return <h1 className="sr-only">Results for {q}</h1>;
  }
  return (
    <header className={cn(variant === 'instant' && 'mt-5')}>
      <h1 className={cn('headline text-ink', variant === 'instant' ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl')}>
        Results for <span className="text-accent-ink">{q}</span>
      </h1>
    </header>
  );
}

/**
 * When the words also name a store, a brand or a category, the shopper may
 * have meant THAT rather than products with the words in their titles. Each
 * kind keeps its own label, because they lead to different kinds of page.
 */
export function Shortcuts({ results }: { results: SearchResults }) {
  const groups = [
    { kind: 'Category', hits: results.categories },
    { kind: 'Brand', hits: results.brands },
    { kind: 'Store', hits: results.sellers },
  ].filter((group) => group.hits.length > 0);
  if (groups.length === 0) return null;
  return (
    <nav aria-label="Matching stores, brands and categories" className="mt-5">
      <ul className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {groups.flatMap((group) =>
          group.hits.map((hit) => (
            <li key={`${group.kind}-${hit.id}`} className="shrink-0">
              <Link
                href={hit.href}
                className="border-line bg-raised hover:border-ink flex min-h-14 items-center gap-2.5 rounded-2xl border py-1.5 pl-1.5 pr-4 transition-colors"
              >
                <Picture src={hit.imageUrl} name={hit.label} sizes="44px" className={cn('size-11 shrink-0', group.kind === 'Category' ? 'rounded-xl' : 'rounded-full')} />
                <span className="min-w-0">
                  <span className="text-faint text-2xs block font-semibold uppercase tracking-wider">{group.kind}</span>
                  <span className="text-ink block max-w-48 truncate text-sm font-semibold">{hit.label}</span>
                </span>
              </Link>
            </li>
          )),
        )}
      </ul>
    </nav>
  );
}

export function DidYouMean({ suggestion, basePath }: { suggestion: string; basePath: string }) {
  return (
    <p className="text-muted mt-3 text-sm" role="status">
      Did you mean{' '}
      <Link href={`${basePath}?q=${encodeURIComponent(suggestion)}`} className="text-accent-ink font-semibold italic underline underline-offset-2">
        {suggestion}
      </Link>
      ?
    </p>
  );
}

/**
 * Somewhere to go when the query found nothing.
 *
 * "0 results" and a blank page is a dead end, and a dead end on a marketplace
 * is a lost sale. This says plainly that nothing matched, suggests why, and
 * offers a way onward that is not the back button: a corrected search when
 * there is one, the departments, and what is selling now.
 */
export function NoResults({
  q,
  suggestion,
  basePath,
  departments,
  picks,
  picksTitle,
}: {
  q: string;
  suggestion: string | null;
  basePath: string;
  departments: Category[];
  picks: ProductSummary[];
  picksTitle: string;
}) {
  return (
    <div>
      <div className="border-line rounded-xl border border-dashed">
        <EmptyState
          icon={SearchX}
          title={`Nothing matched “${q}”`}
          body="Check the spelling, or try a broader word — “kurta” finds more than “block print cotton kurta”."
          action={
            suggestion ? (
              <Button asChild size="sm" shape="pill">
                <Link href={`${basePath}?q=${encodeURIComponent(suggestion)}`}>
                  Search for “{suggestion}” <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            ) : null
          }
        />
        {departments.length ? (
          <div className="border-line mx-6 border-t pb-8 pt-6">
            <p className="eyebrow mb-3 text-center">Or browse a department</p>
            <DepartmentLinks departments={departments} />
          </div>
        ) : null}
      </div>
      {picks.length ? (
        <section aria-label={picksTitle} className="mt-10">
          <h2 className="font-display text-ink text-xl font-bold sm:text-2xl">{picksTitle}</h2>
          <ul className="no-scrollbar mt-4 flex snap-x gap-3 overflow-x-auto pb-2 sm:gap-4">
            {picks.map((product) => (
              <li key={product.id} className="w-40 shrink-0 snap-start sm:w-52">
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * No query at all is a DIFFERENT state from "no results". Rendering an empty
 * grid for someone who has not searched yet tells them the shop is empty;
 * this tells them what to type, and gives them somewhere to type it.
 */
export function EmptySearchPrompt({
  departments,
  searchBox,
  basePath,
}: {
  departments: Category[];
  searchBox: boolean;
  basePath: string;
}) {
  return (
    <div className="py-16 text-center sm:py-24">
      <h1 className="headline text-ink text-3xl sm:text-4xl">What are you looking for?</h1>
      <p className="text-muted mx-auto mt-3 max-w-md text-sm">
        Search by product, brand, colour or fabric — try &ldquo;linen shirt&rdquo; or &ldquo;block print kurta&rdquo;.
      </p>
      {searchBox ? (
        <div className="mx-auto mt-8 max-w-xl text-left">
          <SearchBox q="" basePath={basePath} size="regular" />
        </div>
      ) : null}
      <div className="mt-8">
        <DepartmentLinks departments={departments} />
      </div>
    </div>
  );
}

function DepartmentLinks({ departments }: { departments: Category[] }) {
  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {departments.map((department) => (
        <li key={department.id}>
          <Button asChild variant="secondary" size="sm" shape="pill">
            <Link href={`/category/${department.slug}`}>{department.name}</Link>
          </Button>
        </li>
      ))}
    </ul>
  );
}
