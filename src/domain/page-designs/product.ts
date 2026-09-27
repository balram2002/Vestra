import type { PageDesignDefinition } from './types';

/**
 * The product page, `/product/[slug]`.
 *
 *   classic   the page as it shipped: thumbnails and a zoomable photo beside
 *             the buy box, details and specifications below
 *   lookbook  image-led: the photographs stacked full width beside a buy panel
 *             that stays in view, the highlights set large between them, and
 *             "complete the look" from the same store
 *   social    for sellers who live on Instagram: a tall 9:16 hero, the seller
 *             up front with WhatsApp and "See it live", photo reviews first,
 *             and more from the store as reels
 *
 * All three share one buy box -- colour, size, stock and Add to bag are the
 * same component in every layout -- so a layout can change how the page
 * looks, never how buying works.
 */

export const PRODUCT_PAGE_VARIANTS = ['classic', 'lookbook', 'social'] as const;
export type ProductPageVariant = (typeof PRODUCT_PAGE_VARIANTS)[number];

export interface ProductPageSettings {
  [key: string]: boolean | string;
  breadcrumbs: boolean;
  share: boolean;
  zoom: boolean;
  demoButton: boolean;
  sizeGuide: boolean;
  seeLive: boolean;
  wishlist: boolean;
  stickyBar: boolean;
  urgency: boolean;
  ctaLabel: string;
  sellerCard: boolean;
  whatsapp: boolean;
  returnsInfo: boolean;
  highlights: boolean;
  details: boolean;
  specifications: boolean;
  reviews: boolean;
  photoReviewsFirst: boolean;
  storeRail: boolean;
  storeRailTitle: string;
  related: boolean;
  relatedTitle: string;
}

const ALL_ON: ProductPageSettings = {
  breadcrumbs: true,
  share: true,
  zoom: true,
  demoButton: true,
  sizeGuide: true,
  seeLive: true,
  wishlist: true,
  stickyBar: true,
  urgency: true,
  ctaLabel: 'Add to bag',
  sellerCard: true,
  whatsapp: false,
  returnsInfo: true,
  highlights: true,
  details: true,
  specifications: true,
  reviews: true,
  photoReviewsFirst: false,
  storeRail: false,
  storeRailTitle: 'More from this store',
  related: true,
  relatedTitle: 'You might also like',
};

export const productPageDesign: PageDesignDefinition<ProductPageVariant, ProductPageSettings> = {
  page: 'product',
  title: 'Product page',
  description: 'Choose how every product page is laid out, and switch each part of it on or off.',
  route: '/product/…',
  variants: PRODUCT_PAGE_VARIANTS,
  defaultVariant: 'classic',
  variantMeta: {
    classic: {
      number: 1,
      name: 'Classic',
      description: 'Thumbnails and a zoomable photo beside the buy box, then details, specifications, reviews and related items.',
      sketch: 'product-classic',
    },
    lookbook: {
      number: 2,
      name: 'Lookbook',
      description: 'Photographs stacked full width beside a buy panel that stays in view, highlights set large between them, and “complete the look”.',
      sketch: 'product-lookbook',
    },
    social: {
      number: 3,
      name: 'Social',
      description: 'A tall 9:16 hero, the seller up front with WhatsApp and “See it live”, photo reviews first, and more from the store as reels.',
      sketch: 'product-social',
    },
  },
  groups: [
    {
      title: 'Top and gallery',
      fields: [
        { kind: 'toggle', key: 'breadcrumbs', label: 'Breadcrumbs', description: 'The category trail above the page.' },
        { kind: 'toggle', key: 'share', label: 'Share', description: 'Copy link, share sheet and the demo link.' },
        { kind: 'toggle', key: 'zoom', label: 'Zoom on hover', description: 'Desktop photos magnify under the pointer.' },
        { kind: 'toggle', key: 'demoButton', label: '“Watch the demo” button', description: 'Shown when the product has a video.' },
      ],
    },
    {
      title: 'Buying',
      fields: [
        { kind: 'toggle', key: 'sizeGuide', label: 'Size guide', description: 'The measurements link beside the sizes.' },
        { kind: 'toggle', key: 'seeLive', label: '“See it live”', description: 'Start a video call with the store.' },
        { kind: 'toggle', key: 'wishlist', label: 'Save to wishlist', description: 'The heart beside Add to bag.' },
        { kind: 'toggle', key: 'stickyBar', label: 'Pinned buy bar on phones', description: 'Price and Add to bag at the bottom of the screen.' },
        { kind: 'toggle', key: 'urgency', label: 'Low stock note', description: '“Only 2 left in size M.”' },
        { kind: 'text', key: 'ctaLabel', label: 'Button label', maxLength: 24, placeholder: 'Add to bag' },
      ],
    },
    {
      title: 'Trust',
      fields: [
        { kind: 'toggle', key: 'sellerCard', label: 'Seller card', description: 'Who sells it, their rating and dispatch record.' },
        { kind: 'toggle', key: 'whatsapp', label: 'WhatsApp the store', description: 'A chat link to the store’s support phone, on the seller card.' },
        { kind: 'toggle', key: 'returnsInfo', label: 'Returns', description: 'The return and exchange window.' },
        { kind: 'toggle', key: 'highlights', label: 'Highlights', description: 'The listing’s selling points.' },
      ],
    },
    {
      title: 'Below the fold',
      fields: [
        { kind: 'toggle', key: 'details', label: 'Product details and care', description: 'The description and care instructions.' },
        { kind: 'toggle', key: 'specifications', label: 'Specifications', description: 'Fabric, fit and the legal details.' },
        { kind: 'toggle', key: 'reviews', label: 'Reviews', description: 'Ratings, fit and written reviews.' },
        { kind: 'toggle', key: 'photoReviewsFirst', label: 'Photo reviews first', description: 'Reviews with customer photos lead.' },
        { kind: 'toggle', key: 'storeRail', label: 'More from this store', description: 'Other items from the same seller.' },
        { kind: 'text', key: 'storeRailTitle', label: 'Store rail title', maxLength: 40, placeholder: 'More from this store' },
        { kind: 'toggle', key: 'related', label: 'Similar items', description: 'Related products from the category.' },
        { kind: 'text', key: 'relatedTitle', label: 'Similar items title', maxLength: 40, placeholder: 'You might also like' },
      ],
    },
  ],
  defaults: {
    classic: ALL_ON,
    lookbook: {
      ...ALL_ON,
      zoom: false,
      storeRail: true,
      storeRailTitle: 'Complete the look',
    },
    social: {
      ...ALL_ON,
      breadcrumbs: false,
      zoom: false,
      whatsapp: true,
      photoReviewsFirst: true,
      storeRail: true,
      storeRailTitle: 'More from this store',
      related: false,
      ctaLabel: 'Buy now',
    },
  },
  categoryOverrides: true,
  preview: {
    entity: 'product',
    path: (slug, variant) => `/product/${slug}/preview/${variant}`,
  },
};
