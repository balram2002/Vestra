'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '../auth/session';
import { collections } from '../db/collections';
import { record } from '../services/audit';
import { tags } from '../services/cache-tags';

const label = z.string().trim().max(24).transform((value) => value || null);
const schema = z.object({
  trustScore: label,
  averageShipTime: label,
  productsSold: label,
  showStats: z.boolean(),
});

export async function saveSellerStorefront(sellerId: string, input: unknown) {
  const actor = await requirePermission('seller:write');
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Use at most 24 characters for each statistic.' };
  const sellers = await collections.sellers();
  const seller = await sellers.findOne({ _id: sellerId });
  if (!seller) return { ok: false, error: 'Seller not found.' };
  await sellers.updateOne({ _id: sellerId }, { $set: { storefrontStats: parsed.data, updatedAt: new Date().toISOString() } });
  await record({ actor, action: 'seller.storefront.update', entityType: 'Seller', entityId: sellerId,
    entityLabel: seller.displayName, changes: [{ field: 'storefrontStats', before: seller.storefrontStats ?? null, after: parsed.data }] });
  updateTag(tags.seller(seller.slug));
  updateTag(tags.sellerList);
  revalidatePath(`/admin/sellers/${sellerId}`);
  revalidatePath(`/store/${seller.slug}`);
  return { ok: true };
}
