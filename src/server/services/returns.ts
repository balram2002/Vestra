import 'server-only';

import { RETURNS, SHIPPING } from '@/config/business';
import {
  FULFILLMENT_STATUS_META,
  RETURN_REASON_LABEL,
  SELLER_FAULT_REASONS,
  type QcResult,
  type ReturnReason,
} from '@/domain/enums';
import type { OrderEvent, Refund, ReturnItem, ReturnRequest } from '@/domain/types';
import { entityId } from '@/lib/ids';

import { collections, toEntities, toEntity } from '../db/collections';
import { nextReturnNumber } from '../db/sequences';
import { gateway } from '../payments';
import * as inventory from '../repositories/inventory';
import { NOTIFY, notifyQuietly } from './notifications';
import { getOrder, recomputeOrderStatus } from './orders';

/**
 * Returns, exchanges and refunds.
 *
 * Three rules shape everything here:
 *
 *  1. LIABILITY DECIDES WHO PAYS. A return because the item arrived damaged is
 *     the seller's cost; a return because the customer changed their mind is
 *     theirs. That single flag drives the reverse-pickup fee, the refund total
 *     and how the seller is settled — so it is computed once, from the reason,
 *     and never entered by hand.
 *
 *  2. STOCK ONLY COMES BACK AFTER QUALITY CHECK. Restocking on request would
 *     let a customer resell a unit that never came back, or one that came back
 *     unsaleable. A failed check writes the unit off instead.
 *
 *  3. REFUNDS ARE DERIVED FROM THE ORDER ITEM, not recomputed from the current
 *     catalogue. The line froze its own price, discount share and tax at
 *     purchase, so a partial return refunds exactly what that line contributed.
 */

/* ------------------------------------------------------------- requesting */

export interface ReturnRequestInput {
  orderId: string;
  items: Array<{ orderItemId: string; quantity: number }>;
  reason: ReturnReason;
  note?: string;
}

export async function requestReturn(
  userId: string,
  input: ReturnRequestInput,
): Promise<{ ok: boolean; error?: string; returnId?: string; returnNumber?: string }> {
  const detail = await getOrder(input.orderId, userId);
  if (!detail) return { ok: false, error: 'Order not found.' };

  const selected = detail.items.filter((item) =>
    input.items.some((i) => i.orderItemId === item.id),
  );
  if (selected.length === 0) return { ok: false, error: 'Nothing selected to return.' };

  // Every line must be delivered, returnable, and inside its own window — the
  // window is per item because sellers set their own policy.
  const now = Date.now();
  for (const item of selected) {
    if (item.status !== 'DELIVERED') {
      return { ok: false, error: `"${item.productTitle}" has not been delivered yet.` };
    }
    if (!item.returnable) {
      return { ok: false, error: `"${item.productTitle}" cannot be returned.` };
    }
    if (item.returnEligibleUntil && Date.parse(item.returnEligibleUntil) < now) {
      return {
        ok: false,
        error: `The ${item.returnWindowDays}-day return window for "${item.productTitle}" has closed.`,
      };
    }
  }

  // One request per seller: each seller runs their own pickup and quality check.
  const bySeller = new Map<string, typeof selected>();
  for (const item of selected) {
    bySeller.set(item.sellerOrderId, [...(bySeller.get(item.sellerOrderId) ?? []), item]);
  }

  const sellerFault = SELLER_FAULT_REASONS.includes(input.reason);
  const liability: ReturnRequest['liability'] = sellerFault ? 'SELLER' : 'CUSTOMER';
  const iso = new Date().toISOString();

  const returns = await collections.returns();
  const orderItems = await collections.orderItems();
  let firstId = '';
  let firstNumber = '';

  for (const [sellerOrderId, group] of bySeller) {
    const returnId = entityId('ret');
    const returnNumber = await nextReturnNumber(new Date());
    if (!firstId) {
      firstId = returnId;
      firstNumber = returnNumber;
    }

    const returnItems: ReturnItem[] = group.map((item) => {
      const requested = input.items.find((i) => i.orderItemId === item.id)!;
      const quantity = Math.min(requested.quantity, item.quantity - item.returnedQuantity);
      // The line's own frozen total, apportioned to the units coming back.
      const refundableAmount = Math.round((item.lineTotal / item.quantity) * quantity);

      return {
        orderItemId: item.id,
        variantId: item.variantId,
        productTitle: item.productTitle,
        imageUrl: item.imageUrl,
        size: item.size,
        colorLabel: item.colorLabel,
        quantity,
        refundableAmount,
      };
    });

    const goodsTotal = returnItems.reduce((sum, i) => sum + i.refundableAmount, 0);
    // The customer absorbs reverse logistics only when the fault is theirs.
    const reverseFee = sellerFault ? 0 : SHIPPING.reversePickupFee;

    const request: ReturnRequest = {
      id: returnId,
      returnNumber,
      orderId: detail.order.id,
      orderNumber: detail.order.orderNumber,
      sellerOrderId,
      sellerId: group[0]!.sellerId,
      userId,
      items: returnItems,
      status: 'RETURN_REQUESTED',
      reason: input.reason,
      reasonNote: input.note ?? null,
      attachments: [],
      pickupAddress: detail.order.shippingAddress,
      pickupSlot: null,
      shipmentId: null,
      qcResult: null,
      qcNote: null,
      qcImages: [],
      qcByUserId: null,
      refundId: null,
      refundMode: detail.order.paymentMethod === 'COD' ? 'BANK_TRANSFER' : 'ORIGINAL',
      refundAmount: Math.max(0, goodsTotal - reverseFee),
      liability,
      reverseShippingFee: reverseFee,
      settlementId: null,
      rejectionReason: null,
      requestedAt: iso,
      approvedAt: null,
      pickedUpAt: null,
      receivedAt: null,
      closedAt: null,
      timeline: [
        event(
          'RETURN_REQUESTED',
          'Return requested',
          'CUSTOMER',
          iso,
          RETURN_REASON_LABEL[input.reason],
        ),
      ],
      createdAt: iso,
      updatedAt: iso,
    };

    await returns.insertOne({ ...request, _id: request.id });

    for (const item of returnItems) {
      await orderItems.updateOne(
        { _id: item.orderItemId },
        {
          $set: { status: 'RETURN_REQUESTED', returnId, updatedAt: iso },
          $push: {
            timeline: event('RETURN_REQUESTED', 'Return requested', 'CUSTOMER', iso),
          },
        },
      );
    }
  }

  await recomputeOrderStatus(detail.order.id);
  return { ok: true, returnId: firstId, returnNumber: firstNumber };
}

