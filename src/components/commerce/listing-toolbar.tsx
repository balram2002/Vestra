import Link from 'next/link';

import { PRODUCT_SORTS, PRODUCT_SORT_LABEL, type ProductSort } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { withParam, type RawSearchParams } from '@/lib/product-query';

/**
 * Listing toolbar: result count and sort.
 *
 * Sort is a list of links rather than a `<select>`, for the same reason the
 * filters are: each order is a distinct, shareable URL and works without
 * JavaScript. On small screens it becomes a horizontally scrolling chip row,
 * which is a better touch target than a native picker anyway.
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
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-faint hidden shrink-0 text-xs uppercase tracking-wider sm:inline">
        Sort
      </span>
      <ul className="scrollbar-none flex gap-1.5 overflow-x-auto">
        {sorts.map((sort) => {
          const active = sort === activeSort;
          return (
            <li key={sort}>
              <Link
                href={withParam(params, 'sort', sort, basePath)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'block whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs transition-colors',
                  active
                    ? 'bg-accent-soft text-accent-ink font-medium'
                    : 'text-muted hover:bg-sunken hover:text-ink',
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
        'border-line flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <p className="text-muted text-sm" role="status">
        <span className="text-ink tabular font-semibold">{formatNumber(total)}</span>{' '}
        {total === 1 ? 'item' : 'items'}
      </p>

      <SortChips activeSort={activeSort} params={params} basePath={basePath} />
    </div>
  );
}
