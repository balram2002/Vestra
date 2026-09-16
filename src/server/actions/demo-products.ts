'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { z } from 'zod';
import { requireSeller } from '../auth/session';
import { collections } from '../db/collections';
import { tags } from '../services/cache-tags';
import { record } from '../services/audit';

const schema = z.object({ productId: z.string().min(1), mediaId: z.string().min(1), featuredProductIds: z.array(z.string().min(1)).max(11) });

export async function saveDemoProducts(input: unknown) {
  const actor = await requireSeller();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Choose up to 11 featured products.' };
  const { productId, mediaId } = parsed.data;
  const ids = [...new Set(parsed.data.featuredProductIds)].filter((id) => id !== productId);
  const products = await collections.products();
  const product = await products.findOne({ _id: productId, sellerId: actor.sellerId, media: { $elemMatch: { id: mediaId, kind: 'VIDEO' } } });
  if (!product) return { ok: false, error: 'This video is unavailable.' };
  const count = await products.countDocuments({ _id: { $in: ids }, sellerId: actor.sellerId, status: 'PUBLISHED' });
  if (count !== ids.length) return { ok: false, error: 'Choose published products from your own store.' };
  const result = await products.updateOne({ _id: productId, sellerId: actor.sellerId, media: { $elemMatch: { id: mediaId, kind: 'VIDEO' } } }, { $set: { 'media.$.featuredProductIds': ids, updatedAt: new Date().toISOString() } });
  if (!result.matchedCount) return { ok: false, error: 'The clip changed. Reload and try again.' };
  await record({ actor, action: 'product.demo.update', entityType: 'Product', entityId: productId, entityLabel: product.title, changes: [{ field: `media.${mediaId}.featuredProductIds`, before: product.media.find((item) => item.id === mediaId)?.featuredProductIds ?? [], after: ids }] });
  updateTag(tags.product(productId));
  updateTag(tags.productList);
  revalidatePath(`/seller/products/${productId}`);
  return { ok: true };
}
