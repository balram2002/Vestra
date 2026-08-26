import 'server-only';

import { SHIPPING } from '@/config/business';
import {
  RETURN_REASON_LABEL,
  SELLER_FAULT_REASONS,
  RETURN_REASONS,
  type ReturnReason,
} from '@/domain/enums';
import type { OrderEvent, Order, OrderItem, Refund, ReturnItem, ReturnRequest, SellerOrder } from '@/domain/types';
import { entityId } from '@/lib/ids';

import { financialYear } from '../db/sequences';
import { createRng } from '@/lib/random';

/**
 * Return and refund records for the seeded history.
 *
 * The order generator already puts items into RETURNED and REFUNDED states but
 * never wrote the documents behind them, which left 180 lines claiming to have
 * been returned with no return to open, an empty seller queue, an empty
 * `/account/returns` and a refunds ledger with nothing in it.
 *
 * These are derived from the items rather than invented alongside them, so the
 * record and the status it explains can never disagree.
 */

export interface GeneratedReturns {
  returns: ReturnRequest[];
  refunds: Refund[];
  /** orderItemId -> returnId, so the seeder can stamp the items. */
  itemReturnIds: Record<string, string>;
}

/** Reasons weighted the way a fashion marketplace actually sees them. */
const REASON_WEIGHTS: ReadonlyArray<readonly [ReturnReason, number]> = [
  ['SIZE_TOO_SMALL', 26],
  ['SIZE_TOO_LARGE', 21],
  ['QUALITY_NOT_AS_EXPECTED', 14],
  ['DIFFERENT_FROM_IMAGE', 12],
  ['CHANGED_MIND', 10],
  ['DAMAGED_ITEM', 6],
  ['WRONG_ITEM_DELIVERED', 4],
  ['DELAYED_DELIVERY', 3],
  ['BETTER_PRICE_AVAILABLE', 2],
  ['MISSING_ITEM', 2],
];

const NOTES: Partial<Record<ReturnReason, string[]>> = {
  SIZE_TOO_SMALL: ['Runs a size small across the shoulders.', 'Snug at the waist, need the next size up.'],
  SIZE_TOO_LARGE: ['Too loose through the body.', 'Sleeves are long on me.'],
  QUALITY_NOT_AS_EXPECTED: ['Fabric feels thinner than I expected.', 'Stitching came loose at the hem.'],
  DIFFERENT_FROM_IMAGE: ['The shade is much darker in person.', 'Print placement is not as pictured.'],
  DAMAGED_ITEM: ['There is a tear near the seam.', 'Arrived with a mark on the front.'],
  WRONG_ITEM_DELIVERED: ['Received a different colour from the one ordered.'],
  MISSING_ITEM: ['Only one of the two pieces was in the parcel.'],
};

