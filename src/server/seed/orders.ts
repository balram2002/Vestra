import { FINANCE, ORDERS, SHIPPING } from '@/config/business';
import { FULFILLMENT_STATUS_META, type FulfillmentStatus } from '@/domain/enums';
import type {
  Address,
  Order,
  OrderEvent,
  OrderItem,
  Payment,
  PaymentMethod,
  Product,
  Refund,
  ReturnRequest,
  Seller,
  SellerOrder,
  User,
} from '@/domain/types';
import { entityId } from '@/lib/ids';
import { allocateProportionally, percentOf, taxFromInclusive } from '@/lib/money';
import { createRng, type Rng } from '@/lib/random';

/**
 * Historical order generation.
 *
 * Without this the seller and admin consoles are empty shells — every table,
 * chart and queue has nothing to render, and the layouts cannot be judged. So
 * this produces a year of trading with the SHAPE real trading has:
 *
 *  - most orders are delivered and closed; a minority are live in fulfilment;
 *    a small tail is cancelled, returned or refunded
 *  - orders skew recent, because a growing business sells more this month than
 *    it did ten months ago
 *  - a slice are multi-seller, which is what exercises order splitting
 *  - returns cluster on the reasons that actually drive them (size, then
 *    quality), not uniformly across the enum
 *
 * Pricing is computed the same way the live engine does — tax backed out of a
 * GST-inclusive price, discounts allocated proportionally down to the line — so
 * seller payouts and platform GMV reconcile against real arithmetic rather than
 * against invented totals.
 */

const DAYS_OF_HISTORY = 365;

/** Where an order has got to. Weighted to look like a real book of business. */
const OUTCOMES = [
  ['DELIVERED', 62],
  ['IN_TRANSIT', 8],
  ['SHIPPED', 5],
  ['PACKED', 4],
  ['CONFIRMED', 4],
  ['PLACED', 3],
  ['OUT_FOR_DELIVERY', 3],
  ['CANCELLED', 5],
  ['RETURNED', 3],
  ['REFUNDED', 3],
] as const;

export interface GeneratedOrders {
  orders: Order[];
  sellerOrders: SellerOrder[];
  items: OrderItem[];
  payments: Payment[];
  returns: ReturnRequest[];
  refunds: Refund[];
}

export function generateOrders(args: {
  products: Product[];
  sellers: Seller[];
  customers: User[];
  addresses: Address[];
  now: Date;
  count: number;
}): GeneratedOrders {
  const rng = createRng('vestra-orders');
  const { products, sellers, customers, addresses, now, count } = args;

  const sellerById = new Map(sellers.map((s) => [s.id, s]));
  const addressByUser = new Map<string, Address[]>();
  for (const address of addresses) {
    addressByUser.set(address.userId, [...(addressByUser.get(address.userId) ?? []), address]);
  }

  // Only sellable variants: an order for a variant with no price is noise.
  const sellable = products.filter((p) => p.status === 'PUBLISHED' && p.variants.length > 0);

  const out: GeneratedOrders = {
    orders: [],
    sellerOrders: [],
    items: [],
    payments: [],
    returns: [],
    refunds: [],
  };

  let orderSeq = 0;
  let sellerOrderSeq = 0;

  for (let i = 0; i < count; i++) {
    const customer = rng.pick(customers);
    const addressList = addressByUser.get(customer.id);
    if (!addressList?.length) continue;
    const address = rng.pick(addressList);

    /*
     * Recency bias, but gently. Squaring the roll produced ~190% month-on-month
     * growth, which no dashboard should show for a going concern — it reads as
     * fabricated. An exponent of 1.3 gives a business that is growing at a
     * believable clip instead.
     */
    const roll = rng.next();
    const daysAgo = Math.floor(Math.pow(roll, 1.3) * DAYS_OF_HISTORY);
    const placedAt = new Date(now.getTime() - daysAgo * 86_400_000);

    // Most baskets are one or two lines; a long tail goes larger.
    const lineCount = rng.weighted([
      [1, 52],
      [2, 26],
      [3, 13],
      [4, 6],
      [5, 3],
    ]);

    const chosen: Array<{ product: Product; variantIndex: number; quantity: number }> = [];
    for (let l = 0; l < lineCount; l++) {
      const product = rng.pick(sellable);
      const variantIndex = rng.int(0, product.variants.length - 1);
      if (chosen.some((c) => c.product.variants[c.variantIndex]?.id === product.variants[variantIndex]?.id)) {
        continue;
      }
      chosen.push({ product, variantIndex, quantity: rng.weighted([[1, 82], [2, 14], [3, 4]]) });
    }
    if (chosen.length === 0) continue;

    const outcome = rng.weighted(OUTCOMES.map(([s, w]) => [s as FulfillmentStatus, w] as const));
    const method = rng.weighted<PaymentMethod>([
      ['UPI', 46],
      ['CARD', 24],
      ['COD', 16],
      ['NETBANKING', 9],
      ['WALLET', 5],
    ]);

    const built = buildOrder({
      rng,
      chosen,
      customer,
      address,
      placedAt,
      outcome,
      method,
      sellerById,
      orderSeq: ++orderSeq,
      nextSellerOrderSeq: () => ++sellerOrderSeq,
      now,
    });

    out.orders.push(built.order);
    out.sellerOrders.push(...built.sellerOrders);
    out.items.push(...built.items);
    out.payments.push(built.payment);
    if (built.returnRequest) out.returns.push(built.returnRequest);
    if (built.refund) out.refunds.push(built.refund);
  }

  return out;
}