/* -------------------------------------------------------------- decisions */

export async function approveReturn(
  returnId: string,
  actor: OrderEvent['actor'] = 'SELLER',
): Promise<{ ok: boolean; error?: string }> {
  const returns = await collections.returns();
  const request = toEntity(await returns.findOne({ _id: returnId }));
  if (!request) return { ok: false, error: 'Return not found.' };
  if (request.status !== 'RETURN_REQUESTED') {
    return { ok: false, error: 'This return has already been decided.' };
  }

  const iso = new Date().toISOString();

  await returns.updateOne(
    { _id: returnId },
    {
      $set: {
        status: 'RETURN_APPROVED',
        approvedAt: iso,
        pickupSlot: {
          from: iso,
          to: new Date(Date.now() + RETURNS.pickupWindowDays * 86_400_000).toISOString(),
        },
        updatedAt: iso,
      },
      $push: {
        timeline: event(
          'RETURN_APPROVED',
          'Return approved',
          actor,
          iso,
          'A courier will collect the item from your address.',
        ),
      },
    },
  );

  await setItemStatus(request, 'RETURN_APPROVED', actor);

  if (request.userId) {
    void NOTIFY.returnApproved(request.userId, request.returnNumber, request.orderId);
  }
  return { ok: true };
}

export async function rejectReturn(
  returnId: string,
  reason: string,
  actor: OrderEvent['actor'] = 'SELLER',
): Promise<{ ok: boolean; error?: string }> {
  const returns = await collections.returns();
  const request = toEntity(await returns.findOne({ _id: returnId }));
  if (!request) return { ok: false, error: 'Return not found.' };

  const iso = new Date().toISOString();

  await returns.updateOne(
    { _id: returnId },
    {
      $set: { status: 'RETURN_REJECTED', rejectionReason: reason, closedAt: iso, updatedAt: iso },
      $push: { timeline: event('RETURN_REJECTED', 'Return rejected', actor, iso, reason) },
    },
  );

  // The item goes back to DELIVERED: it is still the customer's, and they may
  // dispute or re-raise within the window.
  await setItemStatus(request, 'DELIVERED', actor, reason);
  return { ok: true };
}

