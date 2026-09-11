import { Check, ChevronDown, X } from 'lucide-react';
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
 *  - filtering works while JavaScript is still downloading, and keeps working
 *    if it never arrives;
 *  - each option is a real URL — middle-clickable, shareable, crawlable;
 *  - there is no client filter state to fall out of sync with the URL, which is
 *    the usual source of "the chips say Blue but the grid shows everything".
 *
 * The cost is a server round trip per toggle. With the listing query cached and
 * the shell prerendered that lands well inside the interaction budget, and it
 * buys a correctness a client store has to work hard to match.
 *
 * Because they are links, the active one is `aria-current` and never
 * `aria-pressed` — `aria-pressed` is only valid on a button, and an axe run
 * flagged 37 nodes here for exactly that.
 *
 * `<details>` gives the collapse behaviour with no JavaScript and correct
 * keyboard semantics for free. The chevron rotates off `group-open`, which is
 * why the `<details>` carries `group` — without it the marker never turns and
 * the section looks stuck.
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
      <div className="flex items-center justify-between pb-1">
        <h2 className="text-ink text-2xs font-semibold uppercase tracking-[0.14em]">Filters</h2>
        {appliedCount > 0 ? (
          <Link
            href={clearFilters(params, basePath)}
            className="text-accent-ink inline-flex min-h-9 items-center text-xs font-medium hover:underline"
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

/** The shared `<summary>` row, so every group opens the same way. */
function GroupSummary({
  label,
  count,
  action,
}: {
  label: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <summary
      className={cn(
        'text-ink flex min-h-11 cursor-pointer list-none items-center justify-between gap-2',
        'text-sm font-medium [&::-webkit-details-marker]:hidden',
      )}
    >
      <span className="flex items-center gap-1.5">
        {label}
        {count ? (
          <span className="bg-accent-soft text-accent-ink tabular rounded-full px-1.5 py-0.5 text-2xs font-semibold">
            {count}
          </span>
        ) : null}
      </span>

      <span className="flex items-center gap-1">
        {action}
        <ChevronDown
          className="text-faint size-4 transition-transform duration-(--duration-base) group-open:rotate-180"
          aria-hidden
        />
      </span>
    </summary>
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
    <details open={facet.defaultOpen} className="border-line group border-t py-1.5">
      <GroupSummary label={facet.label} count={selected.size} />

      <div className="pb-3 pt-2">
        {facet.kind === 'color' ? (
          <ul className="flex flex-wrap gap-1.5">
            {facet.values.map((value) => {
              const active = selected.has(value.value);
              return (
                <li key={value.value}>
                  <Link
                    href={toggleParam(params, facet.key, value.value, basePath)}
                    aria-current={active ? 'true' : undefined}
                    title={`${value.label} (${value.count})`}
                    className={cn(
                      'grid size-11 place-items-center rounded-full lg:size-9',
                      'transition-transform duration-(--duration-base) ease-(--ease-out)',
                      'motion-safe:active:scale-90',
                      'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-1',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-6 place-items-center rounded-full',
                        // A hairline inside, so a white swatch is visible on
                        // white; the selection ring outside, so selecting does
                        // not change the swatch's size.
                        'ring-1 ring-inset ring-black/15',
                        'outline-offset-[3px]',
                        active ? 'outline-ink outline-2' : 'outline-0',
                      )}
                      style={{ backgroundColor: value.hex }}
                    >
                      {/* Colour is never the only signal — a tick confirms it. */}
                      {active ? (
                        <Check
                          className="size-3.5"
                          strokeWidth={3}
                          style={{ color: isLight(value.hex) ? '#151b23' : '#ffffff' }}
                          aria-hidden
                        />
                      ) : null}
                    </span>
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
                      'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3',
                      'text-xs font-medium transition-colors duration-(--duration-base)',
                      'motion-safe:active:scale-[0.96] lg:min-h-9 lg:min-w-9',
                      active
                        ? 'border-ink bg-ink text-canvas'
                        : 'border-line-control text-muted hover:border-line-bold hover:text-ink',
                    )}
                  >
                    {value.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul>
            {facet.values.map((value) => {
              const active = selected.has(value.value);
              return (
                <li key={value.value}>
                  <Link
                    href={toggleParam(params, facet.key, value.value, basePath)}
                    aria-current={active ? 'true' : undefined}
                    className="group/item flex min-h-11 items-center gap-2.5 text-sm lg:min-h-9"
                  >
                    <span
                      className={cn(
                        'grid size-[18px] shrink-0 place-items-center rounded-xs border',
                        'transition-colors duration-(--duration-fast)',
                        active
                          ? 'border-accent bg-accent'
                          : 'border-line-control group-hover/item:border-line-bold',
                      )}
                      aria-hidden
                    >
                      {active ? <Check className="size-3 text-white" strokeWidth={3} /> : null}
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
 * Rendered as bands derived from the actual distribution rather than a slider.
 * A slider needs JavaScript, cannot be a link, and — the part that actually
 * matters — gives no sense of how many products sit in each range. Bands answer
 * "what can I get for under ₹1,500" directly, which is the question.
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
  const applied = currentMin != null || currentMax != null;

  // Round bands to human numbers; ₹1,247 is not a bracket anyone thinks in.
  const bands = buildBands(priceFacet.min, priceFacet.max);

  return (
    <details open className="border-line group border-t py-1.5">
      <GroupSummary
        label="Price"
        action={
          applied ? (
            <Link
              href={withParams(params, { minPrice: null, maxPrice: null }, basePath)}
              className="text-faint hover:text-ink grid size-7 place-items-center rounded-full"
              aria-label="Clear price filter"
            >
              <X className="size-3.5" aria-hidden />
            </Link>
          ) : null
        }
      />

      <ul className="pb-3 pt-1">
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
                href={
                  active ? withParams(params, { minPrice: null, maxPrice: null }, basePath) : href
                }
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex min-h-11 items-center text-sm transition-colors lg:min-h-9',
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

function buildBands(
  min: number,
  max: number,
): Array<{ label: string; from: number; to: number | null }> {
  const steps = [500, 1000, 1500, 2500, 4000, 7000, 12000, 25000].map((r) => r * 100);
  const inRange = steps.filter((s) => s > min && s < max);

  const bands: Array<{ label: string; from: number; to: number | null }> = [];
  let cursor = 0;

  for (const step of inRange.slice(0, 5)) {
    bands.push({
      label:
        cursor === 0
          ? `Under ${formatMoney(step)}`
          : `${formatMoney(cursor)} – ${formatMoney(step)}`,
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
