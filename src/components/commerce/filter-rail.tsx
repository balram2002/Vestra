import { Check, X } from 'lucide-react';
import Link from 'next/link';

import type { Facet, PriceFacet } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import {
  clearFilters,
  toggleParam,
  withParams,
  type RawSearchParams,
} from '@/lib/product-query';

/**
 * Filter rail.
 *
 * Every control is a plain `<Link>` to a URL with one facet toggled. That is a
 * deliberate architectural choice, not a shortcut:
 *
 *  - filtering works with JavaScript still downloading, and keeps working if it
 *    never arrives;
 *  - each option is a real URL — middle-clickable, shareable, crawlable;
 *  - there is no client filter state to fall out of sync with the URL, which is
 *    the usual source of "the chips say Blue but the grid shows everything".
 *
 * The cost is a server round trip per toggle. With the listing query cached and
 * the shell prerendered that lands well inside the interaction budget, and it
 * buys correctness that a client store has to work hard to match.
 *
 * Filters are LINKS, not buttons: the filter state lives in the URL so a view
 * can be shared and bookmarked. That makes the active one `aria-current`, never
 * `aria-pressed` — `aria-pressed` is only valid on a button, and axe flagged 37
 * nodes here as `aria-allowed-attr` violations because of it.
 */
export function FilterRail({
  facets,
  priceFacet,
  params,
  basePath,
  appliedCount,
}: {
  facets: Facet[];
  priceFacet: PriceFacet;
  params: RawSearchParams;
  basePath: string;
  appliedCount: number;
}) {
  return (
    <aside aria-label="Filters" className="w-full">
      <div className="flex items-center justify-between pb-3">
        <h2 className="text-ink text-xs font-semibold uppercase tracking-wider">Filters</h2>
        {appliedCount > 0 ? (
          <Link
            href={clearFilters(params, basePath)}
            className="text-accent-ink text-xs font-medium hover:underline"
          >
            Clear all ({appliedCount})
          </Link>
        ) : null}
      </div>

      <PriceGroup priceFacet={priceFacet} params={params} basePath={basePath} />

      {facets.map((facet) => (
        <FacetGroup key={facet.key} facet={facet} params={params} basePath={basePath} />
      ))}
    </aside>
  );
}

