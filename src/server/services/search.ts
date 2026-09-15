import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';

import { galleryAssets } from '@/domain/media';

import { collections } from '../db/collections';
import { tags } from './cache-tags';

/**
 * Search across everything a shopper can land on.
 *
 * The overlay used to offer recent searches and a list of departments, on the
 * honest grounds that a client-side substring match over a partial catalogue is
 * worse than nothing. This is the endpoint that was missing.
 *
 * FOUR KINDS, ONE QUERY. A shopper typing "mora" may mean the store, the brand
 * or a product whose title contains it, and they should not have to know which.
 * Each kind is searched in its own collection and returned in its own group,
 * because the RESULTS ARE NOT INTERCHANGEABLE: a brand goes to a brand page, a
 * category to a listing, a store to a storefront. Flattening them into one list
 * is what produces a link that goes somewhere the shopper did not mean.
 *
 * WHY NOT THE TEXT INDEX HERE. `$text` matches whole words, so "kur" finds
 * nothing and a shopper typing sees an empty panel until the last letter of
 * "kurta". An anchored, escaped regex matches prefixes, which is what
 * type-ahead needs; the full search page still uses the text index, where
 * relevance across a whole catalogue matters more than matching half a word.
 */

export interface SearchHit {
  id: string;
  label: string;
  hint?: string;
  href: string;
  imageUrl?: string | null;
  /** Paise. Products only. */
  price?: number;
}

export interface SearchResults {
  products: SearchHit[];
  brands: SearchHit[];
  categories: SearchHit[];
  sellers: SearchHit[];
  total: number;
}

const EMPTY: SearchResults = {
  products: [],
  brands: [],
  categories: [],
  sellers: [],
  total: 0,
};

/** Anything with a regex meaning is a literal here: shoppers type brackets. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function searchEverything(query: string): Promise<SearchResults> {
  'use cache';
  /*
   * Cached per query, and invalidated by the same tags the catalogue uses --
   * a product going live should appear in the panel, not thirty minutes later.
   */
  cacheTag(tags.productList, tags.brandList, tags.taxonomy, tags.sellerList);
  cacheLife('minutes');

  const term = query.trim();
  if (term.length < 2) return EMPTY;

  const escaped = escapeRegex(term);
  // Anchored at a word boundary: "lin" finds "Linen shirt" and "Cotton linen",
  // and does not find "Berlin", which is what an unanchored match would return
  // and what makes a type-ahead feel random.
  const like = { $regex: `\\b${escaped}`, $options: 'i' };

  const [productCol, brandCol, categoryCol, sellerCol] = await Promise.all([
    collections.products(),
    collections.brands(),
    collections.categories(),
    collections.sellers(),
  ]);

  const [products, brands, categories, sellers] = await Promise.all([
    productCol
      .find({ title: like, status: 'PUBLISHED' })
      .sort({ 'stats.unitsSold30d': -1 })
      .limit(6)
      .toArray(),
    brandCol.find({ name: like, isActive: true }).sort({ productCount: -1 }).limit(4).toArray(),
    categoryCol.find({ name: like, isActive: true }).sort({ productCount: -1 }).limit(4).toArray(),
    sellerCol
      .find({ displayName: like, status: { $in: ['ACTIVE', 'APPROVED'] } })
      .sort({ 'metrics.liveProductCount': -1 })
      .limit(4)
      .toArray(),
  ]);

  const results: SearchResults = {
    products: products.map((row) => ({
      id: row._id,
      label: row.title,
      hint: row.categoryPath?.at(-1)?.replace(/-/g, ' '),
      href: `/product/${row.slug}`,
      imageUrl: galleryAssets(row.media ?? [])[0]?.url ?? null,
      price: row.priceRange?.minSellingPrice,
    })),
    brands: brands.map((row) => ({
      id: row._id,
      label: row.name,
      hint: `${row.productCount} ${row.productCount === 1 ? 'product' : 'products'}`,
      href: `/brand/${row.slug}`,
      imageUrl: row.logoUrl,
    })),
    categories: categories.map((row) => ({
      id: row._id,
      label: row.name,
      // The trail, so "Kurtas" under Women is not confused with one under Kids.
      hint: row.path.slice(0, -1).join(' › ').replace(/-/g, ' ') || undefined,
      href: `/category/${row.slug}`,
      imageUrl: row.imageUrl,
    })),
    sellers: sellers.map((row) => ({
      id: row._id,
      label: row.displayName,
      hint: `${row.metrics?.liveProductCount ?? 0} live products`,
      href: `/store/${row.slug}`,
      imageUrl: row.logoUrl,
    })),
    total: 0,
  };

  results.total =
    results.products.length +
    results.brands.length +
    results.categories.length +
    results.sellers.length;

  return results;
}