/**
 * Record the outcome of the seller's quality check.
 *
 * This is where stock and money actually move, and the two outcomes are
 * genuinely different: a pass puts the unit back on sale and refunds the
 * customer; a fail writes the unit off and refunds nothing automatically —
 * that becomes a dispute for support, not an automatic credit.
 */
export async function recordQualityCheck(
  returnId: string,
  result: QcResult,
  note: string | null,
  actorUserId: string,
): Promise<{ ok: boolean; error?: string; refundId?: string }> {
  const returns = await collections.returns();
  const request = toEntity(await returns.findOne({ _id: returnId }));
  if (!request) return { ok: false, error: 'Return not found.' };
  if (request.qcResult) return { ok: false, error: 'This return has already been checked.' };

  const iso = new Date().toISOString();

  await returns.updateOne(
    { _id: returnId },
    {
      $set: {
        qcResult: result,
        qcNote: note,
        qcByUserId: actorUserId,
        receivedAt: iso,
        status: result === 'FAILED' ? 'RETURN_REJECTED' : 'RETURNED',
        updatedAt: iso,
      },
      $push: {
        timeline: event(
          result === 'FAILED' ? 'RETURN_REJECTED' : 'RETURNED',
          result === 'FAILED' ? 'Failed quality check' : 'Passed quality check',
          'SELLER',
          iso,
          note,
        ),
      },
    },
  );

  if (result === 'FAILED') {
    // Unsaleable: written off rather than restocked, so it can never be sold on.
    for (const item of request.items) {
      await inventory.writeOff(item.variantId, item.quantity);
    }
    await setItemStatus(request, 'RETURN_REJECTED', 'SELLER', note ?? undefined);
    return { ok: true };
  }

  for (const item of request.items) {
    await inventory.restock(item.variantId, item.quantity);
  }
  await setItemStatus(request, 'RETURNED', 'SELLER');

  /*
   * Raise a credit note against the original tax invoice.
   *
   * A return does not amend the invoice — under GST it cannot. The credit note
   * is the counter-document, and without it the seller's outward supply stays
   * overstated by the value of goods that came back.
   */
  const { issueCreditNote } = await import('./invoices');
  await issueCreditNote(
    request.sellerOrderId,
    request.items.map((item) => ({ orderItemId: item.orderItemId, quantity: item.quantity })),
    `Return ${request.returnNumber}: ${RETURN_REASON_LABEL[request.reason]}`,
  );

  const refund = await initiateRefund(request, actorUserId);
  return { ok: true, refundId: refund?.id };
}

/* ---------------------------------------------------------------- refunds */

/**
 * Raise and submit a refund.
 *
 * The provider is asked, but the result is not assumed: `PROCESSING` is a
 * legitimate answer and the refund stays open until a webhook or a finance
 * reconciliation closes it.
 */
export async function initiateRefund(
  request: ReturnRequest,
  actorUserId: string | null,
): Promise<Refund | null> {
  const [orders, payments, refunds] = await Promise.all([
    collections.orders(),
    collections.payments(),
    collections.refunds(),
  ]);

  const order = toEntity(await orders.findOne({ _id: request.orderId }));
  if (!order) return null;

  const payment = order.paymentId
    ? toEntity(await payments.findOne({ _id: order.paymentId }))
    : null;

  const iso = new Date().toISOString();
  const refundId = entityId('rfd');
  const days = order.paymentMethod === 'COD' ? RETURNS.refundSlaDays.cod : RETURNS.refundSlaDays.prepaid;

  const refund: Refund = {
    id: refundId,
    refundNumber: `RF${request.returnNumber.slice(2)}`,
    orderId: request.orderId,
    orderNumber: request.orderNumber,
    sellerOrderId: request.sellerOrderId,
    paymentId: payment?.id ?? null,
    userId: request.userId,
    items: request.items.map((item) => ({
      orderItemId: item.orderItemId,
      quantity: item.quantity,
      amount: item.refundableAmount,
    })),
    amount: request.refundAmount,
    shippingRefund: 0,
    mode: request.refundMode,
    status: 'PENDING',
    reason: RETURN_REASON_LABEL[request.reason],
    liability: request.liability === 'CUSTOMER' ? 'PLATFORM' : 'SELLER',
    providerRefundId: null,
    failureReason: null,
    expectedBy: new Date(Date.now() + days * 86_400_000).toISOString(),
    initiatedAt: iso,
    completedAt: null,
    initiatedByUserId: actorUserId,
    timeline: [event('REFUND_INITIATED', 'Refund initiated', 'SYSTEM', iso)],
    createdAt: iso,
    updatedAt: iso,
  };

  await refunds.insertOne({ ...refund, _id: refund.id });
  await (await collections.returns()).updateOne(
    { _id: request.id },
    { $set: { refundId, status: 'REFUND_INITIATED', updatedAt: iso } },
  );

  // COD has no captured payment to reverse — finance pays out by bank transfer.
  if (payment?.providerPaymentId) {
    const result = await gateway().refund({
      providerPaymentId: payment.providerPaymentId,
      amount: refund.amount,
      reason: refund.reason,
      idempotencyKey: refundId,
    });

    await applyRefundResult(refundId, result);
  }

  for (const item of request.items) {
    await (await collections.orderItems()).updateOne(
      { _id: item.orderItemId },
      {
        $set: { status: 'REFUND_INITIATED', updatedAt: iso },
        $push: { timeline: event('REFUND_INITIATED', 'Refund initiated', 'SYSTEM', iso) },
      },
    );
  }

  await recomputeOrderStatus(request.orderId);
  return refund;
}

