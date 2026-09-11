import Link from 'next/link';

import { ChipRemove } from '@/components/ui/chip';
import type { Facet } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import {
  clearFilters,
  toggleParam,
  withParams,
  type RawSearchParams,
} from '@/lib/product-query';

/**
 * Applied filters, as removable chips above the grid.
 *
 * This surface did not exist before and its absence was the biggest usability
 * hole in the listing page. The filter rail knew what was applied; the RESULTS
 * did not say. On a phone, where the rail is behind a drawer, that meant a
 * shopper could be looking at 12 products out of 400 with nothing on screen
 * explaining why — the classic "the shop is broken, it has nothing in my size"
 * moment.
 *
 * Three rules:
 *
 *  1. **Every chip removes exactly its own filter**, using the same
 *     `toggleParam` the rail uses to add it. One function builds both URLs, so
 *     add and remove can never disagree.
 *  2. **The row WRAPS.** A single clipped row hides the filters furthest from
 *     the eye, which are exactly the ones someone has forgotten they applied.
 *  3. **Labels, not values.** The URL carries `color=nvy`; the chip says
 *     "Navy". The facet list is the only place that mapping exists, so it is
 *     passed in rather than reconstructed.
 *
 * Renders nothing when nothing is applied — an empty row of chips is a row of
 * vertical space that says "no filters", which the result count already said.
 */
export function AppliedFilters({
  facets,
  params,
  basePath,
  className,
}: {
  facets: Facet[];
  params: RawSearchParams;
  basePath: string;
  className?: string;
}) {
  const chips: Array<{ key: string; label: string; value: string; href: string }> = [];

  /* --------------------------------------------------- facet-backed chips */

  for (const facet of facets) {
    const selected = selectedValues(params, facet.key);
    for (const value of selected) {
      const known = facet.values.find((entry) => entry.value === value);
      chips.push({
        key: `${facet.key}:${value}`,
        label: facet.label,
        // A value that is no longer in the facet list — because the other
        // filters excluded it — still has to be removable, so it falls back to
        // its own raw value rather than disappearing from the row.
        value: known?.label ?? value,
        href: toggleParam(params, facet.key, value, basePath),
      });
    }
  }

  /* ------------------------------------------------------------ price band */

  const minPrice = single(params.minPrice);
  const maxPrice = single(params.maxPrice);

  if (minPrice || maxPrice) {
    const from = minPrice ? Number(minPrice) * 100 : 0;
    const to = maxPrice ? Number(maxPrice) * 100 : null;

    chips.push({
      key: 'price',
      label: 'Price',
      value:
        to == null
          ? `${formatMoney(from)} and above`
          : from === 0
            ? `Under ${formatMoney(to)}`
            : `${formatMoney(from)} – ${formatMoney(to)}`,
      href: withParams(params, { minPrice: null, maxPrice: null }, basePath),
    });
  }

  /* ------------------------------------------------------- simple toggles */

  if (single(params.inStock) === '1') {
    chips.push({
      key: 'inStock',
      label: 'Availability',
      value: 'In stock only',
      href: withParams(params, { inStock: null }, basePath),
    });
  }

  const discount = single(params.discount);
  if (discount) {
    chips.push({
      key: 'discount',
      label: 'Discount',
      value: `${discount}% off or more`,
      href: withParams(params, { discount: null }, basePath),
    });
  }

  const rating = single(params.rating);
  if (rating) {
    chips.push({
      key: 'rating',
      label: 'Rating',
      value: `${rating}★ and above`,
      href: withParams(params, { rating: null }, basePath),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span className="text-faint mr-0.5 text-2xs uppercase tracking-[0.14em]">Filtered by</span>

      {chips.map((chip) => (
        <ChipRemove key={chip.key} href={chip.href} label={chip.label} value={chip.value} />
      ))}

      {/*
        "Clear all" only earns its place once there are two filters to clear.
        With one applied it is a second control that does exactly what the chip
        beside it already does.
      */}
      {chips.length > 1 ? (
        <Link
          href={clearFilters(params, basePath)}
          className={cn(
            'text-muted hover:text-ink inline-flex min-h-11 items-center px-2 text-xs',
            'underline underline-offset-4 transition-colors lg:min-h-8',
          )}
        >
          Clear all
        </Link>
      ) : null}
    </div>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function selectedValues(params: RawSearchParams, key: string): string[] {
  const raw = params[key];
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : [raw];
  return parts.flatMap((part) => part.split(',')).filter(Boolean);
}
