import type { PageDesignDefinition } from './types';

/**
 * The sellers directory, `/stores` -- how shoppers find a maker again, and the
 * crawlable link into every store page.
 *
 *   classic    the directory as it shipped: a grid of text cards, stores
 *              with something to buy first
 *   market     a local market: stores grouped by their city, biggest
 *              markets first, with a bar to jump between cities and each
 *              store shown with its banner and its three trust numbers
 *   stories    a story row of logos -- stores that are live for video calls
 *              right now first, then the newest -- above trust-ranked cards
 *
 * The directory is ONE page, so its preview takes no record to preview with.
 */

export const STORES_PAGE_VARIANTS = ['classic', 'market', 'stories'] as const;
export type StoresPageVariant = (typeof STORES_PAGE_VARIANTS)[number];

export interface StoresPageSettings {
  [key: string]: boolean | string;
  breadcrumbs: boolean;
  title: string;
  intro: boolean;
  storyRow: boolean;
  liveNow: boolean;
  cityJump: boolean;
  order: string;
  openingSoon: boolean;
  banners: boolean;
  stats: boolean;
  about: boolean;
  sellInvite: boolean;
}

const CLASSIC: StoresPageSettings = {
  breadcrumbs: true,
  title: 'Sellers on VestraWAB',
  intro: true,
  storyRow: false,
  liveNow: false,
  cityJump: true,
  order: 'rating',
  openingSoon: true,
  banners: false,
  stats: false,
  about: true,
  sellInvite: false,
};

export const storesPageDesign: PageDesignDefinition<StoresPageVariant, StoresPageSettings> = {
  page: 'stores',
  title: 'Sellers directory',
  description: 'Choose how the list of every store is laid out, and switch each part of it on or off.',
  route: '/stores',
  variants: STORES_PAGE_VARIANTS,
  defaultVariant: 'classic',
  variantMeta: {
    classic: {
      number: 1,
      name: 'Classic',
      description: 'A grid of text cards: each store’s name, tagline, a line about it and its numbers.',
      sketch: 'stores-classic',
    },
    market: {
      number: 2,
      name: 'Local market',
      description: 'Stores grouped by city, biggest markets first, with a bar to jump between cities and banner cards with trust numbers.',
      sketch: 'stores-market',
    },
    stories: {
      number: 3,
      name: 'Stories',
      description: 'A story row of logos, stores live for video calls first, above cards ranked by trust with the top three shown large.',
      sketch: 'stores-stories',
    },
  },
  groups: [
    {
      title: 'Header',
      fields: [
        { kind: 'toggle', key: 'breadcrumbs', label: 'Breadcrumbs' },
        { kind: 'text', key: 'title', label: 'Title', maxLength: 48, placeholder: 'Sellers on VestraWAB' },
        { kind: 'toggle', key: 'intro', label: 'Introduction', description: 'Who sells here, and that every store is reviewed.' },
      ],
    },
    {
      title: 'Discovery',
      fields: [
        { kind: 'toggle', key: 'storyRow', label: 'Story row', description: 'Round logos in a row that scrolls: live stores first, then the newest.' },
        { kind: 'toggle', key: 'liveNow', label: '“Live now”', description: 'Mark stores that are taking video calls at this moment.' },
        { kind: 'toggle', key: 'cityJump', label: 'Jump to a city', description: 'A bar of cities that scrolls to each group.', onlyFor: ['market'] },
        {
          kind: 'choice',
          key: 'order',
          label: 'Order stores by',
          options: [
            { value: 'rating', label: 'Rating' },
            { value: 'trust', label: 'Trust score' },
            { value: 'orders', label: 'Orders shipped' },
            { value: 'newest', label: 'Newest first' },
          ],
        },
        { kind: 'toggle', key: 'openingSoon', label: 'Stores opening soon', description: 'Approved stores with nothing listed yet, placed last.' },
      ],
    },
    {
      title: 'Cards',
      fields: [
        { kind: 'toggle', key: 'banners', label: 'Banner', description: 'The store’s own banner picture across the top of its card.' },
        { kind: 'toggle', key: 'stats', label: 'Trust numbers', description: 'Trust score, dispatch time and orders shipped.' },
        { kind: 'toggle', key: 'about', label: 'About line', description: 'A few lines the store wrote about itself.' },
      ],
    },
    {
      title: 'Footer',
      fields: [{ kind: 'toggle', key: 'sellInvite', label: 'Invite to sell', description: 'A closing band inviting makers to open a store.' }],
    },
  ],
  defaults: {
    classic: CLASSIC,
    market: { ...CLASSIC, title: 'Shop local', liveNow: true, banners: true, stats: true, about: false, sellInvite: true },
    stories: { ...CLASSIC, title: 'Stores to follow', storyRow: true, liveNow: true, order: 'trust', banners: true, stats: true, about: false, sellInvite: true },
  },
  preview: {
    entity: null,
    path: (_, variant) => `/stores/preview/${variant}`,
  },
};
