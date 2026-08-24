'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { PAYMENT_METHODS, CANCELLATION_REASONS, RETURN_REASONS } from '@/domain/enums';

import { currentOwner, requireUser } from '../auth/session';
import { gateway } from '../payments';
import { collections, toEntity } from '../db/collections';
import { cancelItems, placeOrder, settlePayment } from '../services/orders';
import { requestReturn } from '../services/returns';

/**
 * Checkout and post-purchase actions.
 *
 * Nothing here trusts an amount, a price or a permission from the client. The
 * order total is recomputed server-side from live catalogue data inside
 * `placeOrder`; this layer only validates shape and identity.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const placeSchema = z.object({
  addressId: z.string().min(1, 'Choose a delivery address'),
  paymentMethod: z.enum(PAYMENT_METHODS),
  orderNote: z.string().max(500).optional(),
  giftWrap: z.boolean().optional(),
});

export async function submitOrder(input: {
  addressId: string;
  paymentMethod: string;
  orderNote?: string;
  giftWrap?: boolean;
}): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your details.' };
  }

  const owner = await currentOwner();
  const result = await placeOrder(owner, user.id, {
    addressId: parsed.data.addressId,
    paymentMethod: parsed.data.paymentMethod,
    orderNote: parsed.data.orderNote ?? null,
    giftWrap: parsed.data.giftWrap ?? false,
  });

  if (!result.ok) return { ok: false, error: result.error };

  // Cash on delivery is already confirmed; card and UPI go to the provider step.
  if (parsed.data.paymentMethod === 'COD') {
    redirect(`/orders/${result.orderId}?placed=1`);
  }

  redirect(`/checkout/payment/${result.orderId}`);
}

/**
 * Settle the attempt after the customer returns from the provider.
 *
 * This is a CONVENIENCE, not the authority: the webhook is. If it arrives
 * first, this finds the payment already captured and does nothing. If the
 * customer closes the tab, the webhook still confirms the order.
 */
export async function confirmPayment(orderId: string): Promise<ActionResult> {
  const user = await requireUser();

  const orders = await collections.orders();
  const order = toEntity(await orders.findOne({ _id: orderId, userId: user.id }));
  if (!order?.paymentId) return { ok: false, error: 'Order not found.' };

  const payments = await collections.payments();
  const payment = toEntity(await payments.findOne({ _id: order.paymentId }));
  if (!payment) return { ok: false, error: 'Payment not found.' };

  if (payment.status === 'CAPTURED') redirect(`/orders/${orderId}?placed=1`);

  const outcome = await gateway().verify(payment.providerOrderId ?? '', {
    idempotencyKey: payment.idempotencyKey,
    method: payment.method,
  });

  await settlePayment(payment.id, outcome);

  if (outcome.status === 'FAILED') {
    return { ok: false, error: outcome.message };
  }

  if (outcome.status === 'PENDING') {
    // Deliberately NOT an error. The bank has not answered yet, and telling the
    // customer to pay again here is how double charges happen.
    redirect(`/orders/${orderId}?pending=1`);
  }

  redirect(`/orders/${orderId}?placed=1`);
}

/* ------------------------------------------------------------ post-purchase */

export async function cancelOrderItems(input: {
  orderId: string;
  itemIds: string[];
  reason: string;
  note?: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  const schema = z.object({
    orderId: z.string().min(1),
    itemIds: z.array(z.string().min(1)).min(1, 'Select at least one item'),
    reason: z.enum(CANCELLATION_REASONS),
    note: z.string().max(500).optional(),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your selection.' };
  }

  const result = await cancelItems(
    parsed.data.orderId,
    user.id,
    parsed.data.itemIds,
    parsed.data.reason,
    parsed.data.note,
  );

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function submitReturn(input: {
  orderId: string;
  items: Array<{ orderItemId: string; quantity: number }>;
  reason: string;
  note?: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  const schema = z.object({
    orderId: z.string().min(1),
    items: z
      .array(z.object({ orderItemId: z.string().min(1), quantity: z.number().int().min(1) }))
      .min(1, 'Select at least one item'),
    reason: z.enum(RETURN_REASONS),
    note: z.string().max(500).optional(),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your selection.' };
  }

  const result = await requestReturn(user.id, parsed.data);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
