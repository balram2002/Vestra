'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { FULFILLMENT_STATUSES, type FulfillmentStatus } from '@/domain/enums';

import { requireSeller } from '../auth/session';
import { collections, toEntities, toEntity } from '../db/collections';
import * as inventory from '../repositories/inventory';
import { transitionItem } from '../services/orders';
import { approveReturn, rejectReturn, recordQualityCheck } from '../services/returns';

/**
 * Seller console mutations.
 *
 * Every action re-establishes the seller from the SESSION and then verifies
 * that the record being mutated belongs to them. The id in the argument is a
 * claim, never an authorisation — without the ownership check any seller could
 * advance another seller's order by guessing an id.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/* ------------------------------------------------------------ fulfilment */

const advanceSchema = z.object({
  sellerOrderId: z.string().min(1),
  to: z.enum(FULFILLMENT_STATUSES),
});

/**
 * Move a seller order forward.
 *
 * Applies to every line on the parcel, because a parcel is packed and shipped
 * as a unit. Per-line divergence happens through cancellation and returns, not
 * here. Each line still goes through `transitionItem`, so the state machine —
 * not this action — decides whether the move is legal.
 */
export async function advanceSellerOrder(input: {
  sellerOrderId: string;
  to: string;
}): Promise<ActionResult> {
  const user = await requireSeller();

  const parsed = advanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That is not a valid status change.' };

  const sellerOrders = await collections.sellerOrders();
  const sellerOrder = toEntity(
    // Scoped in the query: another seller's order simply does not exist here.
    await sellerOrders.findOne({ _id: parsed.data.sellerOrderId, sellerId: user.sellerId }),
  );
  if (!sellerOrder) return { ok: false, error: 'Order not found.' };

  const itemCol = await collections.orderItems();
  const items = toEntities(await itemCol.find({ sellerOrderId: sellerOrder.id }).toArray());

  let moved = 0;
  let lastError: string | undefined;

  for (const item of items) {
    // Already-cancelled lines are skipped rather than failing the batch: one
    // cancelled item must not block packing the rest of the parcel.
    if (item.status === 'CANCELLED') continue;

    const result = await transitionItem(
      item.id,
      parsed.data.to as FulfillmentStatus,
      'SELLER',
    );
    if (result.ok) moved += 1;
    else lastError = result.error;
  }

  if (moved === 0) {
    return { ok: false, error: lastError ?? 'Nothing on this order could be moved.' };
  }

  const iso = new Date().toISOString();
  const stamps: Record<string, string> = {};
  if (parsed.data.to === 'PACKED') stamps.packedAt = iso;
  if (parsed.data.to === 'SHIPPED') stamps.shippedAt = iso;
  if (parsed.data.to === 'DELIVERED') stamps.deliveredAt = iso;

  await sellerOrders.updateOne(
    { _id: sellerOrder.id },
    { $set: { status: parsed.data.to as FulfillmentStatus, updatedAt: iso, ...stamps } },
  );

  revalidatePath('/seller/orders');
  revalidatePath('/seller');
  return { ok: true };
}

/* -------------------------------------------------------------- inventory */

export async function updateStock(input: {
  variantId: string;
  available: number;
}): Promise<ActionResult> {
  const user = await requireSeller();

  const schema = z.object({
    variantId: z.string().min(1),
    available: z.number().int().min(0).max(100_000),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Enter a whole number of units, zero or more.' };
  }

  // Ownership check before the write: the variant must sit on a product this
  // seller owns.
  const products = await collections.products();
  const owns = await products.countDocuments({
    sellerId: user.sellerId,
    'variants.id': parsed.data.variantId,
  });
  if (owns === 0) return { ok: false, error: 'That product is not yours.' };

  const ok = await inventory.setAvailable(parsed.data.variantId, parsed.data.available);
  if (!ok) return { ok: false, error: 'Could not update that stock count.' };

  revalidatePath('/seller/inventory');
  revalidatePath('/seller');
  return { ok: true };
}

/* ----------------------------------------------------------------- returns */

export async function decideReturn(input: {
  returnId: string;
  decision: 'APPROVE' | 'REJECT';
  reason?: string;
}): Promise<ActionResult> {
  const user = await requireSeller();

  const returns = await collections.returns();
  const request = toEntity(
    await returns.findOne({ _id: input.returnId, sellerId: user.sellerId }),
  );
  if (!request) return { ok: false, error: 'Return not found.' };

  const result =
    input.decision === 'APPROVE'
      ? await approveReturn(request.id, 'SELLER')
      : await rejectReturn(request.id, input.reason ?? 'Did not meet our return policy.', 'SELLER');

  revalidatePath('/seller/returns');
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function submitQualityCheck(input: {
  returnId: string;
  result: 'PASSED' | 'FAILED' | 'PARTIAL';
  note?: string;
}): Promise<ActionResult> {
  const user = await requireSeller();

  const returns = await collections.returns();
  const request = toEntity(
    await returns.findOne({ _id: input.returnId, sellerId: user.sellerId }),
  );
  if (!request) return { ok: false, error: 'Return not found.' };

  const outcome = await recordQualityCheck(
    request.id,
    input.result,
    input.note ?? null,
    user.id,
  );

  revalidatePath('/seller/returns');
  revalidatePath('/seller/inventory');
  return outcome.ok ? { ok: true } : { ok: false, error: outcome.error };
}
