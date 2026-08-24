'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';

import { CART } from '@/config/business';

import { currentOwner, ensureGuestToken, getGuestToken } from '../auth/session';
import * as cart from '../services/cart';

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
