import 'server-only';

import { CATALOG, INVENTORY, RETURNS } from '@/config/business';
import { attributesForFamily, colorHex, colorLabel, sortSizes } from '@/domain/attributes';
import type { Media, Product, ProductVariant } from '@/domain/types';
import { barcode, entityId, skuCode } from '@/lib/ids';
import { discountPercent } from '@/lib/pricing/calculate';
import { productSlug } from '@/lib/slug';
import {
  readinessBlockers,
  type Blocker,
  type DraftInput,
  type VariantInput,
} from '@/lib/validation/product';

import { collections, toEntities, toEntity } from '../db/collections';
import { invalidate } from './cache-invalidation';
import { productTags } from './cache-tags';
import { notifyQuietly } from './notifications';

/**
 * Listing authoring.
 *
 * The seller's half of the catalogue. Three rules shape it:
 *
 *  1. A DRAFT IS ALWAYS SAVEABLE. Sellers write listings across several
 *     sittings, and a form that refuses to save until it is complete loses
 *     work. Completeness is checked at SUBMIT, not at save.
 *
 *  2. EDITING A LIVE LISTING DOES NOT SILENTLY CHANGE WHAT SHOPPERS SEE for
 *     anything material. Price and stock apply immediately, because those are
 *     the seller's to set; title, imagery and category go back through review,
 *     because those are what the catalogue team approved.
 *
 *  3. SLUGS ARE NEVER REUSED OR BROKEN. A renamed product keeps its old slug
 *     in `slugHistory`, and the storefront redirects — otherwise every inbound
 *     link and search result to that product dies on the next rename.
 */

/* ----------------------------------------------------------------- create */

export async function createDraft(
  sellerId: string,
  input: DraftInput,
): Promise<{ ok: boolean; error?: string; productId?: string }> {
  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: sellerId }));
  if (!seller) return { ok: false, error: 'Seller not found.' };
  if (seller.status !== 'ACTIVE' && seller.status !== 'APPROVED') {
    return { ok: false, error: 'Your store is not approved to list products yet.' };
  }

  const id = entityId('prd');
  const iso = new Date().toISOString();

  const category = input.categoryId ? await findCategory(input.categoryId) : null;
  const brand = input.brandId ? await findBrand(input.brandId) : null;

  // A seller may only list in categories they are approved for. Checked here
  // rather than only in the form, because the form is a courtesy.
  if (category && seller.approvedCategoryIds.length > 0) {
    const allowed = category.path.some((ancestor) => seller.approvedCategoryIds.includes(ancestor));
    if (!allowed && !seller.approvedCategoryIds.includes(category.id)) {
      return { ok: false, error: 'Your store is not approved to list in that category.' };
    }
  }

  const product: Product = {
    id,
    slug: productSlug(input.title, id),
    slugHistory: [],
    title: input.title.trim(),
    styleCode: `${brand?.code ?? seller.code}${Math.floor(10000 + Math.random() * 89999)}`,
    brandId: input.brandId || '',
    sellerId,
    categoryId: input.categoryId || '',
    categoryPath: category?.path ?? [],
    gender: input.gender ?? category?.gender ?? 'UNISEX',
    status: 'DRAFT',

    description: input.description?.trim() ?? '',
    highlights: input.highlights ?? [],
    attributes: input.attributes ?? {},
    specifications: [],
    careInstructions: input.careInstructions ?? [],
    countryOfOrigin: input.countryOfOrigin ?? 'India',
    manufacturerName: input.manufacturerName ?? seller.legalName,
    manufacturerAddress: input.manufacturerAddress ?? '',
    packerName: seller.legalName,
    netQuantity: input.netQuantity ?? '1 piece',

    media: [],
    variants: [],
    colorOptions: [],
    sizeOptions: [],
    sizeSystem: category?.sizeSystem ?? 'ALPHA',
    sizeChart: category?.sizeChart ?? null,
    modelNote: null,

    priceRange: { minSellingPrice: 0, maxSellingPrice: 0, minMrp: 0, maxMrp: 0 },
    maxDiscountPercent: 0,

    taxRatePercent: category?.taxRatePercent ?? 12,
    hsnCode: input.hsnCode ?? '',

    rating: { average: 0, count: 0, distribution: [0, 0, 0, 0, 0], fitTrueToSizePercent: null },
    stats: {
      views30d: 0,
      addToBag30d: 0,
      unitsSold30d: 0,
      unitsSoldLifetime: 0,
      wishlistCount: 0,
      returnRate: 0,
      conversionRate: 0,
    },

    returnable: input.returnable ?? (category?.returnable ?? true),
    returnWindowDays: input.returnWindowDays ?? seller.policies.returnWindowDays ?? RETURNS.defaultWindowDays,
    exchangeable: input.exchangeable ?? true,
    codAvailable: input.codAvailable ?? seller.policies.codEnabled,
    warrantyMonths: null,

    submittedAt: null,
    approvedAt: null,
    approvedByUserId: null,
    rejectionReason: null,
    publishedAt: null,
    createdAt: iso,
    updatedAt: iso,

    metaTitle: input.metaTitle ?? null,
    metaDescription: input.metaDescription ?? null,

    tags: [],
    isSponsored: false,
  };

  const products = await collections.products();
  await products.insertOne({ ...product, _id: product.id });

  return { ok: true, productId: id };
}

