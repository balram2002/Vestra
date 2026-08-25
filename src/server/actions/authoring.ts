'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { draftSchema, variantInputSchema, type Blocker } from '@/lib/validation/product';

import { requireSeller } from '../auth/session';
import { collections, toEntity } from '../db/collections';
import { mediaStore } from '../media/store';
import {
  archiveProduct,
  attachMedia,
  createDraft,
  duplicateProduct,
  notifyReviewers,
  removeMedia,
  setPrimaryMedia,
  setPublished,
  setVariants,
  submitForReview,
  updateDraft,
} from '../services/authoring';

/**
 * Listing authoring actions.
 *
 * The seller id always comes from the SESSION, and every service call is
 * scoped by it — the product id in the argument is a claim about which listing
 * to edit, never a claim about whose listing it is.
 */

export interface AuthoringResult {
  ok: boolean;
  error?: string;
  productId?: string;
  /** Why a submission was refused, field by field. */
  blockers?: Blocker[];
  /** Set when an edit to a live listing sent it back for review. */
  requiresReview?: boolean;
}

function refresh(productId?: string): void {
  revalidatePath('/seller/products');
  if (productId) revalidatePath(`/seller/products/${productId}`);
}

/* ------------------------------------------------------------------ save */

export async function saveListing(input: {
  productId?: string;
  draft: unknown;
}): Promise<AuthoringResult> {
  const user = await requireSeller();

  const parsed = draftSchema.safeParse(input.draft);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the highlighted fields.' };
  }

  if (input.productId) {
    const result = await updateDraft(user.sellerId, input.productId, parsed.data);
    if (!result.ok) return { ok: false, error: result.error };
    refresh(input.productId);
    return { ok: true, productId: input.productId, requiresReview: result.requiresReview };
  }

  const created = await createDraft(user.sellerId, parsed.data);
  if (!created.ok) return { ok: false, error: created.error };
  refresh(created.productId);
  return { ok: true, productId: created.productId };
}

export async function saveVariants(input: {
  productId: string;
  variants: unknown;
}): Promise<AuthoringResult> {
  const user = await requireSeller();

  const parsed = z.array(variantInputSchema).min(1).max(120).safeParse(input.variants);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the size grid.' };
  }

  // A duplicate size+colour pair would produce two rows a shopper cannot tell
  // apart, and two SKUs the warehouse cannot either.
  const seen = new Set<string>();
  for (const variant of parsed.data) {
    const key = `${variant.size}::${variant.color}`;
    if (seen.has(key)) {
      return { ok: false, error: `${variant.size} in ${variant.color} is listed twice.` };
    }
    seen.add(key);
  }

  const result = await setVariants(user.sellerId, input.productId, parsed.data);
  if (!result.ok) return { ok: false, error: result.error };

  refresh(input.productId);
  revalidatePath('/seller/inventory');
  return { ok: true, productId: input.productId };
}

/* ----------------------------------------------------------------- media */

/**
 * Upload one or more assets.
 *
 * Takes `FormData` rather than a serialised payload because that is how files
 * cross the boundary without being base64-inflated by a third. Each file is
 * validated by its BYTES inside the store, not by what the browser called it.
 */
export async function uploadListingMedia(formData: FormData): Promise<AuthoringResult> {
  const user = await requireSeller();

  const productId = String(formData.get('productId') ?? '');
  if (!productId) return { ok: false, error: 'Save the listing before adding photos.' };

  const products = await collections.products();
  const owns = await products.countDocuments({ _id: productId, sellerId: user.sellerId });
  if (owns === 0) return { ok: false, error: 'Product not found.' };

  const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) return { ok: false, error: 'Choose at least one file.' };

  const store = mediaStore();
  const stored: Array<{ url: string; contentType: string; width: number | null; height: number | null }> = [];

  for (const file of files) {
    const result = await store.put(file, { scope: productId });
    if (!result.ok) {
      // Clean up anything already written: a half-successful upload leaves
      // orphaned bytes that nothing will ever reference.
      for (const asset of stored) {
        await store.remove(asset.url.split('/').pop() ?? '');
      }
      return { ok: false, error: `${file.name}: ${result.error}` };
    }
    stored.push(result.media);
  }

  const attached = await attachMedia(user.sellerId, productId, stored);
  if (!attached.ok) {
    for (const asset of stored) await store.remove(asset.url.split('/').pop() ?? '');
    return { ok: false, error: attached.error };
  }

  refresh(productId);
  return { ok: true, productId };
}

export async function deleteListingMedia(input: {
  productId: string;
  mediaId: string;
}): Promise<AuthoringResult> {
  const user = await requireSeller();
  const result = await removeMedia(user.sellerId, input.productId, input.mediaId);
  if (!result.ok) return { ok: false, error: result.error };
  refresh(input.productId);
  return { ok: true };
}

export async function makeListingMediaPrimary(input: {
  productId: string;
  mediaId: string;
}): Promise<AuthoringResult> {
  const user = await requireSeller();
  const result = await setPrimaryMedia(user.sellerId, input.productId, input.mediaId);
  if (!result.ok) return { ok: false, error: result.error };
  refresh(input.productId);
  return { ok: true };
}

/* ------------------------------------------------------------- lifecycle */

export async function submitListing(input: { productId: string }): Promise<AuthoringResult> {
  const user = await requireSeller();

  const result = await submitForReview(user.sellerId, input.productId);
  if (!result.ok) return { ok: false, error: result.error, blockers: result.blockers };

  const [products, sellers] = await Promise.all([collections.products(), collections.sellers()]);
  const product = toEntity(await products.findOne({ _id: input.productId }));
  const seller = toEntity(await sellers.findOne({ _id: user.sellerId }));
  if (product && seller) await notifyReviewers(product.title, seller.displayName);

  refresh(input.productId);
  revalidatePath('/admin/products');
  return { ok: true, productId: input.productId };
}

export async function setListingPublished(input: {
  productId: string;
  published: boolean;
}): Promise<AuthoringResult> {
  const user = await requireSeller();
  const result = await setPublished(user.sellerId, input.productId, input.published);
  if (!result.ok) return { ok: false, error: result.error };
  refresh(input.productId);
  return { ok: true };
}

export async function archiveListing(input: { productId: string }): Promise<AuthoringResult> {
  const user = await requireSeller();
  const result = await archiveProduct(user.sellerId, input.productId);
  if (!result.ok) return { ok: false, error: result.error };
  refresh(input.productId);
  return { ok: true };
}

export async function duplicateListing(input: { productId: string }): Promise<AuthoringResult> {
  const user = await requireSeller();
  const result = await duplicateProduct(user.sellerId, input.productId);
  if (!result.ok) return { ok: false, error: result.error };
  refresh();
  return { ok: true, productId: result.productId };
}
