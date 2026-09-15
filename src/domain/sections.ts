import type { HomeSectionKind } from './types';

/**
 * What an editor may add to a page.
 *
 * The hero is not on the list: a page has one and it already exists, and a
 * second full-bleed carousel is never what anybody meant. Kinds the renderer
 * does not implement are left off rather than offered and quietly ignored --
 * an "add" menu that can produce an invisible section is worse than a shorter
 * menu.
 */
export const ADDABLE_SECTION_KINDS: HomeSectionKind[] = [
  'PRODUCT_RAIL',
  'CATEGORY_STRIP',
  'BANNER_GRID',
  'DEAL_COUNTDOWN',
  'REELS_STRIP',
  'BRAND_STRIP',
  'SELLER_SPOTLIGHT',
  'TESTIMONIALS',
  'EDITORIAL',
  'VALUE_PROPS',
];
