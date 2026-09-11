'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';

import { CART } from '@/config/business';

import { currentOwner, ensureGuestToken, getGuestToken } from '../auth/session';
import * as cart from '../services/cart';
import { LIMITS, clientIp, hit, peek, retryMessage } from '../security/rate-limit';

/**
 * Bag mutations.
 *
 * Every action returns a plain `{ ok, error }` result rather than throwing, so
 * the client can render a precise failure ("only 2 left in this size") next to
 * the control the shopper used. A thrown error would surface as a generic
 * boundary and lose that.
 *
 * Input is validated with zod on the server even though the same schema runs on
 * the client: a Server Action is a public HTTP endpoint, and client validation
 * is a convenience, never a control.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const addSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(CART.maxQuantityPerVariant),
});

export async function addToBag(input: {
  productId: string;
  variantId: string;
  quantity: number;
}): Promise<ActionResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'That request was not valid. Please try again.' };
  }

  // A guest needs a token before anything can be attributed to them. This is
  // the first point at which we are allowed to set a cookie (Server Action),
  // which is why the token is minted here and not during a page render.
  const existing = await getGuestToken();
  const owner = existing
    ? await currentOwner()
    : await (async () => {
        const claims = await currentOwner();
        if (claims.kind === 'user') return claims;
        const token = await ensureGuestToken();
        return { kind: 'guest' as const, guestToken: token };
      })();

  const result = await cart.addItem(owner, parsed.data);
  if (!result.ok) return { ok: false, error: result.error };

  // The bag count lives in the header on every page, so the router cache has
  // to be refreshed rather than a single tag invalidated.
  refresh();
  return { ok: true };
}

const quantitySchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(0).max(CART.maxQuantityPerVariant),
});

export async function setBagQuantity(input: {
  variantId: string;
  quantity: number;
}): Promise<ActionResult> {
  const parsed = quantitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That quantity is not valid.' };

  const owner = await currentOwner();
  const result = await cart.setQuantity(owner, parsed.data.variantId, parsed.data.quantity);
  if (!result.ok) return { ok: false, error: result.error };

  refresh();
  return { ok: true };
}

export async function removeFromBag(variantId: string): Promise<ActionResult> {
  const owner = await currentOwner();
  const result = await cart.removeItem(owner, variantId);
  if (!result.ok) return { ok: false, error: result.error };

  refresh();
  return { ok: true };
}

export async function saveItemForLater(variantId: string): Promise<ActionResult> {
  const owner = await currentOwner();
  const result = await cart.saveForLater(owner, variantId);
  if (!result.ok) return { ok: false, error: result.error };

  refresh();
  return { ok: true };
}

export async function moveItemToBag(variantId: string): Promise<ActionResult> {
  const owner = await currentOwner();
  const result = await cart.moveToBag(owner, variantId);
  if (!result.ok) return { ok: false, error: result.error };

  refresh();
  return { ok: true };
}

/* --------------------------------------------------------------- coupons */

/**
 * Apply a coupon code.
 *
 * The code is STORED on the bag; the discount is not. Every read re-evaluates
 * it against live rules, so a coupon that expires overnight or hits its usage
 * limit stops discounting on the next page view rather than persisting a stale
 * amount into checkout.
 *
 * Validation happens here as well as on read, because a code that will never
 * work should be refused at the moment it is typed, with the reason.
 */
export async function applyCoupon(input: { code: string }): Promise<ActionResult> {
  const code = input.code.trim().toUpperCase();
  if (code.length < 3) return { ok: false, error: 'Enter a coupon code.' };

  const owner = await currentOwner();
  const existing = await cart.findCart(owner);
  if (!existing || existing.items.length === 0) {
    return { ok: false, error: 'Your bag is empty.' };
  }

  // Codes are short and guessable, and a script trying them one after another
  // is the attack. Only codes that FAIL spend the budget.
  const subject =
    owner.kind === 'user'
      ? owner.userId
      : owner.kind === 'guest'
        ? owner.guestToken
        : await clientIp();
  const limited = await peek(LIMITS.coupon, subject);
  if (!limited.allowed) return { ok: false, error: retryMessage(limited) };

  const result = await cart.setCoupon(owner, code);
  if (!result.ok) {
    await hit(LIMITS.coupon, subject);
    return { ok: false, error: result.error };
  }

  refresh();
  return { ok: true };
}

export async function removeCoupon(): Promise<ActionResult> {
  const owner = await currentOwner();
  const result = await cart.setCoupon(owner, null);
  if (!result.ok) return { ok: false, error: result.error };

  refresh();
  return { ok: true };
}

/** Spend VestraWAB Credit on this order, or stop spending it. */
export async function setUseCredit(input: { use: boolean }): Promise<ActionResult> {
  const owner = await currentOwner();
  const result = await cart.setCreditUsage(owner, input.use);
  if (!result.ok) return { ok: false, error: result.error };

  refresh();
  return { ok: true };
}
