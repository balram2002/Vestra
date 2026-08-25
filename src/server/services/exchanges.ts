import 'server-only';

import { RETURNS } from '@/config/business';
import { RETURN_REASON_LABEL, type QcResult, type ReturnReason } from '@/domain/enums';
import type { ExchangeRequest, OrderEvent, Product } from '@/domain/types';
import { entityId } from '@/lib/ids';

import { collections, toEntities, toEntity } from '../db/collections';
import { nextExchangeNumber } from '../db/sequences';
import * as inventory from '../repositories/inventory';
import { notifyQuietly } from './notifications';
import { getOrder, recomputeOrderStatus } from './orders';
import { createReturnPickup, createReplacementShipment } from './shipments';

/**
 * Exchanges.
 *
 * A size swap, which is the overwhelmingly common case in fashion. It is NOT a
 * return followed by a fresh order, and modelling it that way is what makes
 * most implementations feel broken: the customer would lose their price, their
 * coupon and their place in the queue.
 *
 * Four rules shape this:
 *
 *  1. THE REPLACEMENT IS RESERVED AT REQUEST TIME. An exchange promises a
 *     specific size. Reserving it immediately is what makes that promise real —
 *     otherwise the last M sells to someone else while the customer's parcel is
 *     still in the courier's van, and the exchange fails after they have
 *     already given the item back.
 *
 *  2. THE PRICE IS FROZEN. The replacement inherits the original line's price,
 *     not today's. A customer swapping a size must never be charged more
 *     because the product went up, nor refunded because it went down.
 *
 *  3. ONLY EQUAL-PRICED VARIANTS. Same style, different size or colour, same
 *     price. A variant that costs more would mean collecting money mid-flow,
 *     and one that costs less would mean a partial refund; both are returns
 *     wearing an exchange costume, and the customer is told to do exactly that.
 *
 *  4. THE REPLACEMENT SHIPS ONLY AFTER QUALITY CHECK. Shipping on request
 *     would let someone keep both items. The reverse parcel has to arrive and
 *     pass inspection first.
 */

/* -------------------------------------------------------------- requesting */

export interface ExchangeRequestInput {
  orderId: string;
  orderItemId: string;
  /** The variant the customer wants instead. */
  toVariantId: string;
  quantity: number;
  reason: ReturnReason;
  note?: string;
}

export type ExchangeOutcome =
  | { ok: true; exchangeId: string; exchangeNumber: string }
  | { ok: false; error: string };