/* ----------------------------------------------------------------- update */

export async function updateDraft(
  sellerId: string,
  productId: string,
  input: DraftInput,
): Promise<{ ok: boolean; error?: string; requiresReview?: boolean }> {
  const products = await collections.products();
  const product = toEntity(await products.findOne({ _id: productId, sellerId }));
  if (!product) return { ok: false, error: 'Product not found.' };
  if (product.status === 'ARCHIVED') {
    return { ok: false, error: 'Archived listings cannot be edited. Duplicate it instead.' };
  }

  const category = input.categoryId ? await findCategory(input.categoryId) : null;
  const iso = new Date().toISOString();

  /*
   * Rule 2: which edits are material.
   *
   * A live listing whose title, imagery or category changed is effectively a
   * different listing and goes back to review. Copy tweaks and policy flags do
   * not — sending those back would mean sellers stop fixing typos.
   */
  const titleChanged = input.title.trim() !== product.title;
  const categoryChanged = Boolean(input.categoryId) && input.categoryId !== product.categoryId;
  const brandChanged = Boolean(input.brandId) && input.brandId !== product.brandId;
  const material = titleChanged || categoryChanged || brandChanged;
  const wasLive = product.status === 'PUBLISHED';
  const requiresReview = material && wasLive;

  const patch: Partial<Product> = {
    title: input.title.trim(),
    brandId: input.brandId || product.brandId,
    categoryId: input.categoryId || product.categoryId,
    categoryPath: category?.path ?? product.categoryPath,
    gender: input.gender ?? product.gender,
    description: input.description?.trim() ?? product.description,
    highlights: input.highlights ?? product.highlights,
    attributes: input.attributes ?? product.attributes,
    careInstructions: input.careInstructions ?? product.careInstructions,
    countryOfOrigin: input.countryOfOrigin ?? product.countryOfOrigin,
    manufacturerName: input.manufacturerName ?? product.manufacturerName,
    manufacturerAddress: input.manufacturerAddress ?? product.manufacturerAddress,
    netQuantity: input.netQuantity ?? product.netQuantity,
    hsnCode: input.hsnCode ?? product.hsnCode,
    returnable: input.returnable ?? product.returnable,
    returnWindowDays: input.returnWindowDays ?? product.returnWindowDays,
    exchangeable: input.exchangeable ?? product.exchangeable,
    codAvailable: input.codAvailable ?? product.codAvailable,
    metaTitle: input.metaTitle ?? product.metaTitle,
    metaDescription: input.metaDescription ?? product.metaDescription,
    sizeSystem: category?.sizeSystem ?? product.sizeSystem,
    sizeChart: category?.sizeChart ?? product.sizeChart,
    taxRatePercent: category?.taxRatePercent ?? product.taxRatePercent,
    updatedAt: iso,
  };

  // Rule 3: a rename keeps the old slug alive.
  if (titleChanged) {
    patch.slug = productSlug(input.title, product.id);
    if (patch.slug !== product.slug) {
      patch.slugHistory = [...new Set([...product.slugHistory, product.slug])].slice(-10);
    }
  }

  if (requiresReview) {
    patch.status = 'PENDING_REVIEW';
    patch.submittedAt = iso;
    patch.approvedAt = null;
    patch.approvedByUserId = null;
  }

  await products.updateOne({ _id: productId }, { $set: patch });

  /*
   * A material edit sends a live listing back to review, which changes whether
   * it is buyable at all — so the blast radius depends on what happened, not on
   * the fact that something did.
   */
  invalidate(productTags(productId, requiresReview ? 'status' : 'content'));

  return { ok: true, requiresReview };
}

