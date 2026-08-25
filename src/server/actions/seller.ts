'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { SHIPPING } from '@/config/business';
import { FULFILLMENT_STATUSES, type FulfillmentStatus } from '@/domain/enums';

import { requireSeller } from '../auth/session';
import { collections, toEntities, toEntity } from '../db/collections';
import * as inventory from '../repositories/inventory';
import { transitionItem } from '../services/orders';
import {
  approveExchange,
  completeExchangeQualityCheck,
  rejectExchange,
} from '../services/exchanges';
import { approveReturn, rejectReturn, recordQualityCheck } from '../services/returns';
import {
  cancelShipment,
  createManifest,
  createShipmentForSellerOrder,
  generateLabel,
  markPickedUp,
  schedulePickup,
  syncTracking,
} from '../services/shipments';

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
 *
 * From PACKED onward the move is NOT a status flip: it is real logistics work.
 * Packing books a parcel and burns an AWB, pickup schedules a courier, and
 * dispatch is a hand-over. Those steps are delegated to the shipment service so
 * that the order's status is a consequence of what the courier did, never an
 * assertion the seller typed in.
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

  if (parsed.data.to === 'PACKED') return packAndLabel(sellerOrder.id);
  if (parsed.data.to === 'READY_FOR_PICKUP') return bookPickup(sellerOrder.id);
  if (parsed.data.to === 'SHIPPED') return handOver(sellerOrder.id);

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
  // PACKED, READY_FOR_PICKUP and SHIPPED returned above: past packing, the
  // courier stamps those, not this action.
  const stamps: Record<string, string> = {};
  if (parsed.data.to === 'DELIVERED') stamps.deliveredAt = iso;

  await sellerOrders.updateOne(
    { _id: sellerOrder.id },
    { $set: { status: parsed.data.to as FulfillmentStatus, updatedAt: iso, ...stamps } },
  );

  revalidatePath('/seller/orders');
  revalidatePath('/seller');
  return { ok: true };
}

/* --------------------------------------------------------------- shipping */

function refreshFulfilmentViews(): void {
  revalidatePath('/seller/orders');
  revalidatePath('/seller/shipments');
  revalidatePath('/seller');
}

/**
 * Pack: book the parcel with the courier and burn an AWB.
 *
 * The item statuses are NOT set here. `generateLabel` records a
 * LABEL_GENERATED scan, and the shipment service maps that onto PACKED for
 * every line in the parcel. One write path for status, whatever triggered it.
 */
async function packAndLabel(sellerOrderId: string): Promise<ActionResult> {
  const shipments = await collections.shipments();
  const existing = toEntity(
    await shipments.findOne({ sellerOrderId, status: { $ne: 'CANCELLED' } }),
  );

  let shipmentId = existing?.id;

  if (!shipmentId) {
    const created = await createShipmentForSellerOrder(sellerOrderId);
    if (!created.ok) return { ok: false, error: created.error };
    shipmentId = created.shipmentId;
  }

  const label = await generateLabel(shipmentId!);
  if (!label.ok) return { ok: false, error: label.error };

  await stampSellerOrder(sellerOrderId, 'PACKED', { packedAt: new Date().toISOString() });
  refreshFulfilmentViews();
  return { ok: true };
}

async function bookPickup(sellerOrderId: string): Promise<ActionResult> {
  const shipments = await collections.shipments();
  const pending = toEntities(
    await shipments.find({ sellerOrderId, status: 'LABEL_GENERATED' }).toArray(),
  );
  if (pending.length === 0) {
    return { ok: false, error: 'Generate a shipping label before booking a pickup.' };
  }

  // Past the cut-off the courier will not come today, so book tomorrow rather
  // than promising a slot that silently rolls over.
  const now = new Date();
  const pickupDate = new Date(now);
  if (now.getHours() >= SHIPPING.dispatchCutoffHour) pickupDate.setDate(pickupDate.getDate() + 1);

  const result = await schedulePickup(
    pending.map((shipment) => shipment.id),
    pickupDate.toISOString(),
  );
  if (!result.ok) return { ok: false, error: result.error };

  await stampSellerOrder(sellerOrderId, 'READY_FOR_PICKUP', {});
  refreshFulfilmentViews();
  return { ok: true };
}