export async function requestExchange(
  userId: string,
  input: ExchangeRequestInput,
): Promise<ExchangeOutcome> {
  const detail = await getOrder(input.orderId, userId);
  if (!detail) return { ok: false, error: 'Order not found.' };

  const item = detail.items.find((i) => i.id === input.orderItemId);
  if (!item) return { ok: false, error: 'That item is not on this order.' };

  /* -- eligibility ------------------------------------------------------- */

  if (item.status !== 'DELIVERED') {
    return { ok: false, error: `"${item.productTitle}" has not been delivered yet.` };
  }
  if (!item.exchangeable) {
    return {
      ok: false,
      error: `"${item.productTitle}" cannot be exchanged. You can return it instead.`,
    };
  }
  if (item.exchangeId) {
    return { ok: false, error: 'An exchange is already in progress for this item.' };
  }
  if (item.returnId) {
    return { ok: false, error: 'A return is already in progress for this item.' };
  }
  if (item.returnEligibleUntil && Date.parse(item.returnEligibleUntil) < Date.now()) {
    return {
      ok: false,
      error: `The ${item.returnWindowDays}-day exchange window for "${item.productTitle}" has closed.`,
    };
  }

  const quantity = Math.min(
    Math.max(1, input.quantity),
    item.quantity - item.cancelledQuantity - item.returnedQuantity,
  );
  if (quantity < 1) return { ok: false, error: 'There is nothing left on this line to exchange.' };

  /* -- the replacement --------------------------------------------------- */

  const products = await collections.products();
  const product = toEntity(
    // Scoped to the SAME product: an exchange is a variant swap, not a
    // different purchase.
    await products.findOne({ _id: item.productId }),
  ) as Product | null;
  if (!product) return { ok: false, error: 'That product is no longer available.' };

  const target = product.variants.find((v) => v.id === input.toVariantId);
  const source = product.variants.find((v) => v.id === item.variantId);
  if (!target) return { ok: false, error: 'That size is not available for this product.' };
  if (target.id === item.variantId) {
    return { ok: false, error: 'Choose a different size or colour to exchange for.' };
  }
  if (!target.isActive || product.status !== 'PUBLISHED') {
    return { ok: false, error: 'That size is no longer being sold.' };
  }

  // Rule 3: equal-priced only. Said plainly, with the alternative offered.
  if (target.sellingPrice !== (source?.sellingPrice ?? item.unitSellingPrice)) {
    return {
      ok: false,
      error:
        'That size is priced differently, so it cannot be a straight swap. Return this item and place a new order instead.',
    };
  }

  /* -- reserve the replacement ------------------------------------------- */

  const reserved = await inventory.reserve(target.id, quantity);
  if (!reserved) {
    return {
      ok: false,
      error: `Size ${target.size} is out of stock. Try another size, or return this item instead.`,
    };
  }

  /* -- record ------------------------------------------------------------ */

  const iso = new Date().toISOString();
  const exchangeId = entityId('exc');
  const exchangeNumber = await nextExchangeNumber(new Date());

  const request: ExchangeRequest = {
    id: exchangeId,
    exchangeNumber,
    orderId: detail.order.id,
    orderNumber: detail.order.orderNumber,
    sellerOrderId: item.sellerOrderId,
    sellerId: item.sellerId,
    userId,
    orderItemId: item.id,
    fromVariantId: item.variantId,
    fromSize: item.size,
    fromColorLabel: item.colorLabel,
    toVariantId: target.id,
    toSize: target.size,
    toColorLabel: target.colorLabel,
    quantity,
    status: 'EXCHANGE_REQUESTED',
    reason: input.reason,
    reasonNote: input.note ?? null,
    // Always zero by rule 3, but kept on the record so finance can see it was
    // considered rather than ignored.
    priceDifference: 0,
    pickupAddress: detail.order.shippingAddress,
    returnShipmentId: null,
    forwardShipmentId: null,
    qcResult: null,
    rejectionReason: null,
    requestedAt: iso,
    approvedAt: null,
    completedAt: null,
    timeline: [
      event('EXCHANGE_REQUESTED', 'Exchange requested', 'CUSTOMER', iso,
        `${item.size} to ${target.size}. ${RETURN_REASON_LABEL[input.reason]}`),
    ],
    createdAt: iso,
    updatedAt: iso,
  };

  const exchanges = await collections.exchanges();
  await exchanges.insertOne({ ...request, _id: request.id });

  const orderItems = await collections.orderItems();
  await orderItems.updateOne(
    { _id: item.id },
    {
      $set: { status: 'EXCHANGE_REQUESTED', exchangeId, updatedAt: iso },
      $push: { timeline: event('EXCHANGE_REQUESTED', 'Exchange requested', 'CUSTOMER', iso) },
    },
  );

  await recomputeOrderStatus(detail.order.id);

  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: item.sellerId }));
  if (seller) {
    const owner = await (await collections.users()).findOne({ _id: seller.ownerUserId });
    if (owner) {
      notifyQuietly({
        userId: owner._id,
        category: 'RETURN',
        title: `Exchange requested on ${detail.order.orderNumber}`,
        body: `"${item.productTitle}" — size ${item.size} to ${target.size}.`,
        href: '/seller/returns',
        entityType: 'exchange',
        entityId: exchangeId,
      });
    }
  }

  return { ok: true, exchangeId, exchangeNumber };
}

/* --------------------------------------------------------------- decisions */

/**
 * Approve: book the reverse pickup.
 *
 * The replacement stays reserved and does NOT ship yet — rule 4. What the
 * customer gets now is a courier coming to collect.
 */