/* --------------------------------------------------------------- variants */

/**
 * Replace the size/colour matrix.
 *
 * Variants that already exist are UPDATED rather than recreated, because their
 * ids appear on live carts, wishlists and historical orders. A variant that
 * disappears from the matrix is deactivated rather than deleted, for the same
 * reason: an order item points at it forever.
 */
export async function setVariants(
  sellerId: string,
  productId: string,
  inputs: VariantInput[],
): Promise<{ ok: boolean; error?: string }> {
  const products = await collections.products();
  const product = toEntity(await products.findOne({ _id: productId, sellerId }));
  if (!product) return { ok: false, error: 'Product not found.' };

  if (inputs.length === 0) return { ok: false, error: 'A style needs at least one size.' };

  const brands = await collections.brands();
  const brand = product.brandId ? toEntity(await brands.findOne({ _id: product.brandId })) : null;
  const brandCode = brand?.code ?? 'VSTR';

  const iso = new Date().toISOString();
  const existing = new Map(product.variants.map((variant) => [variant.id, variant]));
  const seen = new Set<string>();

  const variants: ProductVariant[] = inputs.map((input, index) => {
    const previous = input.id ? existing.get(input.id) : undefined;
    const id = previous?.id ?? entityId('var');
    seen.add(id);

    const label = colorLabel(input.color);

    return {
      id,
      productId: product.id,
      sku: previous?.sku ?? skuCode(brandCode, product.styleCode, input.size, input.color),
      sellerSku: input.sellerSku?.trim() || previous?.sellerSku || '',
      barcode: previous?.barcode ?? barcode(index + Date.now()),
      size: input.size,
      color: input.color,
      colorLabel: label,
      colorHex: colorHex(input.color),
      mrp: input.mrp,
      sellingPrice: input.sellingPrice,
      costPrice: previous?.costPrice ?? null,
      inventory: previous?.inventory
        ? { ...previous.inventory, available: input.available, updatedAt: iso }
        : {
            variantId: id,
            available: input.available,
            reserved: 0,
            sold: 0,
            returned: 0,
            damaged: 0,
            lowStockThreshold: INVENTORY.defaultLowStockThreshold,
            restockEta: null,
            updatedAt: iso,
          },
      media: previous?.media ?? [],
      weightGrams: previous?.weightGrams ?? 220,
      dimensionsCm: previous?.dimensionsCm ?? { length: 30, width: 24, height: 4 },
      isActive: input.isActive,
    };
  });

  // Anything dropped from the matrix is retired, never removed: live carts and
  // historical order items still point at it.
  for (const [id, variant] of existing) {
    if (seen.has(id)) continue;
    variants.push({ ...variant, isActive: false });
  }

  const active = variants.filter((variant) => variant.isActive);
  const prices = active.length > 0 ? active : variants;

  await products.updateOne(
    { _id: productId },
    {
      $set: {
        variants,
        colorOptions: [...new Set(active.map((variant) => variant.color))],
        sizeOptions: sortSizes(
          [...new Set(active.map((variant) => variant.size))],
          product.sizeSystem,
        ),
        priceRange: {
          minSellingPrice: Math.min(...prices.map((v) => v.sellingPrice)),
          maxSellingPrice: Math.max(...prices.map((v) => v.sellingPrice)),
          minMrp: Math.min(...prices.map((v) => v.mrp)),
          maxMrp: Math.max(...prices.map((v) => v.mrp)),
        },
        maxDiscountPercent: Math.max(
          0,
          ...prices.map((v) => discountPercent(v.mrp, v.sellingPrice)),
        ),
        updatedAt: iso,
      },
    },
  );

  /*
   * The matrix carries prices, sizes and opening stock, so this moves grid
   * ordering and price facets as well as the product's own page.
   */
  invalidate(productTags(productId, 'price'));

  return { ok: true };
}

