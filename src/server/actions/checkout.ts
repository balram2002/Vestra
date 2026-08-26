'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { PAYMENT_METHODS, CANCELLATION_REASONS, RETURN_REASONS } from '@/domain/enums';

import { currentOwner, getSessionUser, rememberGuestOrder, requireUser } from '../auth/session';
import { gateway } from '../payments';
import { collections, toEntity } from '../db/collections';
import { cancelItems, findOrderForViewer, placeOrder, settlePayment } from '../services/orders';
import { requestExchange } from '../services/exchanges';
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

const guestAddressSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name'),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'),
  line1: z.string().trim().min(4, 'Enter the address'),
  line2: z.string().trim().max(120).optional().or(z.literal('')),
  landmark: z.string().trim().max(120).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Enter the city'),
  state: z.string().trim().min(2, 'Choose the state'),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit pincode'),
});

const placeSchema = z.object({
  addressId: z.string().optional(),
  guest: z
    .object({
      email: z.string().trim().email('Enter a valid email address'),
      address: guestAddressSchema,
    })
    .optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  orderNote: z.string().max(500).optional(),
  giftWrap: z.boolean().optional(),
});

/**
 * Place the order.
 *
 * Works signed in or as a guest. The difference is only in where the address
 * comes from — a guest is not asked to create an account to buy something,
 * which is the single largest avoidable drop-off in a checkout.
 */
export async function submitOrder(input: {
  addressId?: string;
  guest?: { email: string; address: Record<string, string> };
  paymentMethod: string;
  orderNote?: string;
  giftWrap?: boolean;
}): Promise<ActionResult> {
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your details.' };
  }

  const session = await getSessionUser();
  const owner = await currentOwner();

  if (session && !parsed.data.addressId) {
    return { ok: false, error: 'Choose a delivery address to continue.' };
  }
  if (!session && !parsed.data.guest) {
    return { ok: false, error: 'Enter your contact and delivery details to continue.' };
  }

  const result = await placeOrder(owner, session?.id ?? null, {
    addressId: parsed.data.addressId,
    guest: parsed.data.guest
      ? {
          email: parsed.data.guest.email,
          phone: parsed.data.guest.address.phone,
          address: {
            label: 'HOME' as const,
            fullName: parsed.data.guest.address.fullName,
            phone: parsed.data.guest.address.phone,
            alternatePhone: null,
            line1: parsed.data.guest.address.line1,
            line2: parsed.data.guest.address.line2 || null,
            landmark: parsed.data.guest.address.landmark || null,
            city: parsed.data.guest.address.city,
            state: parsed.data.guest.address.state,
            pincode: parsed.data.guest.address.pincode,
            country: 'IN',
          },
        }
      : undefined,
    paymentMethod: parsed.data.paymentMethod,
    orderNote: parsed.data.orderNote ?? null,
    giftWrap: parsed.data.giftWrap ?? false,
  });

  if (!result.ok) return { ok: false, error: result.error };

  // A guest has no account to look this order up from later, so the browser is
  // given the only handle to it.
  if (!session) await rememberGuestOrder(result.orderId);

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
  // Guests pay too, so this resolves by whoever is entitled to the order
  // rather than requiring an account.
  const order = await findOrderForViewer(orderId);
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

/**
 * Ask for a different size or colour instead of a refund.
 *
 * Only the ORDER and the ITEM come from the client; which variants are even
 * offerable is decided server-side by `exchangeOptionsFor`, and re-checked
 * inside `requestExchange`. A tampered `toVariantId` therefore cannot reach a
 * variant of a different product, a different price, or one out of stock.
 */
export async function submitExchange(input: {
  orderId: string;
  orderItemId: string;
  toVariantId: string;
  quantity?: number;
  reason: string;
  note?: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  const schema = z.object({
    orderId: z.string().min(1),
    orderItemId: z.string().min(1),
    toVariantId: z.string().min(1),
    quantity: z.number().int().min(1).max(10).default(1),
    reason: z.enum(RETURN_REASONS),
    note: z.string().max(500).optional(),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your selection.' };
  }

  const result = await requestExchange(user.id, parsed.data);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/orders/${parsed.data.orderId}`);
  revalidatePath('/account/returns');
  return { ok: true };
}
