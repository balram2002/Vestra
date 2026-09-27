import type { PageDesignDefinition } from './types';

/**
 * The brand page, `/brand/[slug]` -- one label's whole range, across every
 * store that sells it.
 *
 *   classic    the page as it shipped: the name, a paragraph and a line of
 *              facts over the full listing
 *   campaign   a launch page: a full-width picture with the logo and name set
 *              large, the brand's categories as photo tiles, a rail of what
 *              is new, the listing, and similar brands to finish
 *   catalogue  a buyer's view: a slim header, the categories as a row of
 *              chips, filters docked open and a compact grid that shows more
 *              products per screen
 *
 * The listing is the same component as every other listing, so filters,
 * sort and pages behave identically in all three.
 */

export const BRAND_PAGE_VARIANTS = ['classic', 'campaign', 'catalogue'] as const;
export type BrandPageVariant = (typeof BRAND_PAGE_VARIANTS)[number];

export interface BrandPageSettings {
  [key: string]: boolean | string;
  breadcrumbs: boolean;
  hero: boolean;
  logo: boolean;
  description: boolean;
  facts: boolean;
  rating: boolean;
  categories: boolean;
  categoryStyle: string;
  newArrivals: boolean;
  newArrivalsTitle: string;
  quickFilters: boolean;
  filterRail: boolean;
  density: string;
  similarBrands: boolean;
}

const CLASSIC: BrandPageSettings = {
  breadcrumbs: true,
  hero: false,
  logo: false,
  description: true,
  facts: true,
  rating: false,
  categories: false,
  categoryStyle: 'chips',
  newArrivals: false,
  newArrivalsTitle: 'New in',
  quickFilters: true,
  filterRail: true,
  density: 'standard',
  similarBrands: false,
};

export const brandPageDesign: PageDesignDefinition<BrandPageVariant, BrandPageSettings> = {
  page: 'brand',
  title: 'Brand page',
  description: 'Choose how every brand’s page looks, and switch each part of it on or off.',
  route: '/brand/…',
  variants: BRAND_PAGE_VARIANTS,
  defaultVariant: 'classic',
  variantMeta: {
    classic: {
      number: 1,
      name: 'Classic',
      description: 'The brand’s name, a paragraph about it and a line of facts, over the full listing.',
      sketch: 'brand-classic',
    },
    campaign: {
      number: 2,
      name: 'Campaign',
      description: 'A launch page: a full-width picture with the logo and name set large, category tiles, a rail of what is new, then the listing.',
      sketch: 'brand-campaign',
    },
    catalogue: {
      number: 3,
      name: 'Catalogue',
      description: 'A buyer’s view: a slim header, categories as chips, filters docked open and a compact grid with more products per screen.',
      sketch: 'brand-catalogue',
    },
  },
  groups: [
    {
      title: 'Header',
      fields: [
        { kind: 'toggle', key: 'breadcrumbs', label: 'Breadcrumbs' },
        { kind: 'toggle', key: 'hero', label: 'Brand picture', description: 'The brand’s banner behind its name, full width.', onlyFor: ['campaign'] },
        { kind: 'toggle', key: 'logo', label: 'Logo' },
        { kind: 'toggle', key: 'description', label: 'About the brand', description: 'The brand’s own paragraph. The Catalogue layout folds it away behind a link.' },
        { kind: 'toggle', key: 'facts', label: 'Facts', description: 'Founded, country of origin and the number of styles.' },
        { kind: 'toggle', key: 'rating', label: 'Average rating', description: 'Shown once the brand has any rated products.' },
      ],
    },
    {
      title: 'Discovery',
      fields: [
        { kind: 'toggle', key: 'categories', label: 'Shop by category', description: 'Each category the brand sells in, opening that category filtered to the brand.' },
        {
          kind: 'choice',
          key: 'categoryStyle',
          label: 'Shop by category as',
          options: [
            { value: 'chips', label: 'Chips' },
            { value: 'tiles', label: 'Photo tiles' },
          ],
        },
        { kind: 'toggle', key: 'newArrivals', label: 'New arrivals rail', description: 'The brand’s latest products, above the listing.' },
        { kind: 'text', key: 'newArrivalsTitle', label: 'Rail title', maxLength: 40, placeholder: 'New in' },
        { kind: 'toggle', key: 'similarBrands', label: 'Similar brands', description: 'Brands selling in the same categories, under the listing.' },
      ],
    },
    {
      title: 'Listing',
      fields: [
        { kind: 'toggle', key: 'quickFilters', label: 'Popular filters', description: 'One-tap chips such as In stock and Under ₹999, on phones.' },
        { kind: 'toggle', key: 'filterRail', label: 'Filters beside the grid', description: 'On a desktop. Off, filters open from a button at every width.' },
        {
          kind: 'choice',
          key: 'density',
          label: 'Grid',
          options: [
            { value: 'standard', label: 'Standard' },
            { value: 'compact', label: 'Compact' },
          ],
        },
      ],
    },
  ],
  defaults: {
    classic: CLASSIC,
    campaign: {
      ...CLASSIC,
      hero: true,
      logo: true,
      rating: true,
      categories: true,
      categoryStyle: 'tiles',
      newArrivals: true,
      similarBrands: true,
    },
    catalogue: {
      ...CLASSIC,
      logo: true,
      rating: true,
      categories: true,
      categoryStyle: 'chips',
      quickFilters: false,
      density: 'compact',
      similarBrands: true,
    },
  },
  preview: {
    entity: 'brand',
    path: (slug, variant) => `/brand/${slug}/preview/${variant}`,
  },
};
