'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';

import { currentOwner, ensureGuestToken, getGuestToken } from '../auth/session';
import * as wishlist from '../services/wishlist';

/**
 * Wishlist mutations.
 *
 * The service has existed since Phase 3 and nothing ever called it: the heart
 * on the product page and on every card was a button that popped a toast saying
 * the feature was coming. A control that looks live and does nothing is worse
 * than no control — it teaches people the buttons here are decorative.
 *
 * Same shape as the bag actions: a plain `{ ok, error }` result rather than a
 * throw, so the client can render a precise failure next to the control that
 * was used, and zod validation on the server because a Server Action is a
 * public HTTP endpoint regardless of what the client checked first.
 */

export interface WishlistResult {
  ok: boolean;
  /** The state AFTER the toggle, so the client renders it without a re-read. */
  saved?: boolean;
  error?: string;
}

const toggleSchema = z.object({ productId: z.string().min(1) });

export async function toggleWishlistItem(input: {
  productId: string;
}): Promise<WishlistResult> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'That request was not valid. Please try again.' };
  }

  /*
   * A guest needs a token before anything can be attributed to them, and a
   * Server Action is the first point at which we are allowed to set a cookie —
   * which is why the token is minted here and not during a page render.
   *
   * Saving without an account is deliberate. Forcing a login to save a product
   * is the single most reliable way to lose the save; the guest list is merged
   * into the account on the next sign-in by `mergeGuestWishlist`.
   */
  const existing = await getGuestToken();
  const owner = existing
    ? await currentOwner()
    : await (async () => {
        const claims = await currentOwner();
        if (claims.kind === 'user') return claims;
        const token = await ensureGuestToken();
        return { kind: 'guest' as const, guestToken: token };
      })();

  const result = await wishlist.toggleWishlist(owner, parsed.data.productId);
  if (!result.ok) return { ok: false, error: 'Could not update your saved items.' };

  // The saved count lives in the header and the bottom bar on every page, so
  // the router cache has to be refreshed rather than a single tag invalidated.
  refresh();
  return { ok: true, saved: result.saved };
}