/**
 * A refund raised by a human, not by a return.
 *
 * Support and finance need this for the cases the return flow cannot express:
 * a parcel the courier lost, a goodwill gesture after a late delivery, a
 * duplicate charge. It is deliberately NOT tied to a return request — inventing
 * a fake return to move money would corrupt the return metrics every seller is
 * scored on.
 *
 * Two guards make it safe to expose in a console:
 *
 *  1. The amount is CAPPED at what the order actually contributed, minus
 *     whatever has already been refunded. A typo cannot refund more than was
 *     paid, and repeated clicks cannot stack past the total.
 *  2. It records who did it and why, and the reason is not optional.
 */
export async function issueManualRefund(input: {
  orderId: string;
  /** Paise. Capped at what remains refundable on the order. */
  amount: number;
  reason: string;
  actorUserId: string;
  liability?: Refund['liability'];
}): Promise<{ ok: boolean; error?: string; refundId?: string; amount?: number }> {
  const reason = input.reason.trim();
  if (reason.length < 4) return { ok: false, error: 'Give a reason for this refund.' };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'Enter an amount greater than zero.' };
  }

  const [orders, payments, refunds] = await Promise.all([
    collections.orders(),
    collections.payments(),
    collections.refunds(),
  ]);

  const order = toEntity(await orders.findOne({ _id: input.orderId }));
  if (!order) return { ok: false, error: 'Order not found.' };

  // Everything already refunded against this order, whatever raised it.
  const existing = toEntities(await refunds.find({ orderId: order.id }).toArray());
  const alreadyRefunded = existing
    .filter((refund) => refund.status !== 'FAILED')
    .reduce((sum, refund) => sum + refund.amount, 0);

  const remaining = Math.max(0, order.pricing.payable - alreadyRefunded);
  if (remaining === 0) {
    return { ok: false, error: 'This order has already been refunded in full.' };
  }

  const amount = Math.min(Math.round(input.amount), remaining);

  const payment = order.paymentId
    ? toEntity(await payments.findOne({ _id: order.paymentId }))
    : null;

  const iso = new Date().toISOString();
  const refundId = entityId('rfd');
  const days =
    order.paymentMethod === 'COD' ? RETURNS.refundSlaDays.cod : RETURNS.refundSlaDays.prepaid;

  const refund: Refund = {
    id: refundId,
    refundNumber: `RF${order.orderNumber.slice(2)}-M${existing.length + 1}`,
    orderId: order.id,
    orderNumber: order.orderNumber,
    sellerOrderId: null,
    paymentId: payment?.id ?? null,
    userId: order.userId,
    // Not attributed to specific lines: this is an order-level adjustment, and
    // pretending otherwise would distort per-item return rates.
    items: [],
    amount,
    shippingRefund: 0,
    mode: order.paymentMethod === 'COD' ? 'BANK_TRANSFER' : 'ORIGINAL',
    status: 'PENDING',
    reason,
    liability: input.liability ?? 'PLATFORM',
    providerRefundId: null,
    failureReason: null,
    expectedBy: new Date(Date.now() + days * 86_400_000).toISOString(),
    initiatedAt: iso,
    completedAt: null,
    initiatedByUserId: input.actorUserId,
    timeline: [event('REFUND_INITIATED', 'Refund initiated by support', 'ADMIN', iso, reason)],
    createdAt: iso,
    updatedAt: iso,
  };

  await refunds.insertOne({ ...refund, _id: refund.id });

  // COD has no captured payment to reverse; finance pays out by bank transfer.
  if (payment?.providerPaymentId) {
    const result = await gateway().refund({
      providerPaymentId: payment.providerPaymentId,
      amount,
      reason,
      idempotencyKey: refundId,
    });
    await applyRefundResult(refundId, result);
  }

  if (order.userId) {
    notifyQuietly({
      userId: order.userId,
      category: 'PAYMENT',
      title: `A refund is on its way for ${order.orderNumber}`,
      body: reason,
      href: `/orders/${order.id}`,
      entityType: 'refund',
      entityId: refundId,
    });
  }

  return { ok: true, refundId, amount };
}