export function generateReturns(args: {
  orders: Order[];
  sellerOrders: SellerOrder[];
  items: OrderItem[];
  now: Date;
}): GeneratedReturns {
  const rng = createRng('vestra-returns');
  const { orders, sellerOrders, items, now } = args;

  const orderById = new Map(orders.map((order) => [order.id, order]));
  const sellerOrderById = new Map(sellerOrders.map((so) => [so.id, so]));

  // Only lines that claim to have been returned, grouped into one request per
  // seller order — which is how a real return travels, as one parcel.
  const bySellerOrder = new Map<string, OrderItem[]>();
  for (const item of items) {
    if (item.status !== 'RETURNED' && item.status !== 'REFUNDED') continue;
    const list = bySellerOrder.get(item.sellerOrderId);
    if (list) list.push(item);
    else bySellerOrder.set(item.sellerOrderId, [item]);
  }

  const returns: ReturnRequest[] = [];
  const refunds: Refund[] = [];
  const itemReturnIds: Record<string, string> = {};

  let sequence = 0;
  let refundSequence = 0;

  for (const [sellerOrderId, group] of bySellerOrder) {
    const sellerOrder = sellerOrderById.get(sellerOrderId);
    const order = sellerOrder ? orderById.get(sellerOrder.orderId) : undefined;
    if (!sellerOrder || !order) continue;

    const deliveredAt = sellerOrder.deliveredAt ?? group[0].deliveredAt;
    if (!deliveredAt) continue;

    sequence += 1;
    const returnId = entityId('ret');
    const fy = financialYear(new Date(sellerOrder.placedAt));
    const returnNumber = `RT${fy}${String(sequence).padStart(6, '0')}`;

    const reason = rng.weighted(REASON_WEIGHTS);
    const sellerFault = SELLER_FAULT_REASONS.includes(reason);
    const note = pickNote(reason, rng);

    // A return runs on its own clock, anchored to when the item arrived.
    const requestedAt = shift(deliveredAt, rng.int(12, 120));
    const approvedAt = shift(requestedAt, rng.int(2, 20));
    const pickedUpAt = shift(approvedAt, rng.int(18, 72));
    const receivedAt = shift(pickedUpAt, rng.int(24, 96));

    // Everything is clamped to the seed clock: a "completed" return dated next
    // week reads as broken data.
    if (Date.parse(receivedAt) > now.getTime()) continue;

    const returnItems: ReturnItem[] = group.map((item) => ({
      orderItemId: item.id,
      variantId: item.variantId,
      productTitle: item.productTitle,
      imageUrl: item.imageUrl,
      size: item.size,
      colorLabel: item.colorLabel,
      quantity: item.quantity - item.cancelledQuantity,
      refundableAmount: item.lineTotal,
    }));

    const goodsTotal = returnItems.reduce((sum, item) => sum + item.refundableAmount, 0);
    const reverseFee = sellerFault ? 0 : SHIPPING.reversePickupFee;
    const refundAmount = Math.max(0, goodsTotal - reverseFee);

    // REFUNDED lines completed; RETURNED lines are back with the seller and the
    // money has not moved yet. Both are states a real queue contains.
    const isRefunded = group.some((item) => item.status === 'REFUNDED');
    const closedAt = isRefunded ? shift(receivedAt, rng.int(6, 72)) : null;

    const timeline: OrderEvent[] = [
      event('RETURN_REQUESTED', 'Return requested', 'CUSTOMER', requestedAt, RETURN_REASON_LABEL[reason]),
      event('RETURN_APPROVED', 'Return approved', 'SELLER', approvedAt, null),
      event('RETURN_PICKUP', 'Picked up', 'COURIER', pickedUpAt, null),
      event('RETURNED', 'Passed quality check', 'SELLER', receivedAt, null),
    ];
    if (closedAt) {
      timeline.push(event('REFUNDED', 'Refund completed', 'SYSTEM', closedAt, null));
    }

    returns.push({
      id: returnId,
      returnNumber,
      orderId: order.id,
      orderNumber: order.orderNumber,
      sellerOrderId,
      sellerId: sellerOrder.sellerId,
      userId: order.userId,
      items: returnItems,
      status: isRefunded ? 'REFUNDED' : 'RETURNED',
      reason,
      reasonNote: note,
      attachments: [],
      pickupAddress: order.shippingAddress,
      pickupSlot: null,
      shipmentId: null,
      qcResult: 'PASSED',
      qcNote: null,
      qcImages: [],
      qcByUserId: null,
      refundId: null,
      refundMode: order.paymentMethod === 'COD' ? 'BANK_TRANSFER' : 'ORIGINAL',
      refundAmount,
      liability: sellerFault ? 'SELLER' : 'CUSTOMER',
      reverseShippingFee: reverseFee,
      settlementId: null,
      rejectionReason: null,
      requestedAt,
      approvedAt,
      pickedUpAt,
      receivedAt,
      closedAt,
      timeline,
      createdAt: requestedAt,
      updatedAt: closedAt ?? receivedAt,
    });

    for (const item of returnItems) itemReturnIds[item.orderItemId] = returnId;

    if (isRefunded && closedAt) {
      refundSequence += 1;
      const refundId = entityId('rfd');
      refunds.push({
        id: refundId,
        refundNumber: `RF${fy}${String(refundSequence).padStart(6, '0')}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        sellerOrderId,
        paymentId: order.paymentId,
        userId: order.userId,
        items: returnItems.map((item) => ({
          orderItemId: item.orderItemId,
          quantity: item.quantity,
          amount: item.refundableAmount,
        })),
        amount: refundAmount,
        shippingRefund: 0,
        mode: order.paymentMethod === 'COD' ? 'BANK_TRANSFER' : 'ORIGINAL',
        status: 'COMPLETED',
        reason: RETURN_REASON_LABEL[reason],
        liability: sellerFault ? 'SELLER' : 'PLATFORM',
        providerRefundId: `rfnd_${refundId.slice(-12).toLowerCase()}`,
        failureReason: null,
        expectedBy: shift(receivedAt, 120),
        initiatedAt: receivedAt,
        completedAt: closedAt,
        initiatedByUserId: null,
        timeline: [
          event('REFUND_INITIATED', 'Refund initiated', 'SYSTEM', receivedAt, null),
          event('REFUNDED', 'Refund completed', 'SYSTEM', closedAt, null),
        ],
        createdAt: receivedAt,
        updatedAt: closedAt,
      });

      returns[returns.length - 1].refundId = refundId;
    }
  }

  return { returns, refunds, itemReturnIds };
}

/* ------------------------------------------------------------- helpers */

function shift(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 3_600_000).toISOString();
}



function pickNote(reason: ReturnReason, rng: ReturnType<typeof createRng>): string | null {
  const options = NOTES[reason];
  // Most shoppers pick a reason and type nothing, so an empty note is the
  // common case rather than the exception.
  if (!options || rng.bool(0.55)) return null;
  return rng.pick(options);
}

function event(
  status: OrderEvent['status'],
  title: string,
  actor: OrderEvent['actor'],
  occurredAt: string,
  description: string | null,
): OrderEvent {
  return {
    id: entityId('evt'),
    status,
    title,
    description,
    location: null,
    actor,
    actorName: null,
    occurredAt,
  };
}

/** Exposed so the generator's reason vocabulary stays checkable. */
export const SEEDED_RETURN_REASONS = RETURN_REASONS;
