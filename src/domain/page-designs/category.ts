import type { PageDesignDefinition } from './types';

/**
 * The category listing, `/category/[slug]` -- where most browsing sessions
 * spend most of their time.
 *
 *   classic    the listing as it shipped: an image banner, the sub-categories
 *              as chips, and the grid with its filter rail
 *   editorial  a department front: the name set large beside the picture,
 *              sub-categories as photo tiles, a rail of this week's
 *              bestsellers, and shortcut tiles placed inside the grid
 *   wall       discovery: a compact title, then a tall, dense wall of photos
 *              with the price on the picture, sort as tabs, filters in a
 *              drawer, and a quick view that adds to the bag without leaving
 *
 * The grid, filters, sort and pagination are the same component in every
 * layout -- a filter that works in one works in all three.
 */

export const CATEGORY_PAGE_VARIANTS = ['classic', 'editorial', 'wall'] as const;
export type CategoryPageVariant = (typeof CATEGORY_PAGE_VARIANTS)[number];

export interface CategoryPageSettings {
  [key: string]: boolean | string;
  breadcrumbs: boolean;
  hero: boolean;
  eyebrow: string;
  description: boolean;
  subcategories: boolean;
  subcategoryStyle: string;
  topPicks: boolean;
  topPicksTitle: string;
  quickFilters: boolean;
  filterRail: boolean;
  promoTiles: boolean;
  quickView: boolean;
  wallDensity: string;
  seoIntro: boolean;
}

const CLASSIC: CategoryPageSettings = {
  breadcrumbs: true,
  hero: true,
  eyebrow: 'Explore the collection',
  description: true,
  subcategories: true,
  subcategoryStyle: 'chips',
  topPicks: false,
  topPicksTitle: 'Bestsellers this week',
  quickFilters: true,
  filterRail: true,
  promoTiles: false,
  quickView: true,
  wallDensity: 'airy',
  seoIntro: true,
};

export const categoryPageDesign: PageDesignDefinition<CategoryPageVariant, CategoryPageSettings> = {
  page: 'category',
  title: 'Category page',
  description: 'Choose how every category listing looks, and switch each part of it on or off.',
  route: '/category/…',
  variants: CATEGORY_PAGE_VARIANTS,
  defaultVariant: 'classic',
  variantMeta: {
    classic: {
      number: 1,
      name: 'Classic',
      description: 'An image banner, sub-categories as chips, and the grid with its filter rail beside it.',
      sketch: 'category-classic',
    },
    editorial: {
      number: 2,
      name: 'Editorial',
      description: 'A department front: the name set large beside the picture, photo tiles for each type, a bestseller rail, and shortcut tiles inside the grid.',
      sketch: 'category-editorial',
    },
    wall: {
      number: 3,
      name: 'Visual wall',
      description: 'A compact title, then a dense wall of photos with sort as tabs, filters in a drawer, and a quick view that adds to the bag in place.',
      sketch: 'category-wall',
    },
  },
  groups: [
    {
      title: 'Header',
      fields: [
        { kind: 'toggle', key: 'breadcrumbs', label: 'Breadcrumbs', description: 'Home › Women › Dresses, above the title.' },
        { kind: 'toggle', key: 'hero', label: 'Category picture', description: 'The category’s own image behind or beside the title.' },
        { kind: 'text', key: 'eyebrow', label: 'Line above the title', maxLength: 32, placeholder: 'Explore the collection' },
        { kind: 'toggle', key: 'description', label: 'Description', description: 'The category’s short description under its name.' },
      ],
    },
    {
      title: 'Discovery',
      fields: [
        { kind: 'toggle', key: 'subcategories', label: 'Shop by type', description: 'Links to the categories inside this one.' },
        {
          kind: 'choice',
          key: 'subcategoryStyle',
          label: 'Shop by type as',
          options: [
            { value: 'chips', label: 'Chips' },
            { value: 'tiles', label: 'Photo tiles' },
          ],
        },
        { kind: 'toggle', key: 'topPicks', label: 'Bestseller rail', description: 'The category’s best sellers of the last 30 days, above the grid.' },
        { kind: 'text', key: 'topPicksTitle', label: 'Rail title', maxLength: 40, placeholder: 'Bestsellers this week' },
        { kind: 'toggle', key: 'promoTiles', label: 'Shortcut tiles in the grid', description: 'New in, Under ₹999, Top rated and 30% off, placed between products.' },
      ],
    },
    {
      title: 'Filtering',
      fields: [
        { kind: 'toggle', key: 'quickFilters', label: 'Popular filters', description: 'One-tap chips such as In stock and Under ₹999, on phones.' },
        {
          kind: 'toggle',
          key: 'filterRail',
          label: 'Filters beside the grid',
          description: 'On a desktop. Off, filters open from a button at every width.',
          onlyFor: ['classic', 'editorial'],
        },
      ],
    },
    {
      title: 'Visual wall',
      fields: [
        { kind: 'toggle', key: 'quickView', label: 'Quick view', description: 'Tap a photo to choose a size and add, without leaving the wall.', onlyFor: ['wall'] },
        {
          kind: 'choice',
          key: 'wallDensity',
          label: 'Wall',
          onlyFor: ['wall'],
          options: [
            { value: 'airy', label: 'Airy' },
            { value: 'dense', label: 'Dense' },
          ],
        },
      ],
    },
    {
      title: 'Footer',
      fields: [{ kind: 'toggle', key: 'seoIntro', label: 'About this category', description: 'The longer copy written for search engines, under the grid.' }],
    },
  ],
  defaults: {
    classic: CLASSIC,
    editorial: {
      ...CLASSIC,
      eyebrow: 'The edit',
      subcategoryStyle: 'tiles',
      topPicks: true,
      promoTiles: true,
    },
    wall: {
      ...CLASSIC,
      hero: false,
      eyebrow: '',
      description: false,
      quickFilters: false,
      filterRail: false,
      wallDensity: 'airy',
    },
  },
  preview: {
    entity: 'category',
    path: (slug, variant) => `/category/${slug}/preview/${variant}`,
  },
};
