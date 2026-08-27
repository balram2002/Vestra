import 'server-only';

import { FINANCE, ORDERS, PRICING, SHIPPING } from '@/config/business';
import {
  canTransition,
  FORWARD_FLOW,
  FULFILLMENT_STATUS_META,
  isCustomerCancellable,
  PAYMENT_METHOD_LABEL,
  type CancellationReason,
  type FulfillmentStatus,
} from '@/domain/enums';
import type {
  Order,
  OrderAddress,
  OrderEvent,
  OrderItem,
  Payment,
  PaymentMethod,
  SellerOrder,
  Shipment,
  TaxLine,
} from '@/domain/types';
import { entityId } from '@/lib/ids';
import { percentOf } from '@/lib/money';

import { runSaga, type SagaStep } from '../db/saga';
import { collections, toEntities, toEntity } from '../db/collections';
import { nextOrderNumber, nextSellerOrderNumber } from '../db/sequences';
import { attemptKey, gateway, newIdempotencyKey } from '../payments';
import * as inventory from '../repositories/inventory';
import { getCartView } from './cart';
import { NOTIFY, notifyQuietly } from './notifications';
import type { Owner } from '../auth/session';

/**
 * Order placement.
 *
 * The most failure-prone operation in the system: it spans inventory, an
 * external payment provider and four collections, on a database with no
 * multi-document transactions. It is therefore written as an explicit saga
 * (`db/saga.ts`) where every step declares how to undo itself.
 *
 * The ordering is deliberate and is the whole design:
 *
 *   1. RE-PRICE AND RE-VALIDATE. The bag is rebuilt from live catalogue data,
 *      and any blocking issue aborts before anything is written. The client's
 *      idea of the total is never trusted — it is not even read.
 *   2. RESERVE STOCK. Before payment, so a customer cannot be charged for
 *      something that sold out while they typed their card. Compensation
 *      releases it.
 *   3. CREATE THE ORDER, unpaid. It exists before the money moves, so a
 *      payment that succeeds while the browser dies still has an order to
 *      attach to — the classic "charged but no order" hole.
 *   4. OPEN A PAYMENT INTENT. Capture is confirmed by webhook, never by the
 *      client claiming success.
 *
 * Stock moves reserved -> sold only on dispatch, not on payment: until it is
 * packed it can still be cancelled and put back.
 */

/* ------------------------------------------------------------------ types */

export interface GuestCheckoutInput {
  email: string;
  phone: string;
  address: Omit<OrderAddress, 'id'>;
}

export interface PlaceOrderInput {
  /** Signed-in shoppers pick a saved address. */
  addressId?: string;
  /** Guests supply contact details and an address inline. */
  guest?: GuestCheckoutInput;
  paymentMethod: PaymentMethod;
  useCredit?: boolean;
  orderNote?: string | null;
  giftWrap?: boolean;
}

export type PlaceOrderResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      payment: { paymentId: string; providerOrderId: string; redirectUrl: string | null };
    }
  | { ok: false; error: string; code: 'EMPTY' | 'BLOCKED' | 'NO_ADDRESS' | 'STOCK' | 'FAILED' };

interface SagaContext {
  orderId: string;
  orderNumber: string;
  reserved: Array<{ variantId: string; quantity: number }>;
  paymentId?: string;
  providerOrderId?: string;
  redirectUrl?: string | null;
}

/* -------------------------------------------------------------- placement */

/**
 * Place an order for a signed-in shopper or a guest.
 *
 * A guest is not a degraded customer — they get the same stock reservation,
 * the same price recomputation and the same saga. What they lack is an
 * account, so their contact details and address travel with the ORDER rather
 * than being looked up from one. Everything downstream already treats
 * `order.userId` as nullable.
 */
