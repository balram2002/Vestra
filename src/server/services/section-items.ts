import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';

import { CATALOG } from '@/config/business';
import type { Banner, Brand, Category, HomeSection, ProductSummary, Seller } from '@/domain/types';

import { collections, toEntities } from '../db/collections';
import { tags } from './cache-tags';
import { getCategoryTree, listBrands, listSellers, toSummaries } from './catalog';
import { getBanners } from './content';
import { getProductRail } from './listing';

/**
 * What goes IN a section.
 *
 * Every section kind answers the same question two ways: a rule ("the twelve
 * bestsellers") or a hand-picked list in the order somebody arranged it. This
 * module is where that choice is made, so the homepage, a landing page and the
 * admin preview cannot disagree about what a section contains.
 *
 * MANUAL ORDER IS THE EDITOR'S ORDER. A `$in` query returns documents in
 * whatever order the index hands them over, so every one of these re-sorts by
 * the id list afterwards. Without that, dragging a product to the front of a
 * rail would appear to do nothing.
 *
 * A manual list also DROPS what is no longer available -- an unpublished
 * product, a hidden brand -- rather than rendering a hole. The section simply
 * gets shorter, which is the failure mode an editor can see and fix.
 */

/** Sort a fetched set back into the order the editor arranged. */
function inChosenOrder<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}

export async function railProducts(section: HomeSection): Promise<ProductSummary[]> {
  const limit = section.config.limit ?? CATALOG.railSize;
  const ids = section.config.productIds ?? [];

  if (section.config.source === 'MANUAL') {
    if (ids.length === 0) return [];
    return productsByIds(ids.slice(0, limit));
  }

  const source = section.config.source ?? 'BESTSELLERS';
  const supported =
    source === 'NEW_ARRIVALS' || source === 'BESTSELLERS' || source === 'TRENDING' || source === 'DEALS'
      ? source
      : 'BESTSELLERS';

  return getProductRail(supported, limit);
}

export async function productsByIds(ids: string[]): Promise<ProductSummary[]> {
  'use cache';
  cacheTag(tags.productList);
  cacheLife('minutes');

  if (ids.length === 0) return [];

  const products = await collections.products();
  const docs = await products.find({ _id: { $in: ids }, status: 'PUBLISHED' }).toArray();

  return toSummaries(inChosenOrder(toEntities(docs), ids));
}

export async function stripCategories(section: HomeSection): Promise<Category[]> {
  const limit = section.config.limit ?? 12;
  const all = await getCategoryTree();
  const chosen = section.config.categoryIds ?? [];

  if (section.config.categoryMode === 'MANUAL' || (chosen.length > 0 && section.config.categoryMode !== 'AUTO')) {
    return inChosenOrder(
      all.filter((category) => category.isActive),
      chosen,
    ).slice(0, limit);
  }

  // Shelf level by default: departments are too coarse to browse from, leaves
  // too many.
  return all.filter((category) => category.depth === 1).slice(0, limit);
}

export async function stripBrands(section: HomeSection): Promise<Brand[]> {
  const limit = section.config.limit ?? 12;
  const chosen = section.config.brandIds ?? [];

  // Over-fetch before filtering: the chosen brands may sit anywhere in the list.
  const brands = await listBrands(chosen.length > 0 ? 400 : limit);
  return chosen.length > 0 ? inChosenOrder(brands, chosen).slice(0, limit) : brands;
}

export async function spotlightSellers(section: HomeSection): Promise<Seller[]> {
  const limit = section.config.limit ?? 4;
  const chosen = section.config.sellerIds ?? [];

  const sellers = await listSellers(chosen.length > 0 ? 400 : limit * 4);
  if (chosen.length > 0) return inChosenOrder(sellers, chosen).slice(0, limit);

  // Only stores with something to buy: a spotlight on an empty shelf sends a
  // shopper nowhere.
  return sellers.filter((seller) => seller.metrics.liveProductCount > 0).slice(0, limit);
}

export async function gridBanners(section: HomeSection): Promise<Banner[]> {
  const banners = await getBanners('HOME_GRID');
  const chosen = section.config.bannerIds ?? [];
  return chosen.length > 0 ? inChosenOrder(banners, chosen) : banners;
}
