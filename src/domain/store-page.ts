/**
 * How the public store page is put together.
 *
 * THREE LAYOUTS, ONE LIVE. Marketing picks which layout every store uses and
 * switches each piece of it on or off. Each layout keeps its OWN switches, so
 * trying Spotlight for a week and going back to Classic brings Classic back
 * exactly as it was left, rather than with Spotlight's pared-down settings.
 *
 *   classic    the original page: profile card, full scorecard, filterable grid
 *   spotlight  a bold banner with the logo and name inside it, three trust
 *              numbers, then straight into products as reels
 *   studio     a social-profile page for shops that sell on Instagram: story-ring
 *              logo, bio, buttons, and a tight three-up reel wall
 *
 * Shared with the browser: the admin editor needs the same shapes and defaults.
 */

export const STORE_PAGE_VARIANTS = ['classic', 'spotlight', 'studio'] as const;
export type StorePageVariant = (typeof STORE_PAGE_VARIANTS)[number];

export const STORE_PAGE_VARIANT_META: Record<
  StorePageVariant,
  { number: number; name: string; description: string }
> = {
  classic: {
    number: 1,
    name: 'Classic',
    description:
      'The original store page: banner, profile card, the full scorecard and the filterable product listing.',
  },
  spotlight: {
    number: 2,
    name: 'Spotlight',
    description:
      'A bold banner with the logo and shop name inside it, three trust numbers, then straight into products as reels.',
  },
  studio: {
    number: 3,
    name: 'Studio',
    description:
      'A social-profile layout for shops that sell on Instagram: story-ring logo, short bio, action buttons and a tight reel wall.',
  },
};

export const PRODUCT_STYLES = ['grid', 'reels'] as const;
export type ProductStyle = (typeof PRODUCT_STYLES)[number];

export interface StorePageSettings {
  breadcrumbs: boolean;
  banner: boolean;
  logo: boolean;
  shopName: boolean;
  tagline: boolean;
  verifiedBadge: boolean;
  location: boolean;
  shareButton: boolean;
  /** A WhatsApp link to the store's support phone. Off unless marketing opts in. */
  contactButton: boolean;
  trustScore: boolean;
  deliveryTime: boolean;
  ordersShipped: boolean;
  ratingSummary: boolean;
  policies: boolean;
  about: boolean;
  products: boolean;
  productStyle: ProductStyle;
  productsTitle: string;
  search: boolean;
  /** Filters and sort on the grid; sort chips alone over reels. */
  filters: boolean;
  prices: boolean;
  /** The play mark on a reel tile, which opens the product's demo. */
  playButton: boolean;
}

export type StorePageToggle = {
  [K in keyof StorePageSettings]: StorePageSettings[K] extends boolean ? K : never;
}[keyof StorePageSettings];

/** The switches, in the order the editor shows them. */
export const STORE_PAGE_TOGGLE_GROUPS: Array<{
  title: string;
  toggles: Array<{ key: StorePageToggle; label: string; description: string }>;
}> = [
  {
    title: 'Top of the page',
    toggles: [
      { key: 'breadcrumbs', label: 'Breadcrumbs', description: 'Home › Sellers › Store, above everything.' },
      { key: 'banner', label: 'Banner image', description: 'The store’s cover photograph.' },
      { key: 'logo', label: 'Logo', description: 'The store’s mark.' },
      { key: 'shopName', label: 'Shop name', description: 'The store’s display name, as the headline.' },
      { key: 'tagline', label: 'Tagline', description: 'The one-line description under the name.' },
      { key: 'verifiedBadge', label: 'Verified badge', description: 'Shown only for stores whose KYC was verified.' },
      { key: 'location', label: 'City and year joined', description: 'Where the store is, and since when.' },
    ],
  },
  {
    title: 'Buttons',
    toggles: [
      { key: 'shareButton', label: 'Share', description: 'Copy link and share sheet.' },
      {
        key: 'contactButton',
        label: 'WhatsApp the store',
        description: 'Opens a chat with the store’s support phone. Only for stores that want to be reached directly.',
      },
      { key: 'search', label: 'Search this store', description: 'A search box scoped to the store’s products.' },
    ],
  },
  {
    title: 'Trust',
    toggles: [
      { key: 'trustScore', label: 'Trust score', description: 'The store’s fulfilment score, or the one set by the team.' },
      { key: 'deliveryTime', label: 'Delivery timing', description: 'Average ship time, or the dispatch promise.' },
      { key: 'ordersShipped', label: 'Orders shipped', description: 'Orders shipped, or products sold if set by the team.' },
      { key: 'ratingSummary', label: 'Rating', description: 'Average rating and how many.' },
      { key: 'policies', label: 'Returns and COD', description: 'Return window and cash on delivery.' },
      { key: 'about', label: 'About and policies', description: 'The long description, folded away.' },
    ],
  },
  {
    title: 'Products',
    toggles: [
      { key: 'products', label: 'Products', description: 'The store’s catalogue. Off leaves a profile page only.' },
      { key: 'filters', label: 'Filters and sort', description: 'The filter rail on the grid; sort chips over reels.' },
      { key: 'prices', label: 'Prices on reels', description: 'Price and discount over each reel tile.' },
      { key: 'playButton', label: 'Play button on reels', description: 'Opens the product demo from the tile.' },
    ],
  },
];

const ALL_ON: StorePageSettings = {
  breadcrumbs: true,
  banner: true,
  logo: true,
  shopName: true,
  tagline: true,
  verifiedBadge: true,
  location: true,
  shareButton: true,
  contactButton: false,
  trustScore: true,
  deliveryTime: true,
  ordersShipped: true,
  ratingSummary: true,
  policies: true,
  about: true,
  products: true,
  productStyle: 'grid',
  productsTitle: 'Shop this store',
  search: true,
  filters: true,
  prices: true,
  playButton: true,
};

export interface StorePageConfig {
  variant: StorePageVariant;
  settings: Record<StorePageVariant, StorePageSettings>;
}

export const DEFAULT_STORE_PAGE: StorePageConfig = {
  variant: 'classic',
  settings: {
    // Exactly the page as it shipped.
    classic: ALL_ON,
    // Banner, logo, name, three numbers, reels. Nothing else.
    spotlight: {
      ...ALL_ON,
      breadcrumbs: false,
      tagline: false,
      verifiedBadge: false,
      location: false,
      shareButton: false,
      ratingSummary: false,
      policies: false,
      about: false,
      productStyle: 'reels',
      productsTitle: 'Shop the reels',
      search: false,
      filters: false,
    },
    studio: {
      ...ALL_ON,
      breadcrumbs: false,
      location: false,
      policies: false,
      about: false,
      productStyle: 'reels',
      productsTitle: 'Reels',
      search: false,
    },
  },
};

/**
 * Stored settings over the defaults, per layout and per switch, so a switch
 * added later arrives with its default rather than as `undefined`.
 */
export function withStorePageDefaults(stored: Partial<StorePageConfig> | undefined): StorePageConfig {
  const variant =
    stored?.variant && STORE_PAGE_VARIANTS.includes(stored.variant)
      ? stored.variant
      : DEFAULT_STORE_PAGE.variant;

  return {
    variant,
    settings: Object.fromEntries(
      STORE_PAGE_VARIANTS.map((key) => [
        key,
        { ...DEFAULT_STORE_PAGE.settings[key], ...stored?.settings?.[key] },
      ]),
    ) as Record<StorePageVariant, StorePageSettings>,
  };
}
