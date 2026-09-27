import type { PageDesignDefinition } from './types';

/**
 * Search results, `/search?q=…` -- the page a shopper reaches with a word in
 * mind, and where a dead end costs the most.
 *
 *   classic   the page as it shipped: "Results for …" over the listing, and
 *             departments when nothing matched
 *   instant   the search box stays on the page with the words in it; the
 *             stores, brands and categories that match sit above the
 *             products as shortcuts; and a misspelling gets "Did you mean"
 *   visual    the query set large in its own search box, sort as tabs,
 *             filters in a drawer, and the results as a photo wall with a
 *             quick view
 *
 * The preview is chosen by QUERY, including a misspelt one, a search that
 * finds nothing and an empty search, because those states are where a
 * search page earns its keep.
 */

export const SEARCH_PAGE_VARIANTS = ['classic', 'instant', 'visual'] as const;
export type SearchPageVariant = (typeof SEARCH_PAGE_VARIANTS)[number];

export interface SearchPageSettings {
  [key: string]: boolean | string;
  searchBox: boolean;
  shortcuts: boolean;
  didYouMean: boolean;
  quickFilters: boolean;
  filterRail: boolean;
  quickView: boolean;
  wallDensity: string;
  noResultsDepartments: boolean;
  noResultsPicks: boolean;
  noResultsPicksTitle: string;
}

const CLASSIC: SearchPageSettings = {
  searchBox: false,
  shortcuts: false,
  didYouMean: false,
  quickFilters: true,
  filterRail: true,
  quickView: true,
  wallDensity: 'airy',
  noResultsDepartments: true,
  noResultsPicks: false,
  noResultsPicksTitle: 'Bestsellers right now',
};

export const searchPageDesign: PageDesignDefinition<SearchPageVariant, SearchPageSettings> = {
  page: 'search',
  title: 'Search results',
  description: 'Choose how search results are laid out, what a shopper is offered around them, and what a search that finds nothing shows.',
  route: '/search',
  variants: SEARCH_PAGE_VARIANTS,
  defaultVariant: 'classic',
  variantMeta: {
    classic: {
      number: 1,
      name: 'Classic',
      description: '“Results for …” over the listing with its filter rail, and departments to browse when nothing matched.',
      sketch: 'search-classic',
    },
    instant: {
      number: 2,
      name: 'Instant',
      description: 'The search box stays on the page, matching stores, brands and categories sit above the products, and a misspelling gets “Did you mean”.',
      sketch: 'search-instant',
    },
    visual: {
      number: 3,
      name: 'Visual',
      description: 'The query set large in its own search box, sort as tabs, filters in a drawer, and the results as a photo wall with a quick view.',
      sketch: 'search-visual',
    },
  },
  groups: [
    {
      title: 'Around the results',
      fields: [
        { kind: 'toggle', key: 'searchBox', label: 'Search box on the page', description: 'The words searched for, ready to change without going back to the header.' },
        { kind: 'toggle', key: 'shortcuts', label: 'Matching stores, brands and categories', description: 'Shortcuts above the products when the words also name one of these.' },
        { kind: 'toggle', key: 'didYouMean', label: '“Did you mean”', description: 'A corrected search when a word is close to, but not, one the shop uses.' },
      ],
    },
    {
      title: 'Filtering',
      fields: [
        { kind: 'toggle', key: 'quickFilters', label: 'Popular filters', description: 'One-tap chips such as In stock and Under ₹999, on phones.' },
        {
          kind: 'toggle',
          key: 'filterRail',
          label: 'Filters beside the results',
          description: 'On a desktop. Off, filters open from a button at every width.',
          onlyFor: ['classic', 'instant'],
        },
      ],
    },
    {
      title: 'Photo wall',
      fields: [
        { kind: 'toggle', key: 'quickView', label: 'Quick view', description: 'Tap a photo to choose a size and add, without leaving the results.', onlyFor: ['visual'] },
        {
          kind: 'choice',
          key: 'wallDensity',
          label: 'Wall',
          onlyFor: ['visual'],
          options: [
            { value: 'airy', label: 'Airy' },
            { value: 'dense', label: 'Dense' },
          ],
        },
      ],
    },
    {
      title: 'When nothing matches',
      fields: [
        { kind: 'toggle', key: 'noResultsDepartments', label: 'Departments', description: 'Somewhere to browse instead of a dead end.' },
        { kind: 'toggle', key: 'noResultsPicks', label: 'Bestsellers', description: 'A row of what is selling now, so the page still offers something to buy.' },
        { kind: 'text', key: 'noResultsPicksTitle', label: 'Bestsellers title', maxLength: 40, placeholder: 'Bestsellers right now' },
      ],
    },
  ],
  defaults: {
    classic: CLASSIC,
    instant: { ...CLASSIC, searchBox: true, shortcuts: true, didYouMean: true, noResultsPicks: true },
    visual: { ...CLASSIC, searchBox: true, shortcuts: false, didYouMean: true, quickFilters: false, filterRail: false, noResultsPicks: true },
  },
  preview: {
    entity: 'query',
    path: (q, variant) => `/search/preview/${variant}?q=${encodeURIComponent(q)}`,
  },
};
