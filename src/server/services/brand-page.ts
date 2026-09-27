import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';

import type { Brand, Category } from '@/domain/types';

import { tags } from './cache-tags';
import { getCategoryTree, listBrands } from './catalog';

export interface BrandContext {
  /** The categories the brand sells in, deepest first, at most twelve. */
  categories: Category[];
  /** Brands selling in the same categories, most overlap first. */
  similar: Brand[];
}

/**
 * What surrounds a brand's listing: where else to look inside the brand, and
 * where to look next outside it. Both come from the brand's own category
 * list, so a brand page never suggests a category it has nothing in.
 */
export async function getBrandContext(brand: Brand): Promise<BrandContext> {
  'use cache';
  cacheTag(tags.brand(brand.slug), tags.brandList, tags.taxonomy);
  cacheLife('hours');

  const [tree, brands] = await Promise.all([getCategoryTree(), listBrands(200)]);
  const own = new Set(brand.categoryIds);

  // Deepest first: "Kurtas" is a better door into a brand than "Women".
  const categories = tree
    .filter((category) => own.has(category.id))
    .toSorted((a, b) => b.depth - a.depth || a.position - b.position)
    .slice(0, 12);

  const similar = brands
    .filter((other) => other.id !== brand.id && other.productCount > 0)
    .map((other) => ({ other, overlap: other.categoryIds.filter((id) => own.has(id)).length }))
    .filter(({ overlap }) => overlap > 0)
    .toSorted((a, b) => b.overlap - a.overlap || b.other.productCount - a.other.productCount)
    .slice(0, 8)
    .map(({ other }) => other);

  return { categories, similar };
}