/* ------------------------------------------------------------------ media */

export async function attachMedia(
  sellerId: string,
  productId: string,
  media: Array<{ url: string; contentType: string; width: number | null; height: number | null }>,
): Promise<{ ok: boolean; error?: string }> {
  const products = await collections.products();
  const product = toEntity(await products.findOne({ _id: productId, sellerId }));
  if (!product) return { ok: false, error: 'Product not found.' };

  const images = product.media.filter((asset) => asset.kind === 'IMAGE').length;
  const videos = product.media.filter((asset) => asset.kind === 'VIDEO').length;

  const incomingImages = media.filter((asset) => !asset.contentType.startsWith('video/')).length;
  const incomingVideos = media.length - incomingImages;

  if (images + incomingImages > CATALOG.maxImagesPerProduct) {
    return { ok: false, error: `A listing can carry ${CATALOG.maxImagesPerProduct} photos.` };
  }
  if (videos + incomingVideos > CATALOG.maxVideosPerProduct) {
    return { ok: false, error: `A listing can carry ${CATALOG.maxVideosPerProduct} videos.` };
  }

  const added: Media[] = media.map((asset, index) => ({
    id: entityId('med'),
    kind: asset.contentType.startsWith('video/') ? 'VIDEO' : 'IMAGE',
    url: asset.url,
    thumbnailUrl: asset.url,
    alt: product.title,
    width: asset.width ?? 900,
    height: asset.height ?? 1200,
    position: product.media.length + index,
    variantId: null,
  }));

  await products.updateOne(
    { _id: productId },
    { $push: { media: { $each: added } }, $set: { updatedAt: new Date().toISOString() } },
  );

  invalidate(productTags(productId, 'content'));

  return { ok: true };
}

export async function removeMedia(
  sellerId: string,
  productId: string,
  mediaId: string,
): Promise<{ ok: boolean; error?: string }> {
  const products = await collections.products();
  const product = toEntity(await products.findOne({ _id: productId, sellerId }));
  if (!product) return { ok: false, error: 'Product not found.' };

  const remaining = product.media
    .filter((asset) => asset.id !== mediaId)
    // Positions must stay contiguous or the gallery order goes strange.
    .map((asset, index) => ({ ...asset, position: index }));

  await products.updateOne(
    { _id: productId },
    { $set: { media: remaining, updatedAt: new Date().toISOString() } },
  );

  const removed = product.media.find((asset) => asset.id === mediaId);
  if (removed?.url.startsWith('/api/media/upload/')) {
    const { mediaStore } = await import('../media/store');
    await mediaStore().remove(removed.url.split('/').pop() ?? '');
  }

  invalidate(productTags(productId, 'content'));

  return { ok: true };
}

/** Promote one asset to the front of the gallery. */
export async function setPrimaryMedia(
  sellerId: string,
  productId: string,
  mediaId: string,
): Promise<{ ok: boolean; error?: string }> {
  const products = await collections.products();
  const product = toEntity(await products.findOne({ _id: productId, sellerId }));
  if (!product) return { ok: false, error: 'Product not found.' };

  const target = product.media.find((asset) => asset.id === mediaId);
  if (!target) return { ok: false, error: 'That image is not on this listing.' };

  const reordered = [target, ...product.media.filter((asset) => asset.id !== mediaId)].map(
    (asset, index) => ({ ...asset, position: index }),
  );

  await products.updateOne(
    { _id: productId },
    { $set: { media: reordered, updatedAt: new Date().toISOString() } },
  );

  invalidate(productTags(productId, 'content'));

  return { ok: true };
}

/* -------------------------------------------------------------- lifecycle */

