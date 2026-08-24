import 'server-only';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { forbidden, unauthorized } from 'next/navigation';

import type { Permission, PublicUser, SessionUser, UserRole } from '@/domain/types';

import { collections } from '../db/collections';
import { cookieOptions, GUEST_COOKIE, SESSION_COOKIE, sessionTtlSeconds, signSession, verifySession } from './jwt';
import { hasPermission, permissionsFor, primaryRole } from './rbac';

/**
 * Server-side session access.
 *
 * Every function here reads cookies, which under Cache Components makes the
 * calling scope dynamic. That is intentional and is why the storefront reads
 * the session only inside `<Suspense>` islands -- the static shell of a product
 * page never touches this module, so it stays prerenderable while "in your bag"
 * streams in per request.
 *
 * Permissions are recomputed from the user's roles on every call rather than
 * trusted from the token, so a role change or suspension takes effect on the
 * next request.
 */

/** Claims only. Cheap: no database round trip. */
export async function getSessionClaims() {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/**
 * The signed-in user, re-read from the database.
 *
 * Returns null rather than throwing, because most surfaces legitimately render
 * for both signed-in and anonymous visitors.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const claims = await getSessionClaims();
  if (!claims) return null;

  const users = await collections.users();
  const user = await users.findOne({ _id: claims.sub });

  // The token outlived the account, or the account was suspended after it was
  // issued. Either way the session is no longer valid.
  if (!user || user.status !== 'ACTIVE') return null;

  // A role revoked since the token was signed must not still be honoured.
  const activeRole = user.roles.includes(claims.role) ? claims.role : primaryRole(user.roles);

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
    activeRole,
    permissions: permissionsFor(user.roles),
  };
}

/* ------------------------------------------------------------- assertions */

/**
 * Require a signed-in user.
 *
 * Renders the nearest `unauthorized.tsx` rather than redirecting, so the
 * visitor keeps their place and the URL they asked for.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) unauthorized();
  return user;
}

/** Require a specific permission. Renders `forbidden.tsx` when short. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasPermission(user.permissions, permission)) forbidden();
  return user;
}

export async function requireAnyRole(roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.some((role) => user.roles.includes(role))) forbidden();
  return user;
}

/**
 * Require a seller, and return the store id every seller query must be scoped
 * to. Centralising this is what stops one seller reading another's orders:
 * console queries take `sellerId` from here, never from a request parameter.
 */
export async function requireSeller(): Promise<SessionUser & { sellerId: string }> {
  const user = await requireAnyRole(['SELLER', 'SELLER_STAFF']);
  if (!user.sellerId) forbidden();
  return user as SessionUser & { sellerId: string };
}

/* ---------------------------------------------------------------- cookies */

export async function startSession(user: PublicUser, role?: UserRole): Promise<void> {
  const activeRole = role && user.roles.includes(role) ? role : primaryRole(user.roles);

  const token = await signSession({
    sub: user.id,
    role: activeRole,
    roles: user.roles,
    sellerId: user.sellerId,
    email: user.email,
    name: user.fullName,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(sessionTtlSeconds(activeRole)));
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Switch which role a multi-role session is acting as, e.g. an operations user
 * who also shops. Re-signs the token so the shorter staff TTL is applied.
 */
export async function switchRole(role: UserRole): Promise<boolean> {
  const user = await getSessionUser();
  if (!user || !user.roles.includes(role)) return false;
  await startSession(user, role);
  return true;
}

/* ------------------------------------------------------------------ guest */

/**
 * A stable token for anonymous shoppers, so a guest bag and wishlist survive
 * a reload and can be merged into the account on sign-in.
 *
 * Read-only contexts (Server Components) cannot set cookies, so this mints a
 * token in memory when none exists and leaves persisting it to the next
 * mutation. Server Actions call `ensureGuestToken` instead.
 */
export async function getGuestToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(GUEST_COOKIE)?.value ?? null;
}

/** Guest token, creating and persisting one when absent. Actions/routes only. */
export async function ensureGuestToken(): Promise<string> {
  const store = await cookies();
  const existing = store.get(GUEST_COOKIE)?.value;
  if (existing) return existing;

  const token = randomUUID();
  store.set(GUEST_COOKIE, token, cookieOptions(60 * 60 * 24 * 60));
  return token;
}

export async function clearGuestToken(): Promise<void> {
  const store = await cookies();
  store.delete(GUEST_COOKIE);
}

/**
 * Who owns the current bag or wishlist.
 *
 * Every commerce read and write takes this, so there is exactly one definition
 * of "the current shopper" and guest-to-account conversion has a single seam.
 */
export type Owner =
  | { kind: 'user'; userId: string }
  | { kind: 'guest'; guestToken: string }
  | { kind: 'anonymous' };

export async function currentOwner(): Promise<Owner> {
  const claims = await getSessionClaims();
  if (claims) return { kind: 'user', userId: claims.sub };

  const guestToken = await getGuestToken();
  if (guestToken) return { kind: 'guest', guestToken };

  return { kind: 'anonymous' };
}
