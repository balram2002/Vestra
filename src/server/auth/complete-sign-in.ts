import 'server-only';

import type { PublicUser, User } from '@/domain/types';
import { safeNext } from '@/lib/safe-next';

import { collections } from '../db/collections';
import { mergeGuestCart } from '../services/cart';
import { mergeGuestWishlist } from '../services/wishlist';
import { landingPathFor } from './rbac';
import { clearGuestToken, getGuestToken, startSession } from './session';

/** A safe projection. The password hash must never leave the auth layer. */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    roles: user.roles,
    status: user.status,
    avatarUrl: user.avatarUrl,
    sellerId: user.sellerId,
    creditBalance: user.creditBalance,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
  };
}

/**
 * The last step of every sign-in: a password, a one-time code, or Google.
 *
 * One function, so the ways in cannot drift apart. Each records the sign-in,
 * carries the guest bag and wishlist across BEFORE the session starts -- so the
 * merge is attributed to the right owner, and nothing a guest chose is lost at
 * the door -- and then starts the session.
 *
 * It returns where to go rather than redirecting: `redirect` has to be thrown
 * from the action or route that owns the response.
 */
export async function completeSignIn(user: User, next?: string | null): Promise<string> {
  const users = await collections.users();
  await users.updateOne({ _id: user.id }, { $set: { lastLoginAt: new Date().toISOString() } });

  const guestToken = await getGuestToken();
  if (guestToken) {
    await mergeGuestCart(guestToken, user.id);
    await mergeGuestWishlist(guestToken, user.id);
    await clearGuestToken();
  }

  await startSession(toPublicUser(user));
  return safeNext(next) ?? landingPathFor(user.roles);
}
