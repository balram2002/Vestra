import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';

import { CATALOG, INVENTORY } from '@/config/business';
import { COLOR_BY_VALUE, sortSizes } from '@/domain/attributes';
import type {
  Brand,
  Category,
  Product,
  ProductBadge,
  ProductSummary,
  Seller,
  StockLevel,
} from '@/domain/types';

import { collections, toEntities, toEntity } from '../db/collections';
import { tags } from './cache-tags';

/**
 * Catalogue reads.
 *
 * Every export here is a `"use cache"` scope tagged through `cache-tags`, which
 * is what lets a product page ship as a prerendered static shell while the
 * session-shaped parts (bag count, wishlist state, live stock) stream in
 * separately at request time.
 *
 * Two constraints this module must respect, both enforced by Cache Components:
 *
 *  1. NOTHING HERE MAY READ `cookies()`, `headers()` OR `searchParams`. A
 *     cached scope that touches request state fails at runtime. Anything
 *     per-visitor is passed in as an argument by the caller, or lives in a
 *     separate uncached module.
 *  2. Arguments and return values must be serialisable. That is why these
 *     return plain domain objects rather than Mongo cursors or class instances.
 */

/* ------------------------------------------------------------- taxonomy */

export async function getCategoryTree(): Promise<Category[]> {
  'use cache';
  cacheTag(tags.taxonomy);
  // The taxonomy changes on the order of weeks, so it can sit in cache far
  // longer than a product does.
  cacheLife('days');

  const categories = await collections.categories();
  const docs = await categories
    .find({ isActive: true })
    .sort({ depth: 1, position: 1 })
    .toArray();

  return toEntities(docs);
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  'use cache';
  cacheTag(tags.taxonomy, tags.category(slug));
  cacheLife('hours');

  const categories = await collections.categories();
  // `slugHistory` is checked too, so a renamed category keeps resolving and the
  // route can issue a 301 to the current slug instead of a 404.
  const doc = await categories.findOne({
    $or: [{ slug }, { slugHistory: slug }],
  });

  return toEntity(doc);
}

/** Departments, for the mega menu. */
export async function getDepartments(): Promise<Category[]> {
  'use cache';
  cacheTag(tags.taxonomy);
  cacheLife('days');

  const categories = await collections.categories();
  const docs = await categories
    .find({ isActive: true, depth: 0 })
    .sort({ position: 1 })
    .toArray();

  return toEntities(docs);
}

/** One department with its children, shaped for a mega-menu column. */
export async function getMegaMenu(): Promise<
  Array<{ department: Category; groups: Array<{ shelf: Category; leaves: Category[] }> }>