export async function applyRefundResult(
  refundId: string,
  result:
    | { status: 'COMPLETED' | 'PROCESSING'; providerRefundId: string }
    | { status: 'FAILED'; code: string; message: string },
): Promise<void> {
  const refunds = await collections.refunds();
  const iso = new Date().toISOString();

  if (result.status === 'FAILED') {
    await refunds.updateOne(
      { _id: refundId },
      {
        $set: { status: 'FAILED', failureReason: result.message, updatedAt: iso },
        $push: { timeline: event('NOTE', 'Refund failed', 'SYSTEM', iso, result.message) },
      },
    );
    return;
  }

  const completed = result.status === 'COMPLETED';

  await refunds.updateOne(
    { _id: refundId },
    {
      $set: {
        status: completed ? 'COMPLETED' : 'PROCESSING',
        providerRefundId: result.providerRefundId,
        completedAt: completed ? iso : null,
        updatedAt: iso,
      },
      $push: {
        timeline: event(
          completed ? 'REFUNDED' : 'REFUND_INITIATED',
          completed ? 'Refund complete' : 'Refund sent to your bank',
          'SYSTEM',
          iso,
        ),
      },
    },
  );

  if (!completed) return;

  const refund = toEntity(await refunds.findOne({ _id: refundId }));
  if (!refund) return;

  const orderItems = await collections.orderItems();
  for (const item of refund.items) {
    await orderItems.updateOne(
      { _id: item.orderItemId },
      {
        $set: { status: 'REFUNDED', updatedAt: iso },
        $inc: { returnedQuantity: item.quantity },
        $push: { timeline: event('REFUNDED', 'Refund complete', 'SYSTEM', iso) },
      },
    );
  }

  await recomputeOrderStatus(refund.orderId);
}

/* ------------------------------------------------------------------ reads */

export async function listReturns(userId: string): Promise<ReturnRequest[]> {
  const returns = await collections.returns();
  return toEntities(await returns.find({ userId }).sort({ createdAt: -1 }).limit(50).toArray());
}

export async function listRefunds(userId: string): Promise<Refund[]> {
  const refunds = await collections.refunds();
  return toEntities(await refunds.find({ userId }).sort({ createdAt: -1 }).limit(50).toArray());
}

/* ----------------------------------------------------------------- shared */

async function setItemStatus(
  request: ReturnRequest,
  status: ReturnRequest['status'],
  actor: OrderEvent['actor'],
  note?: string,
): Promise<void> {
  const iso = new Date().toISOString();
  const orderItems = await collections.orderItems();

  for (const item of request.items) {
    await orderItems.updateOne(
      { _id: item.orderItemId },
      {
        $set: { status, updatedAt: iso },
        $push: {
          timeline: event(status, FULFILLMENT_STATUS_META[status].label, actor, iso, note ?? null),
        },
      },
    );
  }

  await recomputeOrderStatus(request.orderId);
}

function event(
  status: OrderEvent['status'],
  title: string,
  actor: OrderEvent['actor'],
  at: string,
  description: string | null = null,
): OrderEvent {
  return {
    id: entityId('evt'),
    status,
    title,
    description,
    location: null,
    actor,
    actorName: null,
    occurredAt: at,
  };
}
