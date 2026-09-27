import { brandPageDesign } from './brand';
import { categoryPageDesign } from './category';
import { demoPageDesign } from './demo';
import { productPageDesign } from './product';
import { storePageDesign } from './store';
import { storesPageDesign } from './stores';
import type { PageDesignDefinition } from './types';

/**
 * Every page Marketing can design, by key.
 *
 * The key is the document id in `pageDesigns`, the cache tag suffix and the
 * last segment of the admin route, so it never changes once shipped.
 */
export const PAGE_DESIGNS = {
  store: storePageDesign,
  product: productPageDesign,
  demo: demoPageDesign,
  category: categoryPageDesign,
  stores: storesPageDesign,
  brand: brandPageDesign,
} as const;

export type PageDesignKey = keyof typeof PAGE_DESIGNS;

export const PAGE_DESIGN_KEYS = Object.keys(PAGE_DESIGNS) as PageDesignKey[];

export function isPageDesignKey(value: string): value is PageDesignKey {
  return value in PAGE_DESIGNS;
}

export function designFor(page: PageDesignKey): PageDesignDefinition {
  return PAGE_DESIGNS[page] as unknown as PageDesignDefinition;
}

export * from './types';