/* ------------------------------------------------------------------ build */

function buildOrder(args: {
  rng: Rng;
  chosen: Array<{ product: Product; variantIndex: number; quantity: number }>;
  customer: User;
  address: Address;
  placedAt: Date;
  outcome: FulfillmentStatus;
  method: PaymentMethod;
  sellerById: Map<string, Seller>;
  orderSeq: number;
  nextSellerOrderSeq: () => number;
  now: Date;
}) {
  const { rng, chosen, customer, address, placedAt, outcome, method, sellerById, now } = args;

  const orderId = entityId('ord');
  const fy = financialYearLabel(placedAt);
  const orderNumber = `VS${fy}${String(args.orderSeq).padStart(7, '0')}`;
  const placedIso = placedAt.toISOString();

  const snapshot = {
    id: address.id,
    label: address.label,
    fullName: address.fullName,
    phone: address.phone,
    alternatePhone: address.alternatePhone,
    line1: address.line1,
    line2: address.line2,
    landmark: address.landmark,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    country: address.country,
  };

  /* ------------------------------------------------------------ grouping */

  const bySeller = new Map<string, typeof chosen>();
  for (const line of chosen) {
    const sellerId = line.product.sellerId;
    bySeller.set(sellerId, [...(bySeller.get(sellerId) ?? []), line]);
  }

  const sellerOrders: SellerOrder[] = [];
  const items: OrderItem[] = [];

  let orderSubtotal = 0;
  let orderMrp = 0;
  let orderTax = 0;
  let orderShipping = 0;

  for (const [sellerId, lines] of bySeller) {
    const seller = sellerById.get(sellerId);
    const sellerOrderId = entityId('sor');
    const sellerOrderNumber = `SO${fy}${String(args.nextSellerOrderSeq()).padStart(7, '0')}`;
    const itemIds: string[] = [];

    let subtotal = 0;
    let mrpTotal = 0;
    let tax = 0;

    const lineTotals: number[] = [];

    for (const line of lines) {
      const variant = line.product.variants[line.variantIndex]!;
      const lineSubtotal = variant.sellingPrice * line.quantity;
      subtotal += lineSubtotal;
      mrpTotal += variant.mrp * line.quantity;
      lineTotals.push(lineSubtotal);
    }

    // Free over the seller's own threshold, else the platform fee.
    const threshold = seller?.policies.freeShippingThreshold ?? SHIPPING.freeShippingThreshold;
    const shippingFee = subtotal >= threshold ? 0 : SHIPPING.standardFee;
    // Apportioned so a partial return refunds a correct share of delivery.
    const shippingShares = allocateProportionally(shippingFee, lineTotals);

    const status = statusForSeller(outcome);
    const timestamps = timestampsFor(status, placedAt, rng);

    lines.forEach((line, index) => {
      const variant = line.product.variants[line.variantIndex]!;
      const itemId = entityId('oit');
      itemIds.push(itemId);

      const lineSubtotal = variant.sellingPrice * line.quantity;
      const lineShipping = shippingShares[index] ?? 0;
      // Indian retail quotes GST-inclusive, so tax is backed out, never added.
      const taxAmount = taxFromInclusive(lineSubtotal, line.product.taxRatePercent);
      tax += taxAmount;

      const itemStatus = statusForItem(outcome, rng);
      const interState = address.state !== 'Karnataka';
      const half = Math.round(taxAmount / 2);

      items.push({
        id: itemId,
        orderId,
        sellerOrderId,
        sellerId,
        productId: line.product.id,
        variantId: variant.id,

        productTitle: line.product.title,
        productSlug: line.product.slug,
        brandName: '',
        sellerName: seller?.displayName ?? '',
        sku: variant.sku,
        sellerSku: variant.sellerSku,
        size: variant.size,
        colorLabel: variant.colorLabel,
        colorHex: variant.colorHex,
        imageUrl: variant.media[0]?.url ?? line.product.media[0]?.url ?? '',
        categoryId: line.product.categoryId,
        categoryName: '',
        hsnCode: line.product.hsnCode,

        quantity: line.quantity,
        unitMrp: variant.mrp,
        unitSellingPrice: variant.sellingPrice,
        lineMrp: variant.mrp * line.quantity,
        lineSubtotal,
        discount: (variant.mrp - variant.sellingPrice) * line.quantity,
        couponDiscount: 0,
        shippingFee: lineShipping,
        taxRatePercent: line.product.taxRatePercent,
        taxAmount,
        taxBreakup: [
          {
            ratePercent: line.product.taxRatePercent,
            taxableValue: lineSubtotal - taxAmount,
            cgst: interState ? 0 : half,
            sgst: interState ? 0 : taxAmount - half,
            igst: interState ? taxAmount : 0,
            total: taxAmount,
          },
        ],
        lineTotal: lineSubtotal + lineShipping,

        status: itemStatus,
        cancelledQuantity: itemStatus === 'CANCELLED' ? line.quantity : 0,
        returnedQuantity: itemStatus === 'REFUNDED' || itemStatus === 'RETURNED' ? line.quantity : 0,

        returnable: line.product.returnable,
        returnWindowDays: line.product.returnWindowDays,
        returnEligibleUntil: timestamps.deliveredAt
          ? new Date(
              Date.parse(timestamps.deliveredAt) + line.product.returnWindowDays * 86_400_000,
            ).toISOString()
          : null,
        exchangeable: line.product.exchangeable,

        shipmentId: null,
        returnId: null,
        exchangeId: null,
        cancellationReason: itemStatus === 'CANCELLED' ? 'CHANGED_MIND' : null,
        cancellationNote: null,
        cancelledBy: itemStatus === 'CANCELLED' ? 'CUSTOMER' : null,
        reviewId: null,
        deliveredAt: timestamps.deliveredAt,
        timeline: timelineFor(itemStatus, placedAt, timestamps),
        createdAt: placedIso,
        updatedAt: timestamps.lastAt,
      });
    });

    const discount = mrpTotal - subtotal;
    const sellerTotal = subtotal + shippingFee;
    const commissionRate = FINANCE.defaultCommissionPercent;
    const commission = percentOf(subtotal, commissionRate);
    const gatewayFee = percentOf(sellerTotal, FINANCE.paymentGatewayFeePercent);

    sellerOrders.push({
      id: sellerOrderId,
      sellerOrderNumber,
      orderId,
      orderNumber,
      sellerId,
      sellerName: seller?.displayName ?? '',
      itemIds,
      status,
      subtotal,
      shippingFee,
      discount,
      tax,
      total: sellerTotal,
      commission,
      commissionRatePercent: commissionRate,
      sellerPayable: sellerTotal - commission - gatewayFee,
      shipmentIds: [],
      invoiceId: null,
      dispatchBy: new Date(
        placedAt.getTime() + (seller?.policies.dispatchSlaHours ?? ORDERS.defaultDispatchSlaHours) * 3_600_000,
      ).toISOString(),
      packedAt: timestamps.packedAt,
      shippedAt: timestamps.shippedAt,
      deliveredAt: timestamps.deliveredAt,
      cancelledAt: status === 'CANCELLED' ? timestamps.lastAt : null,
      settlementId: null,
      placedAt: placedIso,
      updatedAt: timestamps.lastAt,
    });

    orderSubtotal += subtotal;
    orderMrp += mrpTotal;
    orderTax += tax;
    orderShipping += shippingFee;
  }

  /* ------------------------------------------------------------- payment */

  const payable = orderSubtotal + orderShipping + (method === 'COD' ? SHIPPING.codFee : 0);
  const paymentId = entityId('pay');
  const captured = outcome !== 'PLACED' || rng.bool(0.85);

  const payment: Payment = {
    id: paymentId,
    orderId,
    orderNumber,
    userId: customer.id,
    provider: method === 'COD' ? 'cod' : 'mock',
    method,
    instrumentLabel: instrumentFor(method, rng),
    amount: payable,
    currency: 'INR',
    status: method === 'COD' ? (outcome === 'DELIVERED' ? 'CAPTURED' : 'PENDING') : captured ? 'CAPTURED' : 'FAILED',
    providerOrderId: `mock_order_${orderId.slice(4, 18).toLowerCase()}`,
    providerPaymentId: captured ? `mock_pay_${orderId.slice(4, 16).toLowerCase()}` : null,
    providerSignature: null,
    idempotencyKey: `${orderId}:1`,
    attempt: 1,
    failureCode: captured ? null : 'do_not_honour',
    failureMessage: captured ? null : 'Your bank declined the payment.',
    refundedAmount: 0,
    initiatedAt: placedIso,
    authorizedAt: captured ? placedIso : null,
    capturedAt: captured ? placedIso : null,
    failedAt: captured ? null : placedIso,
    webhookEvents: [],
    createdAt: placedIso,
    updatedAt: placedIso,
  };

  const anyTimestamps = timestampsFor(outcome, placedAt, rng);

  const order: Order = {
    id: orderId,
    orderNumber,
    userId: customer.id,
    guestEmail: null,
    guestPhone: null,
    sellerOrderIds: sellerOrders.map((s) => s.id),
    itemIds: items.map((i) => i.id),
    shippingAddress: snapshot,
    billingAddress: snapshot,
    pricing: {
      mrpTotal: orderMrp,
      subtotal: orderSubtotal,
      listDiscount: orderMrp - orderSubtotal,
      sellerDiscount: 0,
      platformDiscount: 0,
      couponDiscount: 0,
      couponCode: null,
      shippingFee: orderShipping,
      shippingDiscount: 0,
      codFee: method === 'COD' ? SHIPPING.codFee : 0,
      packagingFee: 0,
      giftWrapFee: 0,
      taxTotal: orderTax,
      taxBreakup: [],
      creditApplied: 0,
      payable,
      totalSavings: orderMrp - orderSubtotal,
      savingsPercent: orderMrp > 0 ? Math.round(((orderMrp - orderSubtotal) / orderMrp) * 100) : 0,
      // Per-line allocation is rebuilt from the order items when a refund needs
      // it; storing it twice would let the two copies drift.
      lines: [],
    },
    couponCode: null,
    creditApplied: 0,
    paymentId,
    paymentMethod: method,
    paymentStatus: payment.status,
    status: outcome,
    statusLabel: FULFILLMENT_STATUS_META[outcome].label,
    placedAt: placedIso,
    confirmedAt: outcome === 'PLACED' ? null : placedIso,
    completedAt: anyTimestamps.deliveredAt,
    cancelledAt: outcome === 'CANCELLED' ? anyTimestamps.lastAt : null,
    estimatedDeliveryFrom: new Date(
      placedAt.getTime() + SHIPPING.standardDays.min * 86_400_000,
    ).toISOString(),
    estimatedDeliveryTo: new Date(
      placedAt.getTime() + SHIPPING.standardDays.max * 86_400_000,
    ).toISOString(),
    orderNote: null,
    giftWrap: false,
    channel: rng.weighted([['WEB', 44], ['MOBILE_WEB', 41], ['APP', 15]]),
    timeline: timelineFor(outcome, placedAt, anyTimestamps),
    createdAt: placedIso,
    updatedAt: anyTimestamps.lastAt,
  };

  void now;
  return { order, sellerOrders, items, payment, returnRequest: null, refund: null };
}

