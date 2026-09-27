/**
 * Which pieces of the storefront frame each page wears.
 *
 * The storefront layout wraps every page in the same four pieces: the
 * promotion strip, the header, the footer and the phone's bottom bar. Most
 * pages want all four. Some do not -- a checkout that should hold attention, a
 * store profile that should read like the seller's own site -- and that is a
 * merchandising decision, so it is data rather than a layout per route.
 *
 * PAGES ARE MATCHED BY THEIR FIRST PATH SEGMENT. Every storefront route already
 * lives under one (`/store/…`, `/product/…`), so the rule for a page family is
 * one lookup and cannot be confused by a neighbour: `/store` and `/stores` are
 * different segments, not a prefix of one another.
 *
 * Shared with the browser: the gate that applies these runs on the client,
 * because only the client knows the path without making every page dynamic.
 */

export const CHROME_PARTS = ['strip', 'header', 'footer', 'bottomNav'] as const;
export type ChromePart = (typeof CHROME_PARTS)[number];

export const CHROME_PART_LABEL: Record<ChromePart, string> = {
  strip: 'Promotion strip',
  header: 'Header',
  footer: 'Footer',
  bottomNav: 'Bottom bar',
};

export const CHROME_PART_HINT: Record<ChromePart, string> = {
  strip: 'The band of offers above the header.',
  header: 'Logo, menu, search and account.',
  footer: 'Links, badges and the legal line.',
  bottomNav: 'The tab bar on phones.',
};

export const CHROME_PAGES = [
  { key: 'home', label: 'Homepage', segment: '/', example: '/' },
  { key: 'shop', label: 'Shop (all categories)', segment: '/categories', example: '/categories' },
  { key: 'category', label: 'Category listings', segment: '/category', example: '/category/…' },
  { key: 'product', label: 'Product page', segment: '/product', example: '/product/…' },
  { key: 'search', label: 'Search results', segment: '/search', example: '/search' },
  { key: 'brands', label: 'Brands directory', segment: '/brands', example: '/brands' },
  { key: 'brand', label: 'Brand page', segment: '/brand', example: '/brand/…' },
  { key: 'stores', label: 'Sellers directory', segment: '/stores', example: '/stores' },
  { key: 'store', label: 'Store profile', segment: '/store', example: '/store/…' },
  { key: 'bag', label: 'Bag', segment: '/bag', example: '/bag' },
  { key: 'checkout', label: 'Checkout and payment', segment: '/checkout', example: '/checkout' },
  { key: 'wishlist', label: 'Saved items', segment: '/wishlist', example: '/wishlist' },
  { key: 'account', label: 'Account', segment: '/account', example: '/account/…' },
  { key: 'orders', label: 'Orders and tracking', segment: '/orders', example: '/orders' },
  { key: 'help', label: 'Help centre', segment: '/help', example: '/help/…' },
  { key: 'legal', label: 'Legal pages', segment: '/legal', example: '/legal/…' },
  { key: 'about', label: 'About', segment: '/about', example: '/about' },
  { key: 'sellWithUs', label: 'Sell with us', segment: '/sell-with-us', example: '/sell-with-us' },
] as const;

export type ChromePageKey = (typeof CHROME_PAGES)[number]['key'];

/**
 * Where a part shows. The phone bottom bar only ever shows on phones, so for
 * it the editor offers just `all` and `none`.
 */
export const CHROME_MODES = ['all', 'desktop', 'mobile', 'none'] as const;
export type ChromeMode = (typeof CHROME_MODES)[number];

export const CHROME_MODE_LABEL: Record<ChromeMode, string> = {
  all: 'Everywhere',
  desktop: 'Desktop only',
  mobile: 'Phones only',
  none: 'Off',
};

export type ChromeRule = Record<ChromePart, ChromeMode>;
export type PageChrome = Record<ChromePageKey, ChromeRule>;

/** One exact page with its own rule, ahead of its family's. */
export interface ChromeOverride {
  id: string;
  /** An exact path: `/sell-with-us/apply`. No query string. */
  path: string;
  rule: ChromeRule;
}

