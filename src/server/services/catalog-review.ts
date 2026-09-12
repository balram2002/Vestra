import 'server-only';

import type { Brand, Category, Product } from '@/domain/types';

import { collections, toEntities, toEntity } from '../db/collections';
import { countTowards } from './authoring';
import { invalidate } from './cache-invalidation';
import { productTags, tags } from './cache-tags';

/**
 * The catalogue inbox.
 *
 * Sellers publish their own products, brands and categories now, so nothing
 * waits for staff before it reaches shoppers. What staff get instead is this:
 * everything a seller has put in the shop that nobody at the platform has
 * looked at yet, newest first, with the power to keep it, take it down or
 * hide it.
 *
 * HOW "UNSEEN" IS DEFINED, and why it is not simply `reviewedAt: null`.
 *
 * In Mongo a missing field and a null field both match `{field: null}`, and
 * every product that existed before this feature has no `reviewedAt` at all --
 * so that query alone would sweep the entire catalogue into the inbox on the
 * day it shipped. The discriminator is therefore the POSITIVE mark left by the
 * new path: `selfPublished` on a product, `createdBySellerId` on a brand or a
 * category. Old records carry neither and stay out.
 */

export interface InboxProduct {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  status: Product['status'];
  sellerId: string;
  sellerName: string;
  brandName: string;
  categoryName: string;
  price: number;
  stock: number;
  photoCount: number;
  videoCount: number;
  reelCount: number;
  publishedAt: string | null;
}

export interface InboxBrand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string;
  sellerName: string;
  isActive: boolean;
  productCount: number;
  createdAt: string;
}

export interface InboxCategory {
  id: string;
  name: string;
  slug: string;
  trail: string;
  sellerName: string;
  isActive: boolean;
  productCount: number;
  createdAt: string;
}

export interface CatalogueInbox {
  products: InboxProduct[];
  brands: InboxBrand[];
  categories: InboxCategory[];
  total: number;
}

const UNREVIEWED_PRODUCT = { selfPublished: true, reviewedAt: null } as const;
const UNREVIEWED_AUTHORED = { createdBySellerId: { $ne: null }, reviewedAt: null } as const;

/** How many items are waiting. For the badge in the console navigation. */
export async function inboxCount(): Promise<number> {
  const [products, brands, categories] = await Promise.all([
    collections.products(),
    collections.brands(),
    collections.categories(),
  ]);

  const [a, b, c] = await Promise.all([
    products.countDocuments(UNREVIEWED_PRODUCT),
    brands.countDocuments(UNREVIEWED_AUTHORED),
    categories.countDocuments(UNREVIEWED_AUTHORED),
  ]);

  return a + b + c;
}

export async function catalogueInbox(limit = 50): Promise<CatalogueInbox> {
  const [productCol, brandCol, categoryCol, sellerCol] = await Promise.all([
    collections.products(),
    collections.brands(),
    collections.categories(),
    collections.sellers(),
  ]);

  const [products, brands, categories] = await Promise.all([
    productCol
      .find(UNREVIEWED_PRODUCT)
      .sort({ publishedAt: -1 })
      .limit(limit)
      .toArray()
      .then(toEntities<Product>),
    brandCol
      .find(UNREVIEWED_AUTHORED)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()
      .then(toEntities<Brand>),
    categoryCol
      .find(UNREVIEWED_AUTHORED)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()
      .then(toEntities<Category>),
  ]);

  // One lookup for every name these rows need, rather than one per row.
  const sellerIds = [
    ...new Set([
      ...products.map((product) => product.sellerId),
      ...brands.flatMap((brand) => brand.createdBySellerId ?? []),
      ...categories.flatMap((category) => category.createdBySellerId ?? []),
    ]),
  ];
  const brandIds = [...new Set(products.map((product) => product.brandId).filter(Boolean))];
  const categoryIds = [...new Set(products.map((product) => product.categoryId).filter(Boolean))];
  const parentIds = [...new Set(categories.map((category) => category.parentId).filter(Boolean))];

  const [sellerRows, brandRows, categoryRows] = await Promise.all([
    sellerCol.find({ _id: { $in: sellerIds } }).toArray(),
    brandCol.find({ _id: { $in: brandIds } }).toArray(),
    categoryCol
      .find({ _id: { $in: [...categoryIds, ...(parentIds as string[])] } })
      .toArray(),
  ]);

  const sellerName = new Map(sellerRows.map((row) => [row._id, row.displayName]));
  const brandName = new Map(brandRows.map((row) => [row._id, row.name]));
  const categoryName = new Map(categoryRows.map((row) => [row._id, row.name]));

  const { galleryAssets, reelAssets, showcaseVideo } = await import('@/domain/media');

  return {
    products: products.map((product) => ({
      id: product.id,
      title: product.title,
      slug: product.slug,
      imageUrl: galleryAssets(product.media)[0]?.url ?? null,
      status: product.status,
      sellerId: product.sellerId,
      sellerName: sellerName.get(product.sellerId) ?? 'Unknown store',
      brandName: brandName.get(product.brandId) ?? '—',
      categoryName: categoryName.get(product.categoryId) ?? '—',
      price: product.priceRange.minSellingPrice,
      stock: product.variants.reduce((sum, variant) => sum + variant.inventory.available, 0),
      photoCount: galleryAssets(product.media).length,
      videoCount: showcaseVideo(product.media) ? 1 : 0,
      reelCount: reelAssets(product.media).length,
      publishedAt: product.publishedAt,
    })),
    brands: brands.map((brand) => ({
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      logoUrl: brand.logoUrl,
      sellerName: sellerName.get(brand.createdBySellerId ?? '') ?? 'A seller',
      isActive: brand.isActive,
      productCount: brand.productCount,
      createdAt: brand.createdAt,
    })),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      trail: categoryName.get(category.parentId ?? '') ?? category.path.slice(0, -1).join(' › '),
      sellerName: sellerName.get(category.createdBySellerId ?? '') ?? 'A seller',
      isActive: category.isActive,
      productCount: category.productCount,
      createdAt: category.createdAt,
    })),
    total: products.length + brands.length + categories.length,
  };
}

