import Link from 'next/link';

import { PRODUCT_SORTS, PRODUCT_SORT_LABEL, type ProductSort } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { withParam, type RawSearchParams } from '@/lib/product-query';

/**
 * Listing toolbar: result count and sort.
 *
 * Sort is a row of LINKS rather than a `<select>`, for the same reason the
 * filters are: each order is a distinct, shareable URL and works without
 * JavaScript. On a phone it becomes a horizontally scrolling chip row, which is
 * a better touch target than a native picker anyway.
 *
 * The chips are their own export because a phone shows them inside the sticky
 * bar alongside the filter button, while a wide screen shows them here beside
 * the count. Same links, same styling, one definition — a second copy would
 * drift the moment a sort option is added.
 */
export function SortChips({
  activeSort,
  params,
  basePath,
  className,
}: {
  activeSort: ProductSort;
  params: RawSearchParams;
  basePath: string;
  className?: string;
}) {
  // Relevance only means something when there is a query to be relevant to.
  const sorts = PRODUCT_SORTS.filter((sort) => sort !== 'relevance' || Boolean(params.q));

  return (
    /*
      `min-w-0` on the ROW as well as on the scroller inside it.

      A flex child defaults to `min-width: auto` at every level, so the row
      refused to shrink below its content and pushed the document sideways even
      though the list inside it was set to scroll. Both have to opt out.
    */
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <span className="text-faint hidden shrink-0 text-2xs uppercase tracking-[0.14em] sm:inline">
        Sort
      </span>

      <ul className="no-scrollbar flex min-w-0 gap-1.5 overflow-x-auto">
        {sorts.map((sort) => {
          const active = sort === activeSort;
          return (
            // `shrink-0` on the ITEM: the global `min-width: 0` lets a flex
            // item shrink below its text, and the chips then piled on top of
            // each other on a phone instead of scrolling.
            <li key={sort} className="shrink-0">
              <Link
                href={withParam(params, 'sort', sort, basePath)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-3.5',
                  'text-xs transition-colors duration-(--duration-base) ease-(--ease-out)',
                  'motion-safe:active:scale-[0.96] lg:min-h-9',
                  active
                    ? 'border-ink bg-ink text-canvas font-semibold'
                    : 'border-line-control text-muted hover:border-line-bold hover:text-ink',
                )}
              >
                {PRODUCT_SORT_LABEL[sort]}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ListingToolbar({
  total,
  activeSort,
  params,
  basePath,
  className,
}: {
  total: number;
  activeSort: ProductSort;
  params: RawSearchParams;
  basePath: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-line flex flex-col gap-3 border-b pb-3.5 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      {/*
        `role="status"` so the count is announced when it changes.

        A filter toggle here is a navigation, and without a live region the only
        feedback a screen-reader user gets that the grid changed is that focus
        moved — which it does on every link. Saying "94 items" out loud is the
        confirmation the visual grid gives everyone else.
      */}
      <p className="text-muted text-sm" role="status">
        <span className="text-ink tabular font-semibold">{formatNumber(total)}</span>{' '}
        {total === 1 ? 'item' : 'items'}
      </p>

      <SortChips activeSort={activeSort} params={params} basePath={basePath} />
    </div>
  );
}