> {
  'use cache';
  cacheTag(tags.taxonomy);
  cacheLife('days');

  const all = await getCategoryTree();
  const byParent = new Map<string | null, Category[]>();

  for (const category of all) {
    const list = byParent.get(category.parentId) ?? [];
    list.push(category);
    byParent.set(category.parentId, list);
  }

  const departments = (byParent.get(null) ?? []).sort((a, b) => a.position - b.position);

  return departments.map((department) => ({
    department,
    groups: (byParent.get(department.id) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((shelf) => ({
        shelf,
        leaves: (byParent.get(shelf.id) ?? []).sort((a, b) => a.position - b.position),
      })),
  }));
}

/** Ancestors of a category, root first. Drives breadcrumbs and BreadcrumbList. */
export async function getCategoryAncestors(slug: string): Promise<Category[]> {
  'use cache';
  cacheTag(tags.taxonomy);
  cacheLife('days');

  const category = await getCategoryBySlug(slug);
  if (!category) return [];

  const all = await getCategoryTree();
  const bySlug = new Map(all.map((c) => [c.slug, c]));

  return category.path
    .map((s) => bySlug.get(s))
    .filter((c): c is Category => Boolean(c));
}

/* ---------------------------------------------------------------- brands */

export async function getBrandBySlug(slug: string): Promise<Brand | null> {
  'use cache';
  cacheTag(tags.brand(slug));
  cacheLife('hours');

  const brands = await collections.brands();
  const doc = await brands.findOne({ $or: [{ slug }, { slugHistory: slug }] });
  return toEntity(doc);
}

export async function getBrandById(id: string): Promise<Brand | null> {
  'use cache';
  cacheTag(tags.brandList);
  cacheLife('hours');

  const brands = await collections.brands();
  return toEntity(await brands.findOne({ _id: id }));
}

export async function listBrands(limit = 100): Promise<Brand[]> {
  'use cache';
  cacheTag(tags.brandList);
  cacheLife('hours');

  const brands = await collections.brands();
  const docs = await brands
    .find({ isActive: true })
    .sort({ isPremium: -1, productCount: -1, name: 1 })
    .limit(limit)
    .toArray();

  return toEntities(docs);
}

/* --------------------------------------------------------------- stores */

export async function getSellerBySlug(slug: string): Promise<Seller | null> {
  'use cache';
  cacheTag(tags.seller(slug));
  cacheLife('hours');

  const sellers = await collections.sellers();
  const doc = await sellers.findOne({ $or: [{ slug }, { slugHistory: slug }] });
  return toEntity(doc);
}

export async function getSellerById(id: string): Promise<Seller | null> {
  'use cache';
  cacheTag(tags.sellerList);
  cacheLife('hours');

  const sellers = await collections.sellers();
  return toEntity(await sellers.findOne({ _id: id }));
}

export async function listSellers(limit = 50): Promise<Seller[]> {
  'use cache';
  cacheTag(tags.sellerList);
  cacheLife('hours');

  const sellers = await collections.sellers();
  const docs = await sellers
    .find({ status: 'ACTIVE' })
    .sort({ 'rating.average': -1, 'metrics.orderCount': -1 })
    .limit(limit)
    .toArray();

  return toEntities(docs);
}

/* -------------------------------------------------------------- products */

export async function getProductBySlug(slug: string): Promise<Product | null> {
  'use cache';
  cacheLife('hours');

  const products = await collections.products();
  const doc = await products.findOne({ $or: [{ slug }, { slugHistory: slug }] });
  if (!doc) return null;

  // Tagged by id rather than slug so a rename does not orphan the cache entry.
  cacheTag(tags.product(doc.id));
  return toEntity(doc);
}

export async function getProductById(id: string): Promise<Product | null> {
  'use cache';
  cacheTag(tags.product(id));
  cacheLife('hours');

  const products = await collections.products();
  const doc = await products.findOne({ _id: id });
  return toEntity(doc);
}

/**
 * Slugs for `generateStaticParams`.
 *
 * Only the top slice by sales: prerendering 800 PDPs at build time would trade
 * a long build for pages nobody requests. The rest are generated on first
 * request and cached from then on.
 */
export async function getTopProductSlugs(limit = 120): Promise<string[]> {
  'use cache';
  cacheTag(tags.productList);
  cacheLife('days');

  const products = await collections.products();
  const docs = await products
    .find({ status: 'PUBLISHED' }, { projection: { slug: 1 } })
    .sort({ 'stats.unitsSold30d': -1 })
    .limit(limit)
    .toArray();

  return docs.map((d) => d.slug);
}

/* ------------------------------------------------------------ projection */

/**
 * Build the card projection.
 *
 * Done once on the server so every grid, rail and search result shows the same
 * price, badge and stock logic. Letting each surface derive its own discount
 * maths is how two screens end up disagreeing about what something costs.
 */
export function toProductSummary(
  product: Product,
  lookups: {
    brands: Map<string, Brand>;
    sellers: Map<string, Seller>;
    categories: Map<string, Category>;
  },
): ProductSummary {
  const brand = lookups.brands.get(product.brandId);
  const seller = lookups.sellers.get(product.sellerId);
  const category = lookups.categories.get(product.categoryId);

  const activeVariants = product.variants.filter((v) => v.isActive);
  const totalAvailable = activeVariants.reduce((sum, v) => sum + v.inventory.available, 0);

  // The card quotes the cheapest live variant, which is what the shopper can
  // actually buy at that price.
  const cheapest =
    activeVariants
      .filter((v) => v.inventory.available > 0)
      .sort((a, b) => a.sellingPrice - b.sellingPrice)[0] ?? activeVariants[0];

  const sellingPrice = cheapest?.sellingPrice ?? product.priceRange.minSellingPrice;
  const mrp = cheapest?.mrp ?? product.priceRange.minMrp;
  const discountPercent = mrp > sellingPrice ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0;

  const availableSizes = sortSizes(
    Array.from(
      new Set(activeVariants.filter((v) => v.inventory.available > 0).map((v) => v.size)),
    ),
    product.sizeSystem,
  );

  const photographs = product.media.filter((asset) => asset.kind === 'IMAGE');
  const primary = photographs[0];
  const hover = photographs[1] ?? null;
  const demoClip = product.media.find((asset) => asset.kind === 'VIDEO' && asset.role === 'REEL') ?? product.media.find((asset) => asset.kind === 'VIDEO');

  const colorOptions = product.colorOptions.map((value) => {
    const def = COLOR_BY_VALUE.get(value);
    const variant = product.variants.find((v) => v.color === value);
    return {
      value,
      label: def?.label ?? variant?.colorLabel ?? value,
      hex: def?.hex ?? variant?.colorHex ?? '#8F2C5B',
      image: variant?.media[0]?.url ?? primary?.url ?? '',
    };
  });

  return {
    id: product.id,
    demoPath: demoClip ? `/demo/${product.slug}?clip=${encodeURIComponent(demoClip.id)}` : undefined,
    slug: product.slug,
    title: product.title,
    brandName: brand?.name ?? '',
    brandSlug: brand?.slug ?? '',
    sellerName: seller?.displayName ?? '',
    sellerSlug: seller?.slug ?? '',
    sellerRating: seller?.rating.average ?? 0,
    categorySlug: category?.slug ?? '',
    categoryName: category?.name ?? '',
    gender: product.gender,
    primaryImage: primary?.url ?? '',
    hoverImage: hover?.url ?? null,
    mrp,
    sellingPrice,
    discountPercent,
    rating: product.rating.average,
    ratingCount: product.rating.count,
    colorOptions,
    sizeOptions: product.sizeOptions,
    availableSizes,
    stockLevel: stockLevelFor(totalAvailable),
    totalAvailable,
    badges: badgesFor(product, brand, totalAvailable, discountPercent),
    isSponsored: product.isSponsored,
    isReturnable: product.returnable,
    unitsSold30d: product.stats.unitsSold30d,
    createdAt: product.createdAt,
  };
}

function stockLevelFor(available: number): StockLevel {
  if (available <= 0) return 'OUT_OF_STOCK';
  if (available <= INVENTORY.defaultLowStockThreshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}

/**
 * Card badges.
 *
 * Capped at two: a card carrying four badges communicates nothing. They are
 * ordered by how much they influence a decision, and each one is EARNED from
 * real data — no badge is set by hand, so none of them lies.
 */
function badgesFor(
  product: Product,
  brand: Brand | undefined,
  available: number,
  discountPercent: number,
): ProductBadge[] {
  const badges: ProductBadge[] = [];
  const publishedAt = product.publishedAt ? Date.parse(product.publishedAt) : 0;
  const ageDays = publishedAt ? (Date.now() - publishedAt) / 86_400_000 : Infinity;

  if (available > 0 && available <= INVENTORY.urgencyThreshold) {
    badges.push({ kind: 'LOW_STOCK', label: `Only ${available} left` });
  }
  if (product.stats.unitsSold30d >= CATALOG.bestsellerThreshold) {
    badges.push({ kind: 'BESTSELLER', label: 'Bestseller' });
  }
  if (ageDays <= CATALOG.newArrivalDays) {
    badges.push({ kind: 'NEW', label: 'New' });
  }
  if (discountPercent >= 40) {
    badges.push({ kind: 'DEAL', label: `${discountPercent}% off` });
  }
  if (product.stats.views30d >= CATALOG.trendingViewThreshold) {
    badges.push({ kind: 'TRENDING', label: 'Trending' });
  }
  if (brand?.isPremium) {
    badges.push({ kind: 'PREMIUM', label: 'Premium' });
  }
  if (product.isSponsored) {
    badges.push({ kind: 'SPONSORED', label: 'Sponsored' });
  }

  return badges.slice(0, 2);
}

/**
 * Load the brand/seller/category lookups a batch of products needs.
 *
 * One query per collection for the whole page rather than a lookup per card:
 * the alternative is 48 cards issuing three queries each.
 */
export async function buildLookups(products: Product[]): Promise<{
  brands: Map<string, Brand>;
  sellers: Map<string, Seller>;
  categories: Map<string, Category>;
}> {
  const brandIds = Array.from(new Set(products.map((p) => p.brandId)));
  const sellerIds = Array.from(new Set(products.map((p) => p.sellerId)));
  const categoryIds = Array.from(new Set(products.map((p) => p.categoryId)));

  const [brandCol, sellerCol, categoryCol] = await Promise.all([
    collections.brands(),
    collections.sellers(),
    collections.categories(),
  ]);

  const [brandDocs, sellerDocs, categoryDocs] = await Promise.all([
    brandCol.find({ _id: { $in: brandIds } }).toArray(),
    sellerCol.find({ _id: { $in: sellerIds } }).toArray(),
    categoryCol.find({ _id: { $in: categoryIds } }).toArray(),
  ]);

  return {
    brands: new Map(toEntities(brandDocs).map((b) => [b.id, b])),
    sellers: new Map(toEntities(sellerDocs).map((s) => [s.id, s])),
    categories: new Map(toEntities(categoryDocs).map((c) => [c.id, c])),
  };
}

/** Project a batch of products to cards in one pass. */
export async function toSummaries(products: Product[]): Promise<ProductSummary[]> {
  if (products.length === 0) return [];
  const lookups = await buildLookups(products);
  return products.map((product) => toProductSummary(product, lookups));
}
