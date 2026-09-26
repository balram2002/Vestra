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

export type ChromeRule = Record<ChromePart, boolean>;
export type PageChrome = Record<ChromePageKey, ChromeRule>;

const ALL_ON: ChromeRule = { strip: true, header: true, footer: true, bottomNav: true };

/** Everything showing everywhere: how the shop has always looked. */
export const DEFAULT_PAGE_CHROME = Object.fromEntries(
  CHROME_PAGES.map((page) => [page.key, ALL_ON]),
) as PageChrome;

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

/** The page families on which one part is switched off. */
export function hiddenPagesFor(chrome: PageChrome, part: ChromePart): ChromePageKey[] {
  return CHROME_PAGES.filter((page) => chrome[page.key]?.[part] === false).map((page) => page.key);
}

/**
 * Stored rules over the defaults, page by page and part by part.
 *
 * Deep, unlike the rest of the site content: a record saved before a page
 * family existed must read as that page showing everything, not as a page
 * with no frame at all.
 */
export function withChromeDefaults(stored: Partial<Record<string, Partial<ChromeRule>>> | undefined): PageChrome {
  return Object.fromEntries(
    CHROME_PAGES.map((page) => [page.key, { ...ALL_ON, ...stored?.[page.key] }]),
  ) as PageChrome;
}
