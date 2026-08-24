import { CATALOG } from '@/config/business';
import { GENDERS, type Gender } from '@/domain/attributes';
import { PRODUCT_SORTS, type ProductQuery, type ProductSort } from '@/domain/types';

/**
 * The URL is the state.
 *
 * Filters live in the query string, not in a client store, which is what makes
 * a filtered listing shareable, bookmarkable, back-button-correct and
 * server-renderable. This module is the single translation between the two
 * directions, so a filter added to the rail cannot go missing from the parser.
 *
 * Parsing is defensive on purpose: a URL is user input, and a hand-edited
 * `?page=-4&sort=cheapest` must degrade to sensible defaults rather than throw.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Multi-value params accept both `?color=a&color=b` and `?color=a,b`. */
function many(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const parts = Array.isArray(value) ? value : [value];
  return parts
    .flatMap((part) => part.split(','))
    .map((part) => part.trim())
    .filter(Boolean);
}

function int(value: string | string[] | undefined): number | undefined {
  const raw = first(value);
  if (raw == null || raw === '') return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Attribute filters arrive as `attr.fit=slim,relaxed`. */
const ATTRIBUTE_PREFIX = 'attr.';

export function parseProductQuery(
  params: RawSearchParams,
  overrides: Partial<ProductQuery> = {},
): ProductQuery {
  const sortParam = first(params.sort) as ProductSort | undefined;
  const sort = sortParam && PRODUCT_SORTS.includes(sortParam) ? sortParam : undefined;

  const genders = many(params.gender).filter((g): g is Gender =>
    (GENDERS as readonly string[]).includes(g),
  );

  const attributes: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!key.startsWith(ATTRIBUTE_PREFIX)) continue;
    const values = many(value);
    if (values.length > 0) attributes[key.slice(ATTRIBUTE_PREFIX.length)] = values;
  }

  // Prices are entered in rupees but stored in paise.
  const minRupees = int(params.minPrice);
  const maxRupees = int(params.maxPrice);

  return {
    q: first(params.q)?.trim() || undefined,
    brandSlugs: many(params.brand),
    colors: many(params.color),
    sizes: many(params.size),
    genders: genders.length > 0 ? genders : undefined,
    attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
    minPrice: minRupees != null ? Math.max(0, minRupees) * 100 : undefined,
    maxPrice: maxRupees != null ? Math.max(0, maxRupees) * 100 : undefined,
    minDiscount: int(params.discount),
    minRating: int(params.rating),
    inStockOnly: first(params.inStock) === '1',
    sort,
    page: Math.max(1, int(params.page) ?? 1),
    pageSize: CATALOG.productsPerPage,
    ...overrides,
  };
}

/**
 * Build a URL with one facet value toggled.
 *
 * Returning a string rather than mutating shared state is what lets every
 * filter control be a plain `<Link>` — so filtering works without JavaScript,
 * and each option is a real, crawlable, middle-clickable URL.
 */
export function toggleParam(
  params: RawSearchParams,
  key: string,
  value: string,
  basePath: string,
): string {
  const search = new URLSearchParams();

  for (const [k, v] of Object.entries(params)) {
    if (k === 'page') continue; // any filter change returns to page 1
    for (const item of many(v)) search.append(k, item);
  }

  const existing = search.getAll(key);
  search.delete(key);

  const next = existing.includes(value)
    ? existing.filter((item) => item !== value)
    : [...existing, value];

  for (const item of next) search.append(key, item);

  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Replace a single-valued param (sort, page, price bounds). */
export function withParam(
  params: RawSearchParams,
  key: string,
  value: string | null,
  basePath: string,
): string {
  const search = new URLSearchParams();

  for (const [k, v] of Object.entries(params)) {
    if (k === key) continue;
    if (k === 'page' && key !== 'page') continue;
    for (const item of many(v)) search.append(k, item);
  }

  if (value != null && value !== '') search.set(key, value);

  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * Set several params in one go.
 *
 * Needed because these helpers return a URL string, not a params object, so
 * `withParam(withParam(...))` cannot compose. A price band changes two bounds
 * at once and must produce a single URL.
 */
export function withParams(
  params: RawSearchParams,
  patch: Record<string, string | null>,
  basePath: string,
): string {
  const search = new URLSearchParams();

  for (const [k, v] of Object.entries(params)) {
    if (k in patch) continue;
    if (k === 'page') continue; // any change returns to page 1
    for (const item of many(v)) search.append(k, item);
  }

  for (const [k, v] of Object.entries(patch)) {
    if (v != null && v !== '') search.set(k, v);
  }

  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Strip every filter, keeping only the sort. */
export function clearFilters(params: RawSearchParams, basePath: string): string {
  const sort = first(params.sort);
  return sort ? `${basePath}?sort=${sort}` : basePath;
}

/**
 * Whether this URL should be indexed.
 *
 * Filtered and deep-paginated variants are near-duplicates of the clean
 * category page and would dilute it, so only page 1 of an unfiltered listing is
 * indexable. Everything else is `noindex, follow` — crawlable for discovery,
 * absent from the index.
 */
export function isIndexableListing(query: ProductQuery): boolean {
  const filtered =
    (query.brandSlugs?.length ?? 0) > 0 ||
    (query.colors?.length ?? 0) > 0 ||
    (query.sizes?.length ?? 0) > 0 ||
    (query.genders?.length ?? 0) > 0 ||
    query.minPrice != null ||
    query.maxPrice != null ||
    query.minDiscount != null ||
    query.minRating != null ||
    query.inStockOnly === true ||
    Object.keys(query.attributes ?? {}).length > 0;

  if (filtered) return false;
  return (query.page ?? 1) <= CATALOG.maxPagesIndexable;
}