function FacetGroup({
  facet,
  params,
  basePath,
}: {
  facet: Facet;
  params: RawSearchParams;
  basePath: string;
}) {
  const selected = new Set(selectedValues(params, facet.key));
  if (facet.values.length === 0) return null;

  return (
    // `<details>` gives collapse behaviour with no JavaScript and correct
    // keyboard semantics for free.
    <details open={facet.defaultOpen} className="border-line border-t py-3">
      <summary className="text-ink flex cursor-pointer list-none items-center justify-between text-sm font-medium">
        <span>
          {facet.label}
          {selected.size > 0 ? (
            <span className="text-accent-ink ml-1.5 text-xs">({selected.size})</span>
          ) : null}
        </span>
        <span className="text-faint text-xs transition-transform group-open:rotate-180">▾</span>
      </summary>

      <div className="pt-3">
        {facet.kind === 'color' ? (
          <ul className="flex flex-wrap gap-2">
            {facet.values.map((value) => {
              const active = selected.has(value.value);
              return (
                <li key={value.value}>
                  <Link
                    href={toggleParam(params, facet.key, value.value, basePath)}
                    aria-current={active ? 'true' : undefined}
                    title={`${value.label} (${value.count})`}
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full border transition-[box-shadow,border-color]',
                      active ? 'border-accent ring-accent ring-2 ring-offset-1' : 'border-line-strong',
                    )}
                    style={{ backgroundColor: value.hex }}
                  >
                    {/* Colour alone is never the only signal — a tick confirms selection. */}
                    {active ? (
                      <Check
                        className="size-3.5"
                        // Contrast the tick against the swatch it sits on.
                        style={{ color: isLight(value.hex) ? '#1a1815' : '#ffffff' }}
                      />
                    ) : null}
                    <span className="sr-only">
                      {value.label}, {value.count} items
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : facet.kind === 'size' ? (
          <ul className="flex flex-wrap gap-1.5">
            {facet.values.map((value) => {
              const active = selected.has(value.value);
              return (
                <li key={value.value}>
                  <Link
                    href={toggleParam(params, facet.key, value.value, basePath)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'flex h-8 min-w-9 items-center justify-center rounded-sm border px-2 text-xs transition-colors',
                      active
                        ? 'border-accent bg-accent-soft text-accent-ink font-medium'
                        : 'border-line-strong text-muted hover:border-line-bold hover:text-ink',
                    )}
                  >
                    {value.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="space-y-1.5">
            {facet.values.map((value) => {
              const active = selected.has(value.value);
              return (
                <li key={value.value}>
                  <Link
                    href={toggleParam(params, facet.key, value.value, basePath)}
                    aria-current={active ? 'true' : undefined}
                    className="group/item flex items-center gap-2 text-sm"
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-xs border transition-colors',
                        active ? 'border-accent bg-accent' : 'border-line-strong group-hover/item:border-line-bold',
                      )}
                    >
                      {active ? <Check className="size-3 text-white" /> : null}
                    </span>
                    <span className={cn('flex-1', active ? 'text-ink font-medium' : 'text-muted')}>
                      {value.label}
                    </span>
                    {value.count > 0 ? (
                      <span className="text-faint tabular text-2xs">{value.count}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}

/**
 * Price.
 *
 * Rendered as bands derived from the actual distribution rather than a slider:
 * a slider needs JavaScript, cannot be a link, and gives no sense of how many
 * products sit in each range. Bands answer "what can I get for under ₹1,500"
 * directly.
 */
function PriceGroup({
  priceFacet,
  params,
  basePath,
}: {
  priceFacet: PriceFacet;
  params: RawSearchParams;
  basePath: string;
}) {
  if (priceFacet.max <= priceFacet.min) return null;

  // The URL carries rupees (human-readable, shareable); bands are in paise,
  // like every other amount in the system. Convert once, here.
  const rawMin = Array.isArray(params.minPrice) ? params.minPrice[0] : params.minPrice;
  const rawMax = Array.isArray(params.maxPrice) ? params.maxPrice[0] : params.maxPrice;
  const currentMin = rawMin ? Number(rawMin) * 100 : null;
  const currentMax = rawMax ? Number(rawMax) * 100 : null;

  // Round bands to human numbers; ₹1,247 is not a price bracket anyone thinks in.
  const bands = buildBands(priceFacet.min, priceFacet.max);

  return (
    <details open className="border-line border-t py-3">
      <summary className="text-ink flex cursor-pointer list-none items-center justify-between text-sm font-medium">
        Price
        {currentMin != null || currentMax != null ? (
          <Link
            href={withParams(params, { minPrice: null, maxPrice: null }, basePath)}
            className="text-faint hover:text-ink"
            aria-label="Clear price filter"
          >
            <X className="size-3.5" />
          </Link>
        ) : null}
      </summary>

      <ul className="space-y-1.5 pt-3">
        {bands.map((band) => {
          // A band with no upper bound is stored as `null`, and an unset
          // `maxPrice` reads as `null` too, so the comparison lines up.
          const active = (currentMin ?? 0) === band.from && currentMax === band.to;
          const href = withParams(
            params,
            {
              minPrice: band.from > 0 ? String(band.from / 100) : null,
              maxPrice: band.to == null ? null : String(band.to / 100),
            },
            basePath,
          );

          return (
            <li key={band.label}>
              <Link
                href={active ? withParams(params, { minPrice: null, maxPrice: null }, basePath) : href}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'block text-sm transition-colors',
                  active ? 'text-accent-ink font-medium' : 'text-muted hover:text-ink',
                )}
              >
                {band.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function buildBands(min: number, max: number): Array<{ label: string; from: number; to: number | null }> {
  const steps = [500, 1000, 1500, 2500, 4000, 7000, 12000, 25000].map((r) => r * 100);
  const inRange = steps.filter((s) => s > min && s < max);

  const bands: Array<{ label: string; from: number; to: number | null }> = [];
  let cursor = 0;

  for (const step of inRange.slice(0, 5)) {
    bands.push({
      label: cursor === 0 ? `Under ${formatMoney(step)}` : `${formatMoney(cursor)} – ${formatMoney(step)}`,
      from: cursor,
      to: step,
    });
    cursor = step;
  }

  if (cursor < max) {
    bands.push({ label: `${formatMoney(cursor)} and above`, from: cursor, to: null });
  }

  return bands;
}

function selectedValues(params: RawSearchParams, key: string): string[] {
  const raw = params[key];
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : [raw];
  return parts.flatMap((p) => p.split(',')).filter(Boolean);
}

/** Whether a tick on this swatch should be dark. */
function isLight(hex: string | undefined): boolean {
  if (!hex) return false;
  const clean = hex.replace('#', '');
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}