export async function approveExchange(
  exchangeId: string,
  actor: OrderEvent['actor'],
): Promise<{ ok: boolean; error?: string }> {
  const exchanges = await collections.exchanges();
  const request = toEntity(await exchanges.findOne({ _id: exchangeId }));
  if (!request) return { ok: false, error: 'Exchange not found.' };
  if (request.status !== 'EXCHANGE_REQUESTED') {
    return { ok: false, error: 'This exchange has already been decided.' };
  }

  const pickup = await createReturnPickup({
    orderId: request.orderId,
    sellerOrderId: request.sellerOrderId,
    sellerId: request.sellerId,
    items: [{ orderItemId: request.orderItemId, quantity: request.quantity }],
    pickupAddress: request.pickupAddress,
    reference: request.exchangeNumber,
  });

  const iso = new Date().toISOString();

  await exchanges.updateOne(
    { _id: exchangeId },
    {
      $set: {
        status: 'EXCHANGE_APPROVED',
        approvedAt: iso,
        returnShipmentId: pickup.shipmentId ?? null,
        updatedAt: iso,
      },
      $push: {
        timeline: event(
          'EXCHANGE_APPROVED',
          'Exchange approved',
          actor,
          iso,
          pickup.ok ? 'Reverse pickup booked.' : 'Approved; pickup will be booked shortly.',
        ),
      },
    },
  );

  await moveItem(request.orderItemId, 'EXCHANGE_APPROVED', actor, iso);
  await recomputeOrderStatus(request.orderId);

  if (request.userId) {
    notifyQuietly({
      userId: request.userId,
      category: 'RETURN',
      title: `Exchange approved for ${request.orderNumber}`,
      body: `We will collect size ${request.fromSize} and send you size ${request.toSize}.`,
      href: `/orders/${request.orderId}`,
      entityType: 'exchange',
      entityId: exchangeId,
    });
  }

  return { ok: true };
}

export async function rejectExchange(
  exchangeId: string,
  reason: string,
  actor: OrderEvent['actor'],
): Promise<{ ok: boolean; error?: string }> {
  const exchanges = await collections.exchanges();
  const request = toEntity(await exchanges.findOne({ _id: exchangeId }));
  if (!request) return { ok: false, error: 'Exchange not found.' };
  if (request.status === 'EXCHANGE_DELIVERED' || request.status === 'EXCHANGE_REJECTED') {
    return { ok: false, error: 'This exchange is already closed.' };
  }

  // The replacement was held from the moment the customer asked. Give it back
  // the instant the exchange dies, or that size stays invisible to every other
  // shopper for no reason.
  await inventory.release(request.toVariantId, request.quantity);

  const iso = new Date().toISOString();
  await exchanges.updateOne(
    { _id: exchangeId },
    {
      $set: { status: 'EXCHANGE_REJECTED', rejectionReason: reason, completedAt: iso, updatedAt: iso },
      $push: { timeline: event('EXCHANGE_REJECTED', 'Exchange rejected', actor, iso, reason) },
    },
  );

  // The customer keeps what they have, so the line goes back to delivered.
  await moveItem(request.orderItemId, 'DELIVERED', actor, iso, reason);
  const orderItems = await collections.orderItems();
  await orderItems.updateOne({ _id: request.orderItemId }, { $set: { exchangeId: null } });

  await recomputeOrderStatus(request.orderId);

  if (request.userId) {
    notifyQuietly({
      userId: request.userId,
      category: 'RETURN',
      title: `Exchange declined for ${request.orderNumber}`,
      body: reason,
      href: `/orders/${request.orderId}`,
      entityType: 'exchange',
      entityId: exchangeId,
    });
  }

  return { ok: true };
}

/* ------------------------------------------------------------ quality check */

/**
 * The seller has the returned item in hand.
 *
 * A pass ships the replacement and puts the returned unit back on sale. A fail
 * writes the unit off, releases the held replacement and closes the exchange —
 * which becomes a support conversation rather than an automatic decision, the
 * same way a failed return does.
 */