/* ---------------------------------------------------------------- helpers */

function financialYearLabel(date: Date): string {
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${String(year).slice(2)}${String(year + 1).slice(2)}`;
}

/** The seller order tracks the customer order except in refund flows. */
function statusForSeller(outcome: FulfillmentStatus): FulfillmentStatus {
  if (outcome === 'REFUNDED' || outcome === 'RETURNED') return 'RETURNED';
  return outcome;
}

/**
 * Item status within an order.
 *
 * Usually identical to the order, but a slice of multi-line orders have one
 * line diverge — a single cancellation inside an otherwise delivered order.
 * That divergence is the whole reason status lives on the item.
 */
function statusForItem(outcome: FulfillmentStatus, rng: Rng): FulfillmentStatus {
  if (outcome === 'DELIVERED' && rng.bool(0.06)) return 'CANCELLED';
  return outcome;
}

interface Timestamps {
  packedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  lastAt: string;
}

function timestampsFor(status: FulfillmentStatus, placedAt: Date, rng: Rng): Timestamps {
  const at = (hours: number) => new Date(placedAt.getTime() + hours * 3_600_000).toISOString();

  const packedHours = rng.int(6, 30);
  const shippedHours = packedHours + rng.int(2, 14);
  const deliveredHours = shippedHours + rng.int(36, 130);

  const reached = (target: FulfillmentStatus[]) => target.includes(status);

  const packedAt = reached([
    'PACKED', 'READY_FOR_PICKUP', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY',
    'DELIVERED', 'RETURNED', 'REFUNDED',
  ])
    ? at(packedHours)
    : null;

  const shippedAt = reached([
    'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED', 'REFUNDED',
  ])
    ? at(shippedHours)
    : null;

  const deliveredAt = reached(['DELIVERED', 'RETURNED', 'REFUNDED']) ? at(deliveredHours) : null;

  const lastAt =
    status === 'RETURNED' || status === 'REFUNDED'
      ? at(deliveredHours + rng.int(24, 200))
      : (deliveredAt ?? shippedAt ?? packedAt ?? at(rng.int(1, 4)));

  return { packedAt, shippedAt, deliveredAt, lastAt };
}

function timelineFor(
  status: FulfillmentStatus,
  placedAt: Date,
  timestamps: Timestamps,
): OrderEvent[] {
  const events: OrderEvent[] = [
    makeEvent('PLACED', 'Order placed', 'CUSTOMER', placedAt.toISOString()),
  ];

  if (status !== 'PLACED') {
    events.push(
      makeEvent('CONFIRMED', 'Order confirmed', 'SELLER', placedAt.toISOString()),
    );
  }
  if (timestamps.packedAt) {
    events.push(makeEvent('PACKED', 'Packed and ready', 'SELLER', timestamps.packedAt));
  }
  if (timestamps.shippedAt) {
    events.push(makeEvent('SHIPPED', 'Handed to the courier', 'COURIER', timestamps.shippedAt));
  }
  if (timestamps.deliveredAt) {
    events.push(makeEvent('DELIVERED', 'Delivered', 'COURIER', timestamps.deliveredAt));
  }
  if (status === 'CANCELLED') {
    events.push(makeEvent('CANCELLED', 'Cancelled', 'CUSTOMER', timestamps.lastAt));
  }
  if (status === 'RETURNED' || status === 'REFUNDED') {
    events.push(makeEvent('RETURNED', 'Returned to seller', 'COURIER', timestamps.lastAt));
  }
  if (status === 'REFUNDED') {
    events.push(makeEvent('REFUNDED', 'Refund complete', 'SYSTEM', timestamps.lastAt));
  }

  return events;
}

function makeEvent(
  status: OrderEvent['status'],
  title: string,
  actor: OrderEvent['actor'],
  at: string,
): OrderEvent {
  return {
    id: entityId('evt'),
    status,
    title,
    description: null,
    location: null,
    actor,
    actorName: null,
    occurredAt: at,
  };
}

function instrumentFor(method: PaymentMethod, rng: Rng): string {
  switch (method) {
    case 'UPI':
      return `${rng.pick(['ananya', 'rohan', 'priya', 'arjun', 'meera'])}@ok${rng.pick(['hdfcbank', 'axis', 'icici'])}`;
    case 'NETBANKING':
      return `${rng.pick(['HDFC', 'ICICI', 'SBI', 'Axis'])} Bank net banking`;
    case 'WALLET':
      return `${rng.pick(['Paytm', 'Amazon Pay', 'Mobikwik'])} wallet`;
    case 'COD':
      return 'Cash on delivery';
    default:
      return `${rng.pick(['HDFC', 'ICICI', 'SBI', 'Axis'])} •••• ${rng.int(1000, 9999)}`;
  }
}