export async function placeOrder(
  owner: Owner,
  userId: string | null,
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  const cart = await getCartView(owner);

  if (cart.groups.length === 0) {
    return { ok: false, error: 'Your bag is empty.', code: 'EMPTY' };
  }

  // Re-derived against live data a moment ago, so this is the authoritative
  // answer, not a stale flag from the bag page.
  if (!cart.checkoutReady) {
    const first = cart.issues.find((issue) => issue.blocking);
    return {
      ok: false,
      error: first?.message ?? 'Some items in your bag need attention.',
      code: 'BLOCKED',
    };
  }

  /*
   * Resolve who is buying and where it goes.
   *
   * The two paths differ only in where the address comes from. A signed-in
   * shopper's is looked up and SCOPED TO THEM, so passing someone else's
   * address id finds nothing; a guest's arrives with the request and is
   * snapshotted onto the order, because there is no account to store it on.
   */
  let snapshot: OrderAddress;
  let contact: { name: string; email: string; phone: string | null };

  if (userId) {
    const addresses = await collections.addresses();
    const address = toEntity(await addresses.findOne({ _id: input.addressId, userId }));
    if (!address) {
      return { ok: false, error: 'Choose a delivery address to continue.', code: 'NO_ADDRESS' };
    }

    const users = await collections.users();
    const user = toEntity(await users.findOne({ _id: userId }));
    if (!user) return { ok: false, error: 'Sign in again to place this order.', code: 'FAILED' };

    snapshot = {
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
    contact = { name: user.fullName, email: user.email, phone: user.phone };
  } else {
    if (!input.guest) {
      return { ok: false, error: 'Enter a delivery address to continue.', code: 'NO_ADDRESS' };
    }
    snapshot = { id: entityId('gad'), ...input.guest.address };
    contact = {
      name: input.guest.address.fullName,
      email: input.guest.email,
      phone: input.guest.phone,
    };
  }

  const movements = cart.groups.flatMap((group) =>
    group.lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
  );

  const now = new Date();
  const orderId = entityId('ord');

  const steps: SagaStep<SagaContext>[] = [
    /* --------------------------------------------------------- 1. stock */
    {
      name: 'reserve-inventory',
      run: async () => {
        const result = await inventory.reserveMany(movements);
        if (!result.ok) {
          const short = result.shortfalls[0]!;
          throw new Error(
            short.available === 0
              ? 'An item sold out while you were checking out.'
              : `Only ${short.available} left of one item in your bag.`,
          );
        }
        return { reserved: movements };
      },
      compensate: async () => {
        await inventory.releaseMany(movements);
      },
    },

    /* --------------------------------------------------------- 2. order */
    {
      name: 'create-order',
      run: async (ctx) => {
        const orderNumber = await nextOrderNumber(now);
        await writeOrder({
          orderId: ctx.orderId,
          orderNumber,
          userId,
          user: contact,
          guest: userId ? null : { email: contact.email, phone: contact.phone ?? '' },
          address: snapshot,
          cart,
          input,
          now,
        });
        return { orderNumber };
      },
      compensate: async (ctx) => {
        // The order is not deleted. A record of a failed attempt is worth
        // keeping: support gets asked about it, and it is the only trace if
        // the customer's bank shows a pending authorisation.
        await markOrderFailed(ctx.orderId, 'Order creation failed and was rolled back.');
      },
    },

    /* ---------------------------------------------------- 3. redemption */
    {
      /*
       * Record the coupon use.
       *
       * Without this the coupon engine's per-user and total limits are
       * unenforceable — the evaluator counts redemptions, and if none are ever
       * written a "first order only" coupon works for ever.
       *
       * The unique index on (couponId, orderId) is what makes it idempotent: a
       * retried saga cannot record the same use twice.
       */
      name: 'record-coupon-redemption',
      run: async (ctx) => {
        const code = cart.pricing.couponCode;
        if (!code || cart.pricing.couponDiscount <= 0) return;

        const coupons = await collections.coupons();
        const coupon = toEntity(await coupons.findOne({ code }));
        if (!coupon) return;

        const redemptions = await collections.couponRedemptions();
        try {
          await redemptions.insertOne({
            _id: entityId('rdm'),
            id: entityId('rdm'),
            couponId: coupon.id,
            code: coupon.code,
            userId,
            orderId: ctx.orderId,
            discount: cart.pricing.couponDiscount,
            redeemedAt: new Date().toISOString(),
            revokedAt: null,
          } as never);
        } catch {
          // Already recorded for this order: the constraint did its job.
          return;
        }

        await coupons.updateOne({ _id: coupon.id }, { $inc: { usedCount: 1 } });
      },
      compensate: async (ctx) => {
        // Give the use back rather than deleting it, so the fact that an
        // attempt happened is still visible to support.
        const redemptions = await collections.couponRedemptions();
        const record = await redemptions.findOne({ orderId: ctx.orderId, revokedAt: null });
        if (!record) return;

        await redemptions.updateOne(
          { _id: record._id },
          { $set: { revokedAt: new Date().toISOString() } },
        );
        const coupons = await collections.coupons();
        await coupons.updateOne({ _id: record.couponId }, { $inc: { usedCount: -1 } });
      },
    },

    /* ------------------------------------------------------- 4. payment */
    {
      name: 'open-payment',
      run: async (ctx) => {
        const payment = await openPayment({
          orderId: ctx.orderId,
          orderNumber: ctx.orderNumber,
          userId,
          amount: cart.pricing.payable,
          method: input.paymentMethod,
          customer: contact,
          now,
        });

        return {
          paymentId: payment.paymentId,
          providerOrderId: payment.providerOrderId,
          redirectUrl: payment.redirectUrl,
        };
      },
    },
  ];

  try {
    const ctx = await runSaga<SagaContext>(
      'place-order',
      { orderId, orderNumber: '', reserved: [] },
      steps,
      { correlationId: orderId },
    );

    // The bag is cleared only once everything above succeeded.
    await clearCart(cart.cartId);

    return {
      ok: true,
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      payment: {
        paymentId: ctx.paymentId!,
        providerOrderId: ctx.providerOrderId!,
        redirectUrl: ctx.redirectUrl ?? null,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not place your order.';
    // A stock shortfall is the shopper's problem to resolve, so it gets its own
    // code and a message they can act on.
    const stock = /sold out|Only \d+ left/.test(message);
    return {
      ok: false,
      error: stock ? message : 'We could not place your order. Nothing has been charged.',
      code: stock ? 'STOCK' : 'FAILED',
    };
  }
}

/* ------------------------------------------------------------- persistence */

async function writeOrder(args: {
  orderId: string;
  orderNumber: string;
  /** Null for a guest order. */
  userId: string | null;
  user: { name: string; email: string; phone: string | null };
  /** Contact details for a guest, so the order can be reached without an account. */
  guest: { email: string; phone: string } | null;
  address: OrderAddress;
  cart: Awaited<ReturnType<typeof getCartView>>;
  input: PlaceOrderInput;
  now: Date;
}): Promise<void> {
  const { orderId, orderNumber, userId, address, cart, input, now } = args;
  const iso = now.toISOString();

  const [orderCol, sellerOrderCol, itemCol] = await Promise.all([
    collections.orders(),
    collections.sellerOrders(),
    collections.orderItems(),
  ]);

  const products = await collections.products();
  const productIds = Array.from(
    new Set(cart.groups.flatMap((g) => g.lines.map((l) => l.productId))),
  );
  const productDocs = toEntities(await products.find({ _id: { $in: productIds } }).toArray());
  const byProduct = new Map(productDocs.map((p) => [p.id, p]));

  const categories = await collections.categories();
  const categoryDocs = toEntities(
    await categories.find({ _id: { $in: productDocs.map((p) => p.categoryId) } }).toArray(),
  );
  const byCategory = new Map(categoryDocs.map((c) => [c.id, c]));

  const brands = await collections.brands();
  const brandDocs = toEntities(
    await brands.find({ _id: { $in: productDocs.map((p) => p.brandId) } }).toArray(),
  );
  const byBrand = new Map(brandDocs.map((b) => [b.id, b]));

  // The pricing engine already allocated every discount down to the line, so
  // the order can be written without re-deriving anything.
  const priceLines = new Map(cart.pricing.lines.map((line) => [line.refId, line]));

  // Decides CGST+SGST vs IGST on every line and on the invoice.
  const interState = address.state !== PRICING.originState;

  const sellerOrders: SellerOrder[] = [];
  const items: OrderItem[] = [];

  for (const group of cart.groups) {
    const sellerOrderId = entityId('sor');
    const sellerOrderNumber = await nextSellerOrderNumber(now);
    const sellerItemIds: string[] = [];

    let subtotal = 0;
    let discount = 0;
    let tax = 0;

    for (const line of group.lines) {
      const product = byProduct.get(line.productId);
      const allocated = priceLines.get(line.item.id);
      const itemId = entityId('oit');
      sellerItemIds.push(itemId);

      const lineSubtotal = allocated?.lineSubtotal ?? line.sellingPrice * line.quantity;
      const lineDiscount =
        (allocated?.sellerDiscount ?? 0) + (allocated?.platformDiscount ?? 0);
      const couponDiscount = allocated?.couponDiscount ?? 0;
      const taxAmount = allocated?.taxAmount ?? 0;

      subtotal += lineSubtotal;
      discount += lineDiscount + couponDiscount;
      tax += taxAmount;

      const returnWindowDays = product?.returnWindowDays ?? 0;

      items.push({
        id: itemId,
        orderId,
        sellerOrderId,
        sellerId: line.sellerId,

        productId: line.productId,
        variantId: line.variantId,

        /* Snapshot: later catalogue edits must never rewrite this order. */
        productTitle: line.productTitle,
        productSlug: line.productSlug,
        brandName: product ? (byBrand.get(product.brandId)?.name ?? '') : '',
        sellerName: group.sellerName,
        sku: line.sku,
        sellerSku: product?.variants.find((v) => v.id === line.variantId)?.sellerSku ?? line.sku,
        size: line.size,
        colorLabel: line.colorLabel,
        colorHex: line.colorHex,
        imageUrl: line.image,
        categoryId: product?.categoryId ?? '',
        categoryName: product ? (byCategory.get(product.categoryId)?.name ?? '') : '',
        hsnCode: product?.hsnCode ?? '',

        quantity: line.quantity,
        unitMrp: line.mrp,
        unitSellingPrice: line.sellingPrice,
        lineMrp: line.mrp * line.quantity,
        lineSubtotal,
        discount: lineDiscount,
        couponDiscount,
        shippingFee: allocated?.shippingFee ?? 0,
        taxRatePercent: product?.taxRatePercent ?? 0,
        taxAmount,
        // The engine allocates a tax AMOUNT per line; the CGST/SGST vs IGST
        // split is a function of where it ships, so it is composed here where
        // the destination is known.
        taxBreakup: taxBreakupFor(
          product?.taxRatePercent ?? 0,
          lineSubtotal - lineDiscount - couponDiscount,
          taxAmount,
          interState,
        ),
        lineTotal: allocated?.lineTotal ?? lineSubtotal,

        status: 'PLACED',
        cancelledQuantity: 0,
        returnedQuantity: 0,

        returnable: product?.returnable ?? false,
        returnWindowDays,
        returnEligibleUntil: null,
        exchangeable: product?.exchangeable ?? false,

        shipmentId: null,
        returnId: null,
        exchangeId: null,

        cancellationReason: null,
        cancellationNote: null,
        cancelledBy: null,

        reviewId: null,
        deliveredAt: null,
        timeline: [event('PLACED', 'Order placed', 'SYSTEM', iso)],
        createdAt: iso,
        updatedAt: iso,
      });
    }

    const sellerTotal = subtotal - discount + group.shippingFee;
    const commissionRate = FINANCE.defaultCommissionPercent;
    const commission = percentOf(subtotal - discount, commissionRate);
    const gatewayFee = percentOf(sellerTotal, FINANCE.paymentGatewayFeePercent);

    sellerOrders.push({
      id: sellerOrderId,
      sellerOrderNumber,
      orderId,
      orderNumber,
      sellerId: group.sellerId,
      sellerName: group.sellerName,
      itemIds: sellerItemIds,
      status: 'PLACED',
      subtotal,
      shippingFee: group.shippingFee,
      discount,
      tax,
      total: sellerTotal,
      commission,
      commissionRatePercent: commissionRate,
      // What the seller is owed once delivered and past the return window.
      sellerPayable: sellerTotal - commission - gatewayFee,
      shipmentIds: [],
      invoiceId: null,
      dispatchBy: new Date(
        now.getTime() + ORDERS.defaultDispatchSlaHours * 3_600_000,
      ).toISOString(),
      packedAt: null,
      shippedAt: null,
      deliveredAt: null,
      cancelledAt: null,
      settlementId: null,
      placedAt: iso,
      updatedAt: iso,
    });
  }

  const deliveryFrom = new Date(now.getTime() + SHIPPING.standardDays.min * 86_400_000);
  const deliveryTo = new Date(now.getTime() + SHIPPING.standardDays.max * 86_400_000);

  const order: Order = {
    id: orderId,
    orderNumber,
    userId,
    // A guest order has no account to look these up from, so they live here.
    guestEmail: args.guest?.email ?? null,
    guestPhone: args.guest?.phone ?? null,
    sellerOrderIds: sellerOrders.map((s) => s.id),
    itemIds: items.map((i) => i.id),
    shippingAddress: address,
    billingAddress: address,
    pricing: cart.pricing,
    couponCode: cart.pricing.couponCode,
    creditApplied: cart.pricing.creditApplied,
    paymentId: null,
    paymentMethod: input.paymentMethod,
    paymentStatus: 'PENDING',
    status: 'PLACED',
    statusLabel: FULFILLMENT_STATUS_META.PLACED.label,
    placedAt: iso,
    confirmedAt: null,
    completedAt: null,
    cancelledAt: null,
    estimatedDeliveryFrom: deliveryFrom.toISOString(),
    estimatedDeliveryTo: deliveryTo.toISOString(),
    orderNote: input.orderNote ?? null,
    giftWrap: input.giftWrap ?? false,
    channel: 'WEB',
    timeline: [event('PLACED', 'Order placed', 'CUSTOMER', iso)],
    createdAt: iso,
    updatedAt: iso,
  };

  await Promise.all([
    orderCol.insertOne({ ...order, _id: order.id }),
    sellerOrderCol.insertMany(sellerOrders.map((s) => ({ ...s, _id: s.id }))),
    itemCol.insertMany(items.map((i) => ({ ...i, _id: i.id }))),
  ]);
}

/**
 * Split a line's tax into CGST+SGST or IGST.
 *
 * Intra-state sales are split half and half between the centre and the state;
 * inter-state sales carry a single integrated levy. The invoice is legally
 * required to show which, so it is computed at order time and frozen.
 */
function taxBreakupFor(
  ratePercent: number,
  taxableValue: number,
  total: number,
  interState: boolean,
): TaxLine[] {
  if (total <= 0) return [];

  const half = Math.round(total / 2);
  return [
    {
      ratePercent,
      taxableValue,
      cgst: interState ? 0 : half,
      sgst: interState ? 0 : total - half,
      igst: interState ? total : 0,
      total,
    },
  ];
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

async function markOrderFailed(orderId: string, reason: string): Promise<void> {
  const orders = await collections.orders();
  const iso = new Date().toISOString();

  await orders.updateOne(
    { _id: orderId },
    {
      $set: {
        status: 'FAILED',
        statusLabel: FULFILLMENT_STATUS_META.FAILED.label,
        paymentStatus: 'FAILED',
        updatedAt: iso,
      },
      $push: { timeline: event('FAILED', 'Order failed', 'SYSTEM', iso, reason) },
    },
  );
}

async function clearCart(cartId: string): Promise<void> {
  if (!cartId) return;
  const carts = await collections.carts();
  await carts.updateOne(
    { _id: cartId },
    { $set: { items: [], couponCode: null, updatedAt: new Date().toISOString() } },
  );
}

/* ---------------------------------------------------------------- payment */

async function openPayment(args: {
  orderId: string;
  orderNumber: string;
  /** Null for a guest order; the Payment type already allows it. */
  userId: string | null;
  amount: number;
  method: PaymentMethod;
  customer: { name: string; email: string; phone: string | null };
  now: Date;
}): Promise<{ paymentId: string; providerOrderId: string; redirectUrl: string | null }> {
  const provider = gateway();
  const iso = args.now.toISOString();
  const paymentId = entityId('pay');
  const attempt = 1;
  const key = `${attemptKey(args.orderId, attempt)}:${newIdempotencyKey().slice(0, 8)}`;

  // Cash on delivery still gets a Payment record, so every order has one and
  // reconciliation never has to special-case it.
  const isCod = args.method === 'COD';

  const intent = isCod
    ? { providerOrderId: `cod_${args.orderId}`, redirectUrl: null, clientPayload: {} }
    : await provider.createIntent({
        orderId: args.orderId,
        orderNumber: args.orderNumber,
        amount: args.amount,
        currency: 'INR',
        method: args.method,
        customer: args.customer,
        idempotencyKey: key,
      });

  const payment: Payment = {
    id: paymentId,
    orderId: args.orderId,
    orderNumber: args.orderNumber,
    userId: args.userId,
    provider: isCod ? 'cod' : provider.name,
    method: args.method,
    instrumentLabel: isCod ? 'Cash on delivery' : null,
    amount: args.amount,
    currency: 'INR',
    status: isCod ? 'PENDING' : 'INITIATED',
    providerOrderId: intent.providerOrderId,
    providerPaymentId: null,
    providerSignature: null,
    idempotencyKey: key,
    attempt,
    failureCode: null,
    failureMessage: null,
    refundedAmount: 0,
    initiatedAt: iso,
    authorizedAt: null,
    capturedAt: null,
    failedAt: null,
    webhookEvents: [],
    createdAt: iso,
    updatedAt: iso,
  };

  const payments = await collections.payments();
  await payments.insertOne({ ...payment, _id: payment.id });

  const orders = await collections.orders();
  await orders.updateOne(
    { _id: args.orderId },
    { $set: { paymentId, paymentStatus: payment.status, updatedAt: iso } },
  );

  // COD is confirmed immediately — there is nothing to capture.
  if (isCod) await confirmOrder(args.orderId, 'Cash on delivery order confirmed.');

  return {
    paymentId,
    providerOrderId: intent.providerOrderId,
    redirectUrl: intent.redirectUrl,
  };
}

/**
 * Settle a payment attempt.
 *
 * Called both from the return-from-provider route and from the webhook. It is
 * idempotent: whichever arrives second finds the payment already captured and
 * changes nothing, which is exactly the duplicate-webhook defence.
 */
export async function settlePayment(
  paymentId: string,
  outcome:
    | { status: 'CAPTURED'; providerPaymentId: string; instrumentLabel: string | null }
    | { status: 'FAILED'; code: string; message: string }
    | { status: 'PENDING' },
): Promise<{ ok: boolean; alreadySettled: boolean }> {
  const payments = await collections.payments();
  const payment = toEntity(await payments.findOne({ _id: paymentId }));
  if (!payment) return { ok: false, alreadySettled: false };

  if (payment.status === 'CAPTURED' || payment.status === 'REFUNDED') {
    return { ok: true, alreadySettled: true };
  }

  const iso = new Date().toISOString();

  if (outcome.status === 'CAPTURED') {
    await payments.updateOne(
      { _id: paymentId },
      {
        $set: {
          status: 'CAPTURED',
          providerPaymentId: outcome.providerPaymentId,
          instrumentLabel: outcome.instrumentLabel,
          capturedAt: iso,
          updatedAt: iso,
        },
      },
    );
    await confirmOrder(payment.orderId, 'Payment received.');
    return { ok: true, alreadySettled: false };
  }

  if (outcome.status === 'FAILED') {
    await payments.updateOne(
      { _id: paymentId },
      {
        $set: {
          status: 'FAILED',
          failureCode: outcome.code,
          failureMessage: outcome.message,
          failedAt: iso,
          updatedAt: iso,
        },
      },
    );

    // The order is NOT failed here. The customer may retry with another
    // method, and the reservation is held until the payment window expires.
    const orders = await collections.orders();
    await orders.updateOne(
      { _id: payment.orderId },
      {
        $set: { paymentStatus: 'FAILED', updatedAt: iso },
        $push: {
          timeline: event('FAILED', 'Payment failed', 'SYSTEM', iso, outcome.message),
        },
      },
    );

    if (payment.userId) {
      void NOTIFY.paymentFailed(payment.userId, payment.orderNumber, payment.orderId);
    }
    return { ok: true, alreadySettled: false };
  }

  await payments.updateOne(
    { _id: paymentId },
    { $set: { status: 'PROCESSING', updatedAt: iso } },
  );
  return { ok: true, alreadySettled: false };
}

async function confirmOrder(orderId: string, note: string): Promise<void> {
  const iso = new Date().toISOString();
  const [orders, sellerOrders, items] = await Promise.all([
    collections.orders(),
    collections.sellerOrders(),
    collections.orderItems(),
  ]);

  await orders.updateOne(
    { _id: orderId, status: 'PLACED' },
    {
      $set: {
        status: 'CONFIRMED',
        statusLabel: FULFILLMENT_STATUS_META.CONFIRMED.label,
        paymentStatus: 'CAPTURED',
        confirmedAt: iso,
        updatedAt: iso,
      },
      $push: { timeline: event('CONFIRMED', 'Order confirmed', 'SYSTEM', iso, note) },
    },
  );

  await sellerOrders.updateMany(
    { orderId, status: 'PLACED' },
    { $set: { status: 'CONFIRMED', updatedAt: iso } },
  );

  await items.updateMany(
    { orderId, status: 'PLACED' },
    {
      $set: { status: 'CONFIRMED', updatedAt: iso },
      $push: { timeline: event('CONFIRMED', 'Confirmed by seller', 'SYSTEM', iso) },
    },
  );

  // Fire-and-forget: a notification that fails to send must never undo a
  // confirmed order.
  const order = toEntity(await orders.findOne({ _id: orderId }));
  if (order?.userId) {
    const orderItemsCol = await collections.orderItems();
    const items = await orderItemsCol.countDocuments({ orderId: order.id });

    void NOTIFY.orderPlaced(order.userId, order.orderNumber, order.id, {
      items,
      total: order.pricing.payable,
      payment: PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod,
    });
  }
}

/* ------------------------------------------------------------------ reads */

export interface OrderDetail {
  order: Order;
  sellerOrders: SellerOrder[];
  items: OrderItem[];
  payment: Payment | null;
  /**
   * Parcels, keyed by seller order id. A seller may split one order across
   * several boxes, so this is a list per seller order rather than one shipment.
   */
  shipments: Record<string, Shipment[]>;
  /**
   * Whether each item is still inside its return window, keyed by item id.
   *
   * Derived HERE rather than in the component: reading the clock during render
   * is an impure render, and the server is the only clock that should decide
   * this anyway since it is the one that enforces it on submit.
   */
  returnWindowOpen: Record<string, boolean>;
}

export async function getOrder(orderId: string, userId: string): Promise<OrderDetail | null> {
  const orders = await collections.orders();
  // Scoped by userId in the QUERY, not checked after the fact: one customer
  // must never be able to read another's order by guessing an id.
  const order = toEntity(await orders.findOne({ _id: orderId, userId }));
  if (!order) return null;

  return hydrateOrder(order);
}

/** Load everything hanging off an order. Callers do the authorisation. */
async function hydrateOrder(order: Order): Promise<OrderDetail> {
  const orderId = order.id;

  const [sellerOrderCol, itemCol, paymentCol, shipmentCol] = await Promise.all([
    collections.sellerOrders(),
    collections.orderItems(),
    collections.payments(),
    collections.shipments(),
  ]);

  const [sellerOrders, items, payment, shipmentDocs] = await Promise.all([
    sellerOrderCol.find({ orderId }).toArray(),
    itemCol.find({ orderId }).toArray(),
    order.paymentId ? paymentCol.findOne({ _id: order.paymentId }) : Promise.resolve(null),
    shipmentCol.find({ orderId }).sort({ createdAt: 1 }).toArray(),
  ]);

  const shipments: Record<string, Shipment[]> = {};
  for (const shipment of toEntities(shipmentDocs)) {
    (shipments[shipment.sellerOrderId] ??= []).push(shipment);
  }

  const itemEntities = toEntities(items);
  const now = Date.now();
  const returnWindowOpen: Record<string, boolean> = {};
  for (const item of itemEntities) {
    returnWindowOpen[item.id] =
      !item.returnEligibleUntil || Date.parse(item.returnEligibleUntil) > now;
  }

  return {
    order,
    sellerOrders: toEntities(sellerOrders),
    items: itemEntities,
    payment: toEntity(payment),
    shipments,
    returnWindowOpen,
  };
}

/**
 * The order, for whoever is entitled to see it.
 *
 * A signed-in shopper is scoped by `userId` in the query. A guest is scoped by
 * the cookie their browser was given when they placed it — the order number
 * alone is never enough, or anyone could walk the sequence and read strangers'
 * addresses and phone numbers.
 */
/**
 * The bare order, for whoever is entitled to it.
 *
 * The lighter counterpart to `getOrderForViewer`, for callers that need the
 * order itself and not the whole graph hanging off it -- the payment step, for
 * one. Same authorisation rule: signed in scopes by user id, a guest scopes by
 * the cookie their browser was given at checkout.
 */
export async function findOrderForViewer(orderId: string): Promise<Order | null> {
  const { getSessionUser, ownsGuestOrder } = await import('../auth/session');

  const orders = await collections.orders();
  const session = await getSessionUser();

  if (session) return toEntity(await orders.findOne({ _id: orderId, userId: session.id }));
  if (!(await ownsGuestOrder(orderId))) return null;

  return toEntity(await orders.findOne({ _id: orderId, userId: null }));
}

export async function getOrderForViewer(orderId: string): Promise<OrderDetail | null> {
  const { getSessionUser, ownsGuestOrder } = await import('../auth/session');

  const session = await getSessionUser();
  if (session) return getOrder(orderId, session.id);

  if (!(await ownsGuestOrder(orderId))) return null;

  // Guest orders carry no userId, so the ownership check above IS the scope.
  const orders = await collections.orders();
  const order = toEntity(await orders.findOne({ _id: orderId, userId: null }));
  if (!order) return null;

  return hydrateOrder(order);
}

export async function listOrders(userId: string, limit = 25): Promise<Order[]> {
  const orders = await collections.orders();
  const docs = await orders.find({ userId }).sort({ placedAt: -1 }).limit(limit).toArray();
  return toEntities(docs);
}

/* ------------------------------------------------------------ cancellation */

/**
 * Customer cancellation.
 *
 * Per ITEM, not per order, because partial cancellation is the common case: a
 * bag of four things where one no longer fits the occasion. Stock goes back
 * immediately, and the refund is raised for the exact lines cancelled.
 */
export async function cancelItems(
  orderId: string,
  userId: string,
  itemIds: string[],
  reason: CancellationReason,
  note?: string,
): Promise<{ ok: boolean; error?: string; refundAmount?: number }> {
  const detail = await getOrder(orderId, userId);
  if (!detail) return { ok: false, error: 'Order not found.' };

  const targets = detail.items.filter((item) => itemIds.includes(item.id));
  if (targets.length === 0) return { ok: false, error: 'Nothing selected to cancel.' };

  const blocked = targets.find((item) => !isCustomerCancellable(item.status));
  if (blocked) {
    return {
      ok: false,
      error: `"${blocked.productTitle}" has already been dispatched. Raise a return instead.`,
    };
  }

  const iso = new Date().toISOString();
  const items = await collections.orderItems();
  let refundAmount = 0;

  for (const item of targets) {
    // Reserved, not sold — nothing has shipped — so this is a release.
    await inventory.release(item.variantId, item.quantity - item.cancelledQuantity);
    refundAmount += item.lineTotal;

    await items.updateOne(
      { _id: item.id },
      {
        $set: {
          status: 'CANCELLED',
          cancelledQuantity: item.quantity,
          cancellationReason: reason,
          cancellationNote: note ?? null,
          cancelledBy: 'CUSTOMER',
          updatedAt: iso,
        },
        $push: {
          timeline: event('CANCELLED', 'Cancelled by you', 'CUSTOMER', iso, note ?? null),
        },
      },
    );
  }

  await recomputeOrderStatus(orderId);

  return { ok: true, refundAmount };
}

/**
 * Recompute the order-level status from its items.
 *
 * Order status is DERIVED and stored only so list queries stay cheap. It is
 * never the source of truth — the items are — which is what lets one line be
 * returned while its siblings are still in transit.
 */
export async function recomputeOrderStatus(orderId: string): Promise<void> {
  const [orders, sellerOrderCol, itemCol] = await Promise.all([
    collections.orders(),
    collections.sellerOrders(),
    collections.orderItems(),
  ]);

  const items = toEntities(await itemCol.find({ orderId }).toArray());
  if (items.length === 0) return;

  const status = deriveStatus(items.map((i) => i.status));
  const iso = new Date().toISOString();

  await orders.updateOne(
    { _id: orderId },
    {
      $set: {
        status,
        statusLabel: FULFILLMENT_STATUS_META[status].label,
        updatedAt: iso,
        ...(status === 'CANCELLED' ? { cancelledAt: iso } : {}),
        ...(status === 'DELIVERED' ? { completedAt: iso } : {}),
      },
    },
  );

  // Each seller order rolls up only its own lines.
  for (const sellerOrder of toEntities(await sellerOrderCol.find({ orderId }).toArray())) {
    const own = items.filter((i) => i.sellerOrderId === sellerOrder.id);
    if (own.length === 0) continue;
    await sellerOrderCol.updateOne(
      { _id: sellerOrder.id },
      { $set: { status: deriveStatus(own.map((i) => i.status)), updatedAt: iso } },
    );
  }
}

/**
 * The order-level headline for a set of line statuses.
 *
 * Rule: report the LEAST advanced live line, because that is what the customer
 * is still waiting on. Fully-cancelled orders are the only case where a
 * terminal status wins.
 */
function deriveStatus(statuses: FulfillmentStatus[]): FulfillmentStatus {
  // Annotated explicitly: TypeScript infers a narrowing predicate from this
  // filter, which would drop 'CANCELLED' from the element type and break the
  // `includes` checks below.
  const live: FulfillmentStatus[] = statuses.filter((s) => s !== 'CANCELLED');
  if (live.length === 0) return 'CANCELLED';

  const order: FulfillmentStatus[] = [
    'PLACED',
    'CONFIRMED',
    'PROCESSING',
    'PACKED',
    'READY_FOR_PICKUP',
    'SHIPPED',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
  ];

  // Anything in a return or refund flow is the most newsworthy thing on the
  // order, so it wins over a plain forward status.
  const exceptional = live.find((s) => !order.includes(s));
  if (exceptional) return exceptional;

  for (const status of order) {
    if (live.includes(status)) return status;
  }
  return live[0]!;
}

/** Guarded transition, used by seller and admin tooling. */
export async function transitionItem(
  itemId: string,
  to: FulfillmentStatus,
  actor: OrderEvent['actor'],
  note?: string,
  options: { allowForwardSkip?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const items = await collections.orderItems();
  const item = toEntity(await items.findOne({ _id: itemId }));
  if (!item) return { ok: false, error: 'Item not found.' };

  /*
   * Couriers skip scans. A same-city parcel routinely goes from "picked up"
   * straight to "out for delivery" with no in-transit scan between them, and a
   * strict adjacency check would reject that — leaving the item stuck on
   * SHIPPED while the parcel it is inside says out for delivery. The customer
   * then sees the order page and the tracking panel disagree.
   *
   * So a COURIER-sourced move is allowed to jump ahead along the forward path,
   * but never to move backwards and never to leave it. Every other caller —
   * seller, admin, customer — still goes through the strict adjacency rule,
   * because those are decisions rather than observations.
   */
  const forwardSkip =
    options.allowForwardSkip &&
    FORWARD_FLOW.indexOf(item.status) !== -1 &&
    FORWARD_FLOW.indexOf(to) > FORWARD_FLOW.indexOf(item.status);

  if (!forwardSkip && !canTransition(item.status, to)) {
    return {
      ok: false,
      error: `Cannot move from ${FULFILLMENT_STATUS_META[item.status].label} to ${FULFILLMENT_STATUS_META[to].label}.`,
    };
  }

  const iso = new Date().toISOString();

  // Dispatch is the point stock stops being reservable and becomes sold.
  if (to === 'SHIPPED') {
    await inventory.commitSale(item.variantId, item.quantity - item.cancelledQuantity);
  }

  await items.updateOne(
    { _id: itemId },
    {
      $set: {
        status: to,
        updatedAt: iso,
        ...(to === 'DELIVERED'
          ? {
              deliveredAt: iso,
              returnEligibleUntil: item.returnable
                ? new Date(Date.now() + item.returnWindowDays * 86_400_000).toISOString()
                : null,
            }
          : {}),
      },
      $push: {
        timeline: event(to, FULFILLMENT_STATUS_META[to].label, actor, iso, note ?? null),
      },
    },
  );

  if (to === 'SHIPPED' || to === 'DELIVERED') {
    const orders = await collections.orders();
    const order = toEntity(await orders.findOne({ _id: item.orderId }));
    if (order?.userId) {
      notifyQuietly(
        to === 'SHIPPED'
          ? {
              userId: order.userId,
              category: 'SHIPPING',
              title: `Order ${order.orderNumber} is on its way`,
              body: `"${item.productTitle}" has been handed to the courier.`,
              href: `/orders/${order.id}`,
              entityType: 'order',
              entityId: order.id,
            }
          : {
              userId: order.userId,
              category: 'SHIPPING',
              title: `Order ${order.orderNumber} delivered`,
              body: 'Let us know how it fits — your review helps other shoppers get the size right.',
              href: `/orders/${order.id}`,
              entityType: 'order',
              entityId: order.id,
            },
      );
    }
  }

  await recomputeOrderStatus(item.orderId);
  return { ok: true };
}
