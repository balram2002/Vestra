'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';

import { requireSeller } from '../auth/session';
import { collections } from '../db/collections';
import { record } from '../services/audit';
import { tags } from '../services/cache-tags';
import { getLiveDesign } from '../services/page-designs';

/**
 * A seller picks their store page's layout, or goes back to the
 * marketplace's (null).
 *
 * Checked against what Marketing allows NOW, on the server: the screen only
 * lists allowed layouts, but a request is not a screen. The seller comes from
 * the session, never from the request.
 */
export async function chooseStoreLayout(input: { variant: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireSeller();
  const parsed = z.object({ variant: z.string().max(40).nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Choose one of the layouts shown.' };

  const design = await getLiveDesign('store');
  const variant = parsed.data.variant;
  if (variant !== null && !(design.sellerChoice ?? []).includes(variant)) {
    return { ok: false, error: 'That layout is no longer offered. Choose another, or the marketplace default.' };
  }

  const sellers = await collections.sellers();
  const seller = await sellers.findOne({ _id: user.sellerId }, { projection: { slug: 1, displayName: 1, storefrontLayout: 1 } });
  if (!seller) return { ok: false, error: 'Store not found.' };
  if ((seller.storefrontLayout ?? null) === variant) return { ok: true };

  await sellers.updateOne({ _id: user.sellerId }, { $set: { storefrontLayout: variant, updatedAt: new Date().toISOString() } });
  await record({
    actor: user,
    action: 'seller.storefront.layout',
    entityType: 'Seller',
    entityId: user.sellerId,
    entityLabel: seller.displayName,
    changes: [{ field: 'storefrontLayout', before: seller.storefrontLayout ?? null, after: variant }],
  });
  // The store page is cached per seller; the shopper should see the new
  // layout on their next visit, not when the entry expires.
  updateTag(tags.seller(seller.slug));
  return { ok: true };
}
