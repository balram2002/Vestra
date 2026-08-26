import 'server-only';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { forbidden, redirect, unauthorized } from 'next/navigation';

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
/**
 * A seller account, whatever state its application is in.
 *
 * Used by the onboarding screen itself, which somebody halfway through
 * applying has to be able to reach.
 */
export async function requireSellerAccount(): Promise<SessionUser & { sellerId: string }> {
  const user = await requireAnyRole(['SELLER', 'SELLER_STAFF']);
  if (!user.sellerId) forbidden();
  return user as SessionUser & { sellerId: string };
}

/**
 * A seller who may actually trade.
 *
 * The role says they own a store; it does not say the store was approved. An
 * applicant gets the SELLER role the moment they apply — otherwise they could
 * not reach the screen that asks for their documents — so the console has to
 * check the STATUS as well, or an unverified store would be able to list
 * products and take orders.
 *
 * A pending applicant is redirected rather than forbidden: they have somewhere
 * useful to be, and it is one click of work away.
 */
export async function requireSeller(): Promise<SessionUser & { sellerId: string }> {
  const user = await requireSellerAccount();

  const { collections } = await import('../db/collections');
  const sellers = await collections.sellers();
  const store = await sellers.findOne(
    { _id: user.sellerId },
    { projection: { status: 1 } },
  );

  // Staff opening a seller console for support work are not the seller, and
  // are not blocked by the seller's own onboarding state.
  const isStaff = user.roles.some((role) =>
    ['ADMIN', 'SUPER_ADMIN', 'OPERATIONS', 'SUPPORT'].includes(role),
  );

  if (!isStaff && store && store.status !== 'ACTIVE' && store.status !== 'APPROVED') {
    redirect('/seller/onboarding');
  }

  return user;
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

/**
 * Re-sign the session token from the database.
 *
 * The token carries a SNAPSHOT of the user's roles, and `proxy.ts` routes on
 * that snapshot because it deliberately cannot reach the database. So anything
 * that grants a role has to reissue the token, or the holder keeps being routed
 * as who they were when they signed in: a fresh applicant would be bounced off
 * their own onboarding screen until they signed out and back in.
 *
 * Silently does nothing when there is no session to refresh — the caller has
 * already established who is acting, and a missing cookie here is a signed-out
 * user, not an error worth raising.
 */
export async function refreshSession(role?: UserRole): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await startSession(user, role ?? user.activeRole);
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

/**
 * Orders a guest placed from this browser.
 *
 * A guest has no account, so there is nothing to scope an order lookup to.
 * Rather than making order numbers guessable-and-readable — which would let
 * anyone enumerate strangers' addresses and phone numbers — the ids of orders
 * placed in this browser are kept in an httpOnly cookie, and that is the only
 * thing that grants access. Losing the cookie means the order can still be
 * reached, but only through support or by claiming it with the email it was
 * placed under.
 */
const GUEST_ORDERS_COOKIE = 'vestra_guest_orders';

export async function guestOrderIds(): Promise<string[]> {
  const store = await cookies();
  const raw = store.get(GUEST_ORDERS_COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function rememberGuestOrder(orderId: string): Promise<void> {
  const store = await cookies();
  const existing = await guestOrderIds();
  // Keep the last few, so a shared machine does not accumulate strangers'
  // orders indefinitely.
  const next = [orderId, ...existing.filter((id) => id !== orderId)].slice(0, 10);
  store.set(GUEST_ORDERS_COOKIE, JSON.stringify(next), cookieOptions(60 * 60 * 24 * 30));
}

export async function ownsGuestOrder(orderId: string): Promise<boolean> {
  return (await guestOrderIds()).includes(orderId);
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