export async function completeExchangeQualityCheck(
  exchangeId: string,
  result: QcResult,
  note: string | null,
  byUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const exchanges = await collections.exchanges();
  const request = toEntity(await exchanges.findOne({ _id: exchangeId }));
  if (!request) return { ok: false, error: 'Exchange not found.' };
  if (request.status !== 'EXCHANGE_APPROVED') {
    return { ok: false, error: 'This exchange is not waiting on a quality check.' };
  }

  const iso = new Date().toISOString();

  if (result === 'FAILED') {
    await inventory.writeOff(request.fromVariantId, request.quantity);
    await inventory.release(request.toVariantId, request.quantity);

    await exchanges.updateOne(
      { _id: exchangeId },
      {
        $set: {
          status: 'EXCHANGE_REJECTED',
          qcResult: result,
          rejectionReason: note ?? 'The returned item did not pass our quality check.',
          completedAt: iso,
          updatedAt: iso,
        },
        $push: {
          timeline: event('EXCHANGE_REJECTED', 'Quality check failed', 'SELLER', iso, note),
        },
      },
    );

    await moveItem(request.orderItemId, 'DELIVERED', 'SELLER', iso, note ?? undefined);
    await recomputeOrderStatus(request.orderId);

    if (request.userId) {
      notifyQuietly({
        userId: request.userId,
        category: 'RETURN',
        title: `Exchange could not be completed for ${request.orderNumber}`,
        body: note ?? 'The item we received did not pass our quality check. Support will be in touch.',
        href: `/orders/${request.orderId}`,
        entityType: 'exchange',
        entityId: exchangeId,
      });
    }

    return { ok: true };
  }

  // Passed: the returned unit is sellable again, and the replacement goes out.
  await inventory.restock(request.fromVariantId, request.quantity);

  const shipment = await createReplacementShipment({
    exchangeId: request.id,
    orderId: request.orderId,
    sellerOrderId: request.sellerOrderId,
    sellerId: request.sellerId,
    orderItemId: request.orderItemId,
    variantId: request.toVariantId,
    quantity: request.quantity,
    reference: request.exchangeNumber,
  });

  if (!shipment.ok) {
    // Stock stays reserved: the replacement is still owed, and releasing it
    // here would let the unit sell to somebody else while we retry.
    return { ok: false, error: shipment.error ?? 'Could not book the replacement parcel.' };
  }

  // The held unit is now dispatched rather than merely promised.
  await inventory.commitSale(request.toVariantId, request.quantity);

  await exchanges.updateOne(
    { _id: exchangeId },
    {
      $set: {
        status: 'EXCHANGE_SHIPPED',
        qcResult: result,
        forwardShipmentId: shipment.shipmentId ?? null,
        updatedAt: iso,
      },
      $push: {
        timeline: event(
          'EXCHANGE_SHIPPED',
          'Replacement shipped',
          'SELLER',
          iso,
          `Size ${request.toSize} is on its way.`,
        ),
      },
    },
  );

  await moveItem(request.orderItemId, 'EXCHANGE_SHIPPED', 'SELLER', iso);
  await recomputeOrderStatus(request.orderId);

  if (request.userId) {
    notifyQuietly({
      userId: request.userId,
      category: 'SHIPPING',
      title: `Your replacement is on the way`,
      body: `Size ${request.toSize} has been dispatched for order ${request.orderNumber}.`,
      href: `/orders/${request.orderId}`,
      entityType: 'exchange',
      entityId: exchangeId,
    });
  }

  void byUserId;
  return { ok: true };
}

/**
 * Called when the replacement parcel is delivered.
 *
 * Invoked from the shipment layer rather than by a person, because the courier
 * is what knows the replacement arrived.
 */
export async function completeExchange(exchangeId: string): Promise<void> {
  const exchanges = await collections.exchanges();
  const request = toEntity(await exchanges.findOne({ _id: exchangeId }));
  if (!request || request.status !== 'EXCHANGE_SHIPPED') return;

  const iso = new Date().toISOString();
  await exchanges.updateOne(
    { _id: exchangeId },
    {
      $set: { status: 'EXCHANGE_DELIVERED', completedAt: iso, updatedAt: iso },
      $push: { timeline: event('EXCHANGE_DELIVERED', 'Exchange complete', 'COURIER', iso) },
    },
  );

  await moveItem(request.orderItemId, 'EXCHANGE_DELIVERED', 'COURIER', iso);
  await recomputeOrderStatus(request.orderId);
}