export interface PageLayoutRules {
  pages: PageChrome;
  overrides: ChromeOverride[];
}

const ALL_ON: ChromeRule = { strip: 'all', header: 'all', footer: 'all', bottomNav: 'all' };

/** Everything showing everywhere: how the shop has always looked. */
export const DEFAULT_PAGE_CHROME: PageLayoutRules = {
  pages: Object.fromEntries(CHROME_PAGES.map((page) => [page.key, ALL_ON])) as PageChrome,
  overrides: [],
};

const KEY_BY_SEGMENT = new Map<string, ChromePageKey>(
  CHROME_PAGES.map((page) => [page.segment, page.key]),
);

/** The page family a path belongs to, or null for one nobody has configured. */
export function chromePageFor(pathname: string | null): ChromePageKey | null {
  if (!pathname) return null;
  if (pathname === '/') return 'home';
  const segment = `/${pathname.split('/')[1] ?? ''}`;
  return KEY_BY_SEGMENT.get(segment) ?? null;
}

/**
 * What the client gate needs for one part: only the families and paths where
 * the part is NOT everywhere. Empty maps mean the gate need not mount at all.
 */
export interface PartModes {
  pages: Partial<Record<ChromePageKey, ChromeMode>>;
  paths: Record<string, ChromeMode>;
}

export function modesFor(rules: PageLayoutRules, part: ChromePart): PartModes {
  const pages: PartModes['pages'] = {};
  for (const page of CHROME_PAGES) {
    const mode = rules.pages[page.key]?.[part] ?? 'all';
    if (mode !== 'all') pages[page.key] = mode;
  }
  const paths: PartModes['paths'] = {};
  for (const override of rules.overrides) {
    // An override that says "everywhere" still matters: it can undo a family rule.
    paths[normalisePath(override.path)] = override.rule[part];
  }
  return { pages, paths };
}

export function hasRules(modes: PartModes): boolean {
  return Object.keys(modes.pages).length > 0 || Object.keys(modes.paths).length > 0;
}

/** The mode at one path: its own override first, then its family, then everywhere. */
export function modeAt(pathname: string | null, modes: PartModes): ChromeMode {
  if (pathname) {
    const own = modes.paths[normalisePath(pathname)];
    if (own) return own;
  }
  const page = chromePageFor(pathname);
  return (page && modes.pages[page]) || 'all';
}

export function normalisePath(path: string): string {
  const trimmed = path.trim().split(/[?#]/)[0] ?? '';
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
}

/** Old rules stored a boolean per part: true everywhere, false off. */
function toMode(value: unknown): ChromeMode {
  if (value === true || value === undefined) return 'all';
  if (value === false) return 'none';
  return (CHROME_MODES as readonly unknown[]).includes(value) ? (value as ChromeMode) : 'all';
}

function toRule(stored: Partial<Record<string, unknown>> | undefined): ChromeRule {
  return {
    strip: toMode(stored?.strip),
    header: toMode(stored?.header),
    footer: toMode(stored?.footer),
    bottomNav: toMode(stored?.bottomNav),
  };
}

/**
 * Stored rules over the defaults, page by page and part by part.
 *
 * Reads both shapes: the first version stored a plain map of page family to
 * booleans; this one stores `{ pages, overrides }` with a mode per part. A
 * family added later reads as showing everything, not as a page with no frame.
 */
export function withChromeDefaults(stored: unknown): PageLayoutRules {
  const value = (stored ?? {}) as Record<string, unknown>;
  const pagesSource = (value.pages && typeof value.pages === 'object' ? value.pages : value) as Record<
    string,
    Partial<Record<string, unknown>>
  >;
  const overrides = Array.isArray(value.overrides) ? (value.overrides as ChromeOverride[]) : [];
  return {
    pages: Object.fromEntries(CHROME_PAGES.map((page) => [page.key, toRule(pagesSource[page.key])])) as PageChrome,
    overrides: overrides.map((override) => ({
      id: String(override.id),
      path: normalisePath(String(override.path)),
      rule: toRule(override.rule as unknown as Record<string, unknown>),
    })),
  };
}
