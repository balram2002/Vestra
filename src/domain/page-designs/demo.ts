import type { PageDesignDefinition } from './types';

/**
 * The product demo page, `/demo/[slug]` -- a seller's clip with the pieces in
 * it, shoppable without leaving the video.
 *
 *   classic    the player as it shipped: full-bleed video, and a sheet of the
 *              featured pieces that pulls up on a phone and sits beside it on
 *              a desktop
 *   showroom   a studio: the video framed on a light ground beside the lead
 *              piece with its sizes and Add to bag right there, and a shelf of
 *              the other pieces underneath
 *   stories    tap-through: one segment per piece, with progress bars, a
 *              sticker to shop each one, and an end card that offers a call
 *              with the store
 *
 * All three share one choose-and-add step, so adding from a demo works the
 * same whichever layout is live.
 */

export const DEMO_PAGE_VARIANTS = ['classic', 'showroom', 'stories'] as const;
export type DemoPageVariant = (typeof DEMO_PAGE_VARIANTS)[number];

export interface DemoPageSettings {
  [key: string]: boolean | string;
  sellerHeader: boolean;
  share: boolean;
  caption: boolean;
  autoplay: boolean;
  startMuted: boolean;
  playerControls: boolean;
  products: boolean;
  productsTitle: string;
  ctaLabel: string;
  seeLive: boolean;
  visitStore: boolean;
}

const CLASSIC: DemoPageSettings = {
  sellerHeader: true,
  share: true,
  caption: true,
  autoplay: true,
  startMuted: false,
  playerControls: true,
  products: true,
  productsTitle: 'Featured products',
  ctaLabel: 'Choose & add',
  seeLive: false,
  visitStore: true,
};

export const demoPageDesign: PageDesignDefinition<DemoPageVariant, DemoPageSettings> = {
  page: 'demo',
  title: 'Product demo',
  description: 'Choose how a product demo plays and sells, and switch each part of it on or off.',
  route: '/demo/…',
  variants: DEMO_PAGE_VARIANTS,
  defaultVariant: 'classic',
  variantMeta: {
    classic: {
      number: 1,
      name: 'Classic',
      description: 'Full-bleed video with a sheet of the featured pieces: pulled up on a phone, beside the video on a desktop.',
      sketch: 'demo-classic',
    },
    showroom: {
      number: 2,
      name: 'Showroom',
      description: 'The video framed on a light ground beside the lead piece, with its sizes and Add to bag right there, and a shelf of the rest.',
      sketch: 'demo-showroom',
    },
    stories: {
      number: 3,
      name: 'Stories',
      description: 'Tap-through segments, one per piece, with progress bars, a sticker to shop each, and an end card that offers a call.',
      sketch: 'demo-stories',
    },
  },
  groups: [
    {
      title: 'Header',
      fields: [
        { kind: 'toggle', key: 'sellerHeader', label: 'Seller', description: 'The store’s logo and name over the video.' },
        { kind: 'toggle', key: 'share', label: 'Share', description: 'Copy link and WhatsApp.' },
        { kind: 'toggle', key: 'caption', label: 'Caption', description: 'The product title over the video.' },
      ],
    },
    {
      title: 'Playback',
      fields: [
        { kind: 'toggle', key: 'autoplay', label: 'Play on open', description: 'Browsers may still require a tap if sound is on.' },
        { kind: 'toggle', key: 'startMuted', label: 'Start muted', description: 'Plays reliably on phones; one tap turns the sound on.' },
        { kind: 'toggle', key: 'playerControls', label: 'Speed and full screen', description: 'Extra controls beside the timeline.' },
      ],
    },
    {
      title: 'Shopping',
      fields: [
        { kind: 'toggle', key: 'products', label: 'Featured pieces', description: 'The products in the video, ready to add.' },
        { kind: 'text', key: 'productsTitle', label: 'Section title', maxLength: 40, placeholder: 'Featured products' },
        { kind: 'text', key: 'ctaLabel', label: 'Button label', maxLength: 24, placeholder: 'Choose & add' },
        { kind: 'toggle', key: 'seeLive', label: '“Call the store”', description: 'Start a live video call about the lead piece.' },
        { kind: 'toggle', key: 'visitStore', label: 'Visit store', description: 'A link to the seller’s store page.' },
      ],
    },
  ],
  defaults: {
    classic: CLASSIC,
    showroom: { ...CLASSIC, productsTitle: 'In this video', ctaLabel: 'Add to bag', seeLive: true },
    stories: {
      ...CLASSIC,
      startMuted: true,
      playerControls: false,
      productsTitle: 'Shop the story',
      ctaLabel: 'Shop this',
      seeLive: true,
    },
  },
  preview: {
    entity: 'product',
    path: (slug, variant) => `/demo/${slug}/preview/${variant}`,
  },
};