/* ------------------------------------------------------------------ reads */

export async function listExchanges(userId: string): Promise<ExchangeRequest[]> {
  const exchanges = await collections.exchanges();
  return toEntities(await exchanges.find({ userId }).sort({ requestedAt: -1 }).toArray());
}

export async function listSellerExchanges(sellerId: string, limit = 60): Promise<ExchangeRequest[]> {
  const exchanges = await collections.exchanges();
  return toEntities(
    await exchanges.find({ sellerId }).sort({ requestedAt: -1 }).limit(limit).toArray(),
  );
}

export async function getExchange(exchangeId: string): Promise<ExchangeRequest | null> {
  const exchanges = await collections.exchanges();
  return toEntity(await exchanges.findOne({ _id: exchangeId }));
}

/**
 * Sizes a shopper can actually swap into: same product, different variant,
 * same price, in stock. Computed on the server so the picker cannot offer a
 * choice the request would then refuse.
 */
export async function exchangeOptionsFor(
  orderItemId: string,
  userId: string,
): Promise<Array<{ variantId: string; size: string; colorLabel: string; available: number }>> {
  const orderItems = await collections.orderItems();
  const item = toEntity(await orderItems.findOne({ _id: orderItemId }));
  if (!item) return [];

  const orders = await collections.orders();
  const owns = await orders.countDocuments({ _id: item.orderId, userId });
  if (owns === 0) return [];

  const products = await collections.products();
  const product = toEntity(await products.findOne({ _id: item.productId })) as Product | null;
  if (!product || product.status !== 'PUBLISHED') return [];

  const source = product.variants.find((v) => v.id === item.variantId);
  const price = source?.sellingPrice ?? item.unitSellingPrice;

  return product.variants
    .filter(
      (variant) =>
        variant.id !== item.variantId &&
        variant.isActive &&
        variant.sellingPrice === price &&
        variant.inventory.available > 0,
    )
    .map((variant) => ({
      variantId: variant.id,
      size: variant.size,
      colorLabel: variant.colorLabel,
      available: variant.inventory.available,
    }));
}

/* --------------------------------------------------------------- helpers */

function event(
  status: ExchangeRequest['status'],
  title: string,
  actor: OrderEvent['actor'],
  occurredAt: string,
  description?: string | null,
): OrderEvent {
  return {
    id: entityId('evt'),
    status,
    title,
    description: description ?? null,
    location: null,
    actor,
    actorName: null,
    occurredAt,
  };
}

async function moveItem(
  orderItemId: string,
  status: ExchangeRequest['status'] | 'DELIVERED',
  actor: OrderEvent['actor'],
  iso: string,
  description?: string,
): Promise<void> {
  const orderItems = await collections.orderItems();
  await orderItems.updateOne(
    { _id: orderItemId },
    {
      $set: { status, updatedAt: iso },
      $push: {
        timeline: event(
          status as ExchangeRequest['status'],
          statusTitle(status),
          actor,
          iso,
          description ?? null,
        ),
      },
    },
  );
}

function statusTitle(status: string): string {
  switch (status) {
    case 'EXCHANGE_APPROVED':
      return 'Exchange approved';
    case 'EXCHANGE_SHIPPED':
      return 'Replacement shipped';
    case 'EXCHANGE_DELIVERED':
      return 'Exchange complete';
    case 'EXCHANGE_REJECTED':
      return 'Exchange rejected';
    case 'DELIVERED':
      return 'Item stays with you';
    default:
      return 'Updated';
  }
}

/** Exposed so the exchange window can be shown before a request is made. */
export function exchangeWindowDays(itemWindowDays: number | null): number {
  return itemWindowDays ?? RETURNS.defaultExchangeWindowDays;
}
