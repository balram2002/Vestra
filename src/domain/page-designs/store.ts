import type { PageDesignDefinition } from './types';

/**
 * The public store page, `/store/[slug]`.
 *
 * THREE LAYOUTS, ONE LIVE. Each layout keeps its OWN settings, so trying
 * Spotlight for a week and going back to Classic brings Classic back exactly
 * as it was left.
 *
 *   classic    the original page: profile card, full scorecard, filterable grid
 *   spotlight  a bold banner with the logo and name inside it, three trust
 *              numbers, then straight into products as reels
 *   studio     a social-profile page for shops that sell on Instagram
 */

export const STORE_PAGE_VARIANTS = ['classic', 'spotlight', 'studio'] as const;
export type StorePageVariant = (typeof STORE_PAGE_VARIANTS)[number];

export const PRODUCT_STYLES = ['grid', 'reels'] as const;
export type ProductStyle = (typeof PRODUCT_STYLES)[number];

export interface StorePageSettings {
  [key: string]: boolean | string;
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
  search: boolean;
  trustScore: boolean;
  deliveryTime: boolean;
  ordersShipped: boolean;
  ratingSummary: boolean;
  policies: boolean;
  about: boolean;
  products: boolean;
  productStyle: ProductStyle;
  productsTitle: string;
  /** Filters and sort on the grid; sort chips alone over reels. */
  filters: boolean;
  prices: boolean;
  /** The play mark on a reel tile, which opens the product's demo. */
  playButton: boolean;
}

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
  search: true,
  trustScore: true,
  deliveryTime: true,
  ordersShipped: true,
  ratingSummary: true,
  policies: true,
  about: true,
  products: true,
  productStyle: 'grid',
  productsTitle: 'Shop this store',
  filters: true,
  prices: true,
  playButton: true,
};

export const storePageDesign: PageDesignDefinition<StorePageVariant, StorePageSettings> = {
  page: 'store',
  title: 'Store page',
  description:
    'Choose the layout every seller’s store page uses, and switch each of its sections and buttons on or off.',
  route: '/store/…',
  variants: STORE_PAGE_VARIANTS,
  defaultVariant: 'classic',
  variantMeta: {
    classic: {
      number: 1,
      name: 'Classic',
      description:
        'The original store page: banner, profile card, the full scorecard and the filterable product listing.',
      sketch: 'store-classic',
    },
    spotlight: {
      number: 2,
      name: 'Spotlight',
      description:
        'A bold banner with the logo and shop name inside it, three trust numbers, then straight into products as reels.',
      sketch: 'store-spotlight',
    },
    studio: {
      number: 3,
      name: 'Studio',
      description:
        'A social-profile layout for shops that sell on Instagram: story-ring logo, short bio, action buttons and a tight reel wall.',
      sketch: 'store-studio',
    },
  },
  groups: [
    {
      title: 'Top of the page',
      fields: [
        { kind: 'toggle', key: 'breadcrumbs', label: 'Breadcrumbs', description: 'Home › Sellers › Store, above everything.' },
        { kind: 'toggle', key: 'banner', label: 'Banner image', description: 'The store’s cover photograph.' },
        { kind: 'toggle', key: 'logo', label: 'Logo', description: 'The store’s mark.' },
        { kind: 'toggle', key: 'shopName', label: 'Shop name', description: 'The store’s display name, as the headline.' },
        { kind: 'toggle', key: 'tagline', label: 'Tagline', description: 'The one-line description under the name.' },
        { kind: 'toggle', key: 'verifiedBadge', label: 'Verified badge', description: 'Shown only for stores whose KYC was verified.' },
        { kind: 'toggle', key: 'location', label: 'City and year joined', description: 'Where the store is, and since when.' },
      ],
    },
    {
      title: 'Buttons',
      fields: [
        { kind: 'toggle', key: 'shareButton', label: 'Share', description: 'Copy link and share sheet.' },
        {
          kind: 'toggle',
          key: 'contactButton',
          label: 'WhatsApp the store',
          description: 'Opens a chat with the store’s support phone. Only for stores that want to be reached directly.',
        },
        { kind: 'toggle', key: 'search', label: 'Search this store', description: 'A search box scoped to the store’s products.' },
      ],
    },
    {
      title: 'Trust',
      fields: [
        { kind: 'toggle', key: 'trustScore', label: 'Trust score', description: 'The store’s fulfilment score, or the one set by the team.' },
        { kind: 'toggle', key: 'deliveryTime', label: 'Delivery timing', description: 'Average ship time, or the dispatch promise.' },
        { kind: 'toggle', key: 'ordersShipped', label: 'Orders shipped', description: 'Orders shipped, or products sold if set by the team.' },
        { kind: 'toggle', key: 'ratingSummary', label: 'Rating', description: 'Average rating and how many.' },
        { kind: 'toggle', key: 'policies', label: 'Returns and COD', description: 'Return window and cash on delivery.' },
        { kind: 'toggle', key: 'about', label: 'About and policies', description: 'The long description, folded away.' },
      ],
    },
    {
      title: 'Products',
      fields: [
        { kind: 'toggle', key: 'products', label: 'Products', description: 'The store’s catalogue. Off leaves a profile page only.' },
        {
          kind: 'choice',
          key: 'productStyle',
          label: 'Product layout',
          description: 'Reels are tall 9:16 tiles; the grid is the standard product card. Studio shows both as tabs and opens on this one.',
          options: [
            { value: 'reels', label: 'Reels' },
            { value: 'grid', label: 'Grid' },
          ],
        },
        { kind: 'text', key: 'productsTitle', label: 'Section title', maxLength: 60, placeholder: 'Leave empty for no title' },
        { kind: 'toggle', key: 'filters', label: 'Filters and sort', description: 'The filter rail on the grid; sort chips over reels.' },
        { kind: 'toggle', key: 'prices', label: 'Prices on reels', description: 'Price and discount over each reel tile.' },
        { kind: 'toggle', key: 'playButton', label: 'Play button on reels', description: 'Opens the product demo from the tile.' },
      ],
    },
  ],
  defaults: {
    classic: ALL_ON,
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
  preview: {
    entity: 'seller',
    path: (slug, variant) => `/store/${slug}/preview/${variant}`,
  },
};