/** What still stands between this listing and the review queue. */
export async function blockersFor(product: Product): Promise<Blocker[]> {
  const category = product.categoryId ? await findCategory(product.categoryId) : null;
  const required = category
    ? attributesForFamily(category.attributeFamily)
        .filter((definition) => definition.required)
        .map((definition) => definition.key)
    : [];

  return readinessBlockers({
    title: product.title,
    brandId: product.brandId,
    categoryId: product.categoryId,
    description: product.description,
    mediaCount: product.media.length,
    // Stock lives inside the variant's inventory subdocument; the readiness
    // check only cares about the number.
    variants: product.variants.map((variant) => ({
      mrp: variant.mrp,
      sellingPrice: variant.sellingPrice,
      available: variant.inventory.available,
      isActive: variant.isActive,
    })),
    requiredAttributes: required,
    attributes: product.attributes,
  });
}

export async function submitForReview(
  sellerId: string,
  productId: string,
): Promise<{ ok: boolean; error?: string; blockers?: Blocker[] }> {
  const products = await collections.products();
  const product = toEntity(await products.findOne({ _id: productId, sellerId }));
  if (!product) return { ok: false, error: 'Product not found.' };

  if (product.status === 'PENDING_REVIEW' || product.status === 'SUBMITTED') {
    return { ok: false, error: 'This listing is already waiting for review.' };
  }

  const blockers = await blockersFor(product);
  if (blockers.length > 0) {
    return { ok: false, error: 'This listing is not ready yet.', blockers };
  }

  const iso = new Date().toISOString();
  await products.updateOne(
    { _id: productId },
    {
      $set: {
        status: 'PENDING_REVIEW',
        submittedAt: iso,
        rejectionReason: null,
        updatedAt: iso,
      },
    },
  );

  // Leaving the draft state changes whether the listing is buyable.
  invalidate(productTags(productId, 'status'));

  return { ok: true };
}

/**
 * Take a live listing down, or put an approved one back up.
 *
 * Unpublishing is the seller's own decision and does not need review — it is
 * how a store handles a supply problem without deleting a listing that has
 * ratings and search history attached to it.
 */
export async function setPublished(
  sellerId: string,
  productId: string,
  published: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const products = await collections.products();
  const product = toEntity(await products.findOne({ _id: productId, sellerId }));
  if (!product) return { ok: false, error: 'Product not found.' };

  if (published && !product.approvedAt) {
    return { ok: false, error: 'This listing has not been approved yet.' };
  }
  if (published && product.status !== 'UNPUBLISHED' && product.status !== 'APPROVED') {
    return { ok: false, error: 'Only an approved or unpublished listing can be put live.' };
  }
  if (!published && product.status !== 'PUBLISHED') {
    return { ok: false, error: 'Only a live listing can be taken down.' };
  }

  const iso = new Date().toISOString();
  await products.updateOne(
    { _id: productId },
    {
      $set: {
        status: published ? 'PUBLISHED' : 'UNPUBLISHED',
        publishedAt: published ? (product.publishedAt ?? iso) : product.publishedAt,
        updatedAt: iso,
      },
    },
  );

  /*
   * Going live is the whole reason a seller pressed the button, and taking a
   * listing down is usually urgent. Neither can wait for a cache to expire on
   * its own clock.
   */
  invalidate(productTags(productId, 'status'));

  return { ok: true };
}

export async function archiveProduct(
  sellerId: string,
  productId: string,
): Promise<{ ok: boolean; error?: string }> {
  const products = await collections.products();
  const product = toEntity(await products.findOne({ _id: productId, sellerId }));
  if (!product) return { ok: false, error: 'Product not found.' };

  await products.updateOne(
    { _id: productId },
    { $set: { status: 'ARCHIVED', updatedAt: new Date().toISOString() } },
  );

  invalidate(productTags(productId, 'status'));

  return { ok: true };
}

/**
 * Copy a listing into a fresh draft.
 *
 * The common way sellers add a new colourway. Everything descriptive carries
 * over; nothing that belongs to the original — its ratings, its sales history,
 * its slug, its approval — does.
 */
