import { AppliedFilters } from '@/components/commerce/applied-filters';
import { FilterDrawer } from '@/components/commerce/filter-drawer';
import { FilterRail } from '@/components/commerce/filter-rail';
import { ListingToolbar, SortChips } from '@/components/commerce/listing-toolbar';
import { Pagination } from '@/components/commerce/pagination';
import { ProductGrid } from '@/components/commerce/product-grid';
import type { ProductListResult, ProductSort } from '@/domain/types';
import { cn } from '@/lib/cn';
import type { RawSearchParams } from '@/lib/product-query';
import { currentOwner } from '@/server/auth/session';
import { getWishlistIds } from '@/server/services/wishlist';

/**
 * The listing page, as one component.
 *
 * Four routes render a filtered product listing — search, category, brand and
 * store — and each of them had its own copy of this arrangement. Four copies is
 * four chances for the filter drawer to be missing from one of them, the sort
 * chips to be above the count on another, and a fix to land on three.
 *
 * So the whole listing is one component and the pages supply only what makes
 * them different: the result, the base path, and their own heading.
 *
 * THE LAYOUT, and why each piece is where it is:
 *
 *   ┌ heading (the page's own) ─────────────────────────────────────────────┐
 *   ├ [ Filters ▾ ]  ·  sort chips ────────────── (phone: sticky bar) ──────┤
 *   ├ applied filter chips ─────────────────────────────────────────────────┤
 *   ├──────────┬────────────────────────────────────────────────────────────┤
 *   │  rail    │  count · sort            (desktop)                         │
 *   │ (≥lg)    │  ┌────┬────┬────┬────┐                                     │
 *   │          │  │    │    │    │    │  grid                               │
 *   └──────────┴────────────────────────────────────────────────────────────┘
 *
 * **The mobile control bar is sticky.** On a 400-item category, scrolling to
 * row twelve and then having to scroll all the way back up to change a filter
 * is the single most common complaint about mobile listings. It sticks below
 * the header, using the header's own token so the two cannot end up four pixels
 * apart.
 *
 * **Applied filters sit above the grid at every width**, not just on mobile.
 * On a desktop the rail already shows what is ticked, but the chips are where
 * someone's eye already is — next to the results that changed.
 */
export async function ListingView({
  result,
  params,
  basePath,
  sort,
  heading,
  /** Rendered instead of the grid when nothing matched. Pages word this themselves. */
  emptyState,
  className,
}: {
  result: ProductListResult;
  params: RawSearchParams;
  basePath: string;
  sort: ProductSort;
  heading?: React.ReactNode;
  emptyState?: React.ReactNode;
  className?: string;
}) {
  /*
   * Which of these are already saved.
   *
   * Reading the session here is safe precisely because every caller renders
   * this inside a `<Suspense>` boundary that has already awaited
   * `searchParams` — the route is dynamic from that point on, so one more
   * cookie read costs nothing and does not touch the prerendered shell.
   */
  const savedIds = await getWishlistIds(await currentOwner());

  const rail = (
    <FilterRail
      facets={result.facets}
      priceFacet={result.priceFacet}
      params={params}
      basePath={basePath}
      appliedCount={result.appliedFilterCount}
    />
  );

  return (
    <div className={className}>
      {heading}

      {/*
        The phone control bar.

        `top` is the header's own height token rather than a number, so this
        never ends up floating four pixels under or over the header when the bar
        height changes. `-mx` + `px` makes the sticky element full-bleed so its
        background covers the grid scrolling under it, while its contents stay
        on the page grid.
      */}
      <div
        className={cn(
          'glass border-line sticky z-30 -mx-4 mt-4 flex items-center gap-3 border-b px-4 py-2.5',
          'top-(--spacing-header) sm:-mx-6 sm:px-6 lg:hidden',
        )}
      >
        <FilterDrawer appliedCount={result.appliedFilterCount}>{rail}</FilterDrawer>

        {/*
          `min-w-0` is load-bearing here.

          A flex child defaults to `min-width: auto`, so without it the chip row
          refuses to shrink below its content and pushes the filter button off
          the left edge of a 360px screen instead of scrolling.
        */}
        <SortChips activeSort={sort} params={params} basePath={basePath} className="min-w-0" />
      </div>

      <AppliedFilters
        facets={result.facets}
        params={params}
        basePath={basePath}
        className="mt-4"
      />

      <div className="mt-5 flex gap-8 lg:mt-6 lg:gap-10">
        {/*
          The rail is `sticky` on a desktop too, and for the same reason: eleven
          facets is taller than a screen, and a rail that scrolls away means
          filtering row forty requires scrolling back to row one.
        */}
        <div className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-[calc(var(--spacing-header-lg)+1.5rem)] max-h-[calc(100dvh-var(--spacing-header-lg)-3rem)] overflow-y-auto overscroll-contain pr-1">
            {rail}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <ListingToolbar
            total={result.total}
            activeSort={sort}
            params={params}
            basePath={basePath}
            className="hidden lg:flex"
          />

          <div className="lg:mt-6">
            {result.total === 0 && emptyState ? (
              emptyState
            ) : (
              <ProductGrid
                products={result.items}
                savedIds={savedIds}
                emptyAction={{ href: basePath, label: 'Clear all filters' }}
              />
            )}
          </div>

          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            params={params}
            basePath={basePath}
          />
        </div>
      </div>
    </div>
  );
}