async function handOver(sellerOrderId: string): Promise<ActionResult> {
  const shipments = await collections.shipments();
  const ready = toEntities(
    await shipments
      .find({ sellerOrderId, status: { $in: ['LABEL_GENERATED', 'PICKUP_SCHEDULED'] } })
      .toArray(),
  );
  if (ready.length === 0) {
    return { ok: false, error: 'There is no labelled parcel waiting to be handed over.' };
  }

  for (const shipment of ready) {
    const result = await markPickedUp(shipment.id);
    if (!result.ok) return { ok: false, error: result.error };
  }

  await stampSellerOrder(sellerOrderId, 'SHIPPED', { shippedAt: new Date().toISOString() });
  refreshFulfilmentViews();
  return { ok: true };
}

async function stampSellerOrder(
  sellerOrderId: string,
  status: FulfillmentStatus,
  stamps: Record<string, string>,
): Promise<void> {
  const sellerOrders = await collections.sellerOrders();
  await sellerOrders.updateOne(
    { _id: sellerOrderId },
    { $set: { status, updatedAt: new Date().toISOString(), ...stamps } },
  );
}

/** Re-poll the courier. Offered wherever tracking is shown but looks stale. */
export async function refreshTracking(input: { shipmentId: string }): Promise<ActionResult> {
  const user = await requireSeller();

  const shipments = await collections.shipments();
  const shipment = toEntity(
    await shipments.findOne({ _id: input.shipmentId, sellerId: user.sellerId }),
  );
  if (!shipment) return { ok: false, error: 'Shipment not found.' };

  await syncTracking(shipment.id);
  refreshFulfilmentViews();
  revalidatePath(`/seller/shipments/${shipment.id}`);
  return { ok: true };
}

export async function cancelShipmentAction(input: {
  shipmentId: string;
  reason: string;
}): Promise<ActionResult> {
  const user = await requireSeller();

  const shipments = await collections.shipments();
  const shipment = toEntity(
    await shipments.findOne({ _id: input.shipmentId, sellerId: user.sellerId }),
  );
  if (!shipment) return { ok: false, error: 'Shipment not found.' };

  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, error: 'Give a reason for cancelling the parcel.' };

  const result = await cancelShipment(shipment.id, reason);
  if (!result.ok) return { ok: false, error: result.error };

  refreshFulfilmentViews();
  return { ok: true };
}

/**
 * Close a manifest for the parcels going out on this run. The courier signs one
 * sheet instead of scanning every parcel at the door.
 */
export async function closeManifest(input: { shipmentIds: string[] }): Promise<ActionResult> {
  const user = await requireSeller();

  if (input.shipmentIds.length === 0) {
    return { ok: false, error: 'Select at least one parcel.' };
  }

  const result = await createManifest(user.sellerId, input.shipmentIds);
  if (!result.ok) return { ok: false, error: result.error };

  refreshFulfilmentViews();
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

/* --------------------------------------------------------------- exchanges */

/**
 * Approve or decline a size swap.
 *
 * Approving books the reverse pickup; it does NOT ship the replacement, which
 * waits on the quality check. Declining releases the replacement unit that has
 * been held since the customer asked, so it goes back on sale immediately.
 */
export async function decideExchange(input: {
  exchangeId: string;
  decision: 'APPROVE' | 'REJECT';
  reason?: string;
}): Promise<ActionResult> {
  const user = await requireSeller();

  const exchanges = await collections.exchanges();
  const request = toEntity(
    await exchanges.findOne({ _id: input.exchangeId, sellerId: user.sellerId }),
  );
  if (!request) return { ok: false, error: 'Exchange not found.' };

  const result =
    input.decision === 'APPROVE'
      ? await approveExchange(request.id, 'SELLER')
      : await rejectExchange(
          request.id,
          input.reason?.trim() || 'Did not meet our exchange policy.',
          'SELLER',
        );

  revalidatePath('/seller/returns');
  revalidatePath('/seller/shipments');
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/**
 * Record the quality check on a returned item that is being exchanged.
 *
 * A pass restocks the returned unit and dispatches the replacement in one step,
 * because from the seller's side those are the same physical action.
 */
export async function submitExchangeQualityCheck(input: {
  exchangeId: string;
  result: 'PASSED' | 'FAILED' | 'PARTIAL';
  note?: string;
}): Promise<ActionResult> {
  const user = await requireSeller();

  const exchanges = await collections.exchanges();
  const request = toEntity(
    await exchanges.findOne({ _id: input.exchangeId, sellerId: user.sellerId }),
  );
  if (!request) return { ok: false, error: 'Exchange not found.' };

  const outcome = await completeExchangeQualityCheck(
    request.id,
    input.result,
    input.note ?? null,
    user.id,
  );

  revalidatePath('/seller/returns');
  revalidatePath('/seller/shipments');
  revalidatePath('/seller/inventory');
  return outcome.ok ? { ok: true } : { ok: false, error: outcome.error };
}