export async function duplicateProduct(
  sellerId: string,
  productId: string,
): Promise<{ ok: boolean; error?: string; productId?: string }> {
  const products = await collections.products();
  const source = toEntity(await products.findOne({ _id: productId, sellerId }));
  if (!source) return { ok: false, error: 'Product not found.' };

  const id = entityId('prd');
  const iso = new Date().toISOString();
  const title = `${source.title} (copy)`;

  const copy: Product = {
    ...source,
    id,
    slug: productSlug(title, id),
    slugHistory: [],
    title,
    status: 'DRAFT',
    // Fresh variant ids: the originals are referenced by live carts and orders.
    variants: source.variants.map((variant) => {
      const variantId = entityId('var');
      return {
        ...variant,
        id: variantId,
        productId: id,
        sku: `${variant.sku}-C${Math.floor(Math.random() * 900 + 100)}`,
        inventory: { ...variant.inventory, variantId, available: 0, reserved: 0, sold: 0 },
      };
    }),
    media: source.media.map((asset) => ({ ...asset, id: entityId('med') })),
    rating: { average: 0, count: 0, distribution: [0, 0, 0, 0, 0], fitTrueToSizePercent: null },
    stats: {
      views30d: 0,
      addToBag30d: 0,
      unitsSold30d: 0,
      unitsSoldLifetime: 0,
      wishlistCount: 0,
      returnRate: 0,
      conversionRate: 0,
    },
    submittedAt: null,
    approvedAt: null,
    approvedByUserId: null,
    rejectionReason: null,
    publishedAt: null,
    createdAt: iso,
    updatedAt: iso,
  };

  await products.insertOne({ ...copy, _id: copy.id });
  return { ok: true, productId: id };
}

/* ------------------------------------------------------------------ reads */

export async function getSellerProduct(
  sellerId: string,
  productId: string,
): Promise<Product | null> {
  const products = await collections.products();
  return toEntity(await products.findOne({ _id: productId, sellerId }));
}

/** Brands and categories a seller may actually pick from. */
export async function authoringOptions(sellerId: string) {
  const [sellers, brandCol, categoryCol] = await Promise.all([
    collections.sellers(),
    collections.brands(),
    collections.categories(),
  ]);

  const seller = toEntity(await sellers.findOne({ _id: sellerId }));
  const brands = toEntities(await brandCol.find({ isActive: true }).sort({ name: 1 }).toArray());
  const allCategories = toEntities(
    await categoryCol.find({ isActive: true }).sort({ path: 1 }).toArray(),
  );

  // Only leaf categories can hold products; a department is a navigation node.
  const leaves = allCategories.filter(
    (category) => !allCategories.some((other) => other.parentId === category.id),
  );

  const approved = seller?.approvedCategoryIds ?? [];
  const categories =
    approved.length === 0
      ? leaves
      : leaves.filter(
          (category) =>
            approved.includes(category.id) ||
            category.path.some((ancestor) => approved.includes(ancestor)),
        );

  return {
    brands: brands.map((brand) => ({ id: brand.id, name: brand.name })),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.path.length > 1 ? category.path.join(' › ') : category.name,
      attributeFamily: category.attributeFamily,
      sizeSystem: category.sizeSystem,
    })),
  };
}

/* --------------------------------------------------------------- helpers */

async function findCategory(id: string) {
  const categories = await collections.categories();
  return toEntity(await categories.findOne({ _id: id }));
}

async function findBrand(id: string) {
  const brands = await collections.brands();
  return toEntity(await brands.findOne({ _id: id }));
}

/** Tell the catalogue team something is waiting. */
export async function notifyReviewers(productTitle: string, sellerName: string): Promise<void> {
  const users = await collections.users();
  const reviewers = toEntities(
    await users.find({ roles: { $in: ['CATALOG_MANAGER', 'ADMIN', 'SUPER_ADMIN'] } }).limit(5).toArray(),
  );

  for (const reviewer of reviewers) {
    notifyQuietly({
      userId: reviewer.id,
      category: 'CATALOG',
      title: 'A listing is waiting for review',
      body: `${sellerName} submitted "${productTitle}".`,
      href: '/admin/products?status=PENDING_REVIEW',
      entityType: 'product',
      entityId: productTitle,
    });
  }
}