/* ------------------------------------------------------------- decisions */

export type ProductDecision = 'KEEP' | 'UNPUBLISH' | 'ARCHIVE';
export type ItemDecision = 'KEEP' | 'HIDE';

export interface DecisionResult {
  ok: boolean;
  error?: string;
  /** What the seller should be told, when anything changed for them. */
  notice?: { sellerId: string; title: string; body: string };
}

/**
 * Decide on a live listing.
 *
 * KEEP is not a no-op: marking it reviewed is what takes it out of the inbox,
 * and without it the same rows are read forever.
 */
export async function decideProduct(
  reviewerId: string,
  productId: string,
  decision: ProductDecision,
  reason?: string,
): Promise<DecisionResult> {
  const products = await collections.products();
  const product = toEntity(await products.findOne({ _id: productId }));
  if (!product) return { ok: false, error: 'Product not found.' };

  const iso = new Date().toISOString();
  const reviewed = { reviewedAt: iso, reviewedByUserId: reviewerId, updatedAt: iso };

  if (decision === 'KEEP') {
    await products.updateOne(
      { _id: productId },
      { $set: { ...reviewed, approvedAt: iso, approvedByUserId: reviewerId } },
    );
    invalidate(productTags(productId, 'content'));
    return { ok: true };
  }

  const status = decision === 'ARCHIVE' ? ('ARCHIVED' as const) : ('UNPUBLISHED' as const);
  await products.updateOne(
    { _id: productId },
    { $set: { ...reviewed, status, rejectionReason: reason?.trim() || null } },
  );

  // It was live until a moment ago, so every grid it appeared in is now wrong.
  if (product.status === 'PUBLISHED') await countTowards(product, -1);
  invalidate([
    ...productTags(productId, 'status'),
    ...product.categoryPath.map((slug) => tags.category(slug)),
  ]);

  return {
    ok: true,
    notice: {
      sellerId: product.sellerId,
      title: decision === 'ARCHIVE' ? 'A listing was archived' : 'A listing was taken down',
      body: reason?.trim()
        ? `"${product.title}": ${reason.trim()}`
        : `"${product.title}" was taken down by the catalogue team.`,
    },
  };
}

export async function decideBrand(
  reviewerId: string,
  brandId: string,
  decision: ItemDecision,
): Promise<DecisionResult> {
  const brands = await collections.brands();
  const brand = toEntity(await brands.findOne({ _id: brandId }));
  if (!brand) return { ok: false, error: 'Brand not found.' };

  const iso = new Date().toISOString();
  await brands.updateOne(
    { _id: brandId },
    {
      $set: {
        reviewedAt: iso,
        reviewedByUserId: reviewerId,
        isActive: decision === 'KEEP',
        updatedAt: iso,
      },
    },
  );

  invalidate([tags.brandList, tags.brand(brand.slug)]);

  if (decision === 'KEEP' || !brand.createdBySellerId) return { ok: true };
  return {
    ok: true,
    notice: {
      sellerId: brand.createdBySellerId,
      title: 'A brand was hidden',
      body: `"${brand.name}" is no longer shown in the shop. Its products stay reachable by link.`,
    },
  };
}

export async function decideCategory(
  reviewerId: string,
  categoryId: string,
  decision: ItemDecision,
): Promise<DecisionResult> {
  const categories = await collections.categories();
  const category = toEntity(await categories.findOne({ _id: categoryId }));
  if (!category) return { ok: false, error: 'Category not found.' };

  const iso = new Date().toISOString();
  await categories.updateOne(
    { _id: categoryId },
    {
      $set: {
        reviewedAt: iso,
        reviewedByUserId: reviewerId,
        isActive: decision === 'KEEP',
        updatedAt: iso,
      },
    },
  );

  invalidate([tags.taxonomy, tags.category(category.slug)]);

  if (decision === 'KEEP' || !category.createdBySellerId) return { ok: true };
  return {
    ok: true,
    notice: {
      sellerId: category.createdBySellerId,
      title: 'A category was hidden',
      body: `"${category.name}" is no longer shown in the shop.`,
    },
  };
}
