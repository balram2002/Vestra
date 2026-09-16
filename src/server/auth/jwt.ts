import { jwtVerify, SignJWT } from 'jose';

import { ACCOUNTS } from '@/config/business';
import type { UserRole } from '@/domain/types';

/**
 * Session tokens.
 *
 * Deliberately free of any Node-only or database import. `proxy.ts` runs at
 * the network boundary and must be able to decide "signed in or not" without
 * pulling in the Mongo driver, so token verification lives here on its own and
 * everything stateful lives in `session.ts`.
 *
 * What the token carries is intentionally minimal: identity and the role being
 * acted as. Permissions are NOT in the token -- they are re-derived from the
 * role on the server every time, so revoking a permission takes effect on the
 * next request instead of whenever the token happens to expire.
 */

export const SESSION_COOKIE = 'vestra_session';
export const SESSION_HINT_COOKIE = 'vestra_session_hint';
export const GUEST_COOKIE = 'vestra_guest';

export interface SessionClaims {
  /** User id. */
  sub: string;
  /** The role this session is currently acting as. */
  role: UserRole;
  /** Every role the user holds, so consoles can offer a role switcher. */
  roles: UserRole[];
  /** Set for sellers and seller staff; scopes every query they make. */
  sellerId: string | null;
  email: string;
  name: string;
}

const ISSUER = 'vestra';
const AUDIENCE = 'vestra:web';

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      '[vestrawab:auth] AUTH_SECRET is missing or too short. Set it in .env.local (32+ random characters).',
    );
  }
  return new TextEncoder().encode(value);
}

/** Staff and seller sessions are deliberately shorter-lived than shopper ones. */
export function sessionTtlSeconds(role: UserRole): number {
  const isPrivileged = role !== 'CUSTOMER';
  return isPrivileged
    ? ACCOUNTS.staffSessionTtlHours * 60 * 60
    : ACCOUNTS.sessionTtlDays * 24 * 60 * 60;
}

export async function signSession(claims: SessionClaims): Promise<string> {
  const ttl = sessionTtlSeconds(claims.role);

  return new SignJWT({
    role: claims.role,
    roles: claims.roles,
    sellerId: claims.sellerId,
    email: claims.email,
    name: claims.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(secret());
}

/**
 * Verify and decode. Returns null for anything untrustworthy -- expired,
 * tampered, wrong issuer -- so callers treat "bad token" and "no token"
 * identically and never branch on the reason.
 */
export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (!payload.sub || typeof payload.role !== 'string') return null;

    return {
      sub: payload.sub,
      role: payload.role as UserRole,
      roles: (payload.roles as UserRole[]) ?? [],
      sellerId: (payload.sellerId as string | null) ?? null,
      email: (payload.email as string) ?? '',
      name: (payload.name as string) ?? '',
    };
  } catch {
    return null;
  }
}

/** Cookie attributes shared by the session and guest cookies. */
export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/* ------------------------------------------------------- two-step sign-in */

/**
 * The half-finished sign-in between a correct password and a correct code.
 *
 * Its own cookie and its own audience, so it can never pass for a session: a
 * token that proves only "the password was right" must not open a single page
 * a session opens, and a session token must not stand in for it either. It
 * names the challenge and the account, and lives exactly as long as the code.
 */
export const TWO_FACTOR_COOKIE = 'vestra_2fa';
const TWO_FACTOR_AUDIENCE = 'vestra:2fa';

export interface TwoFactorPending {
  challengeId: string;
  userId: string;
}

export async function signTwoFactorPending(
  pending: TwoFactorPending,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT({ cid: pending.challengeId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(pending.userId)
    .setIssuer(ISSUER)
    .setAudience(TWO_FACTOR_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret());
}

export async function verifyTwoFactorPending(
  token: string | undefined,
): Promise<TwoFactorPending | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: TWO_FACTOR_AUDIENCE,
    });
    if (!payload.sub || typeof payload.cid !== 'string') return null;
    return { challengeId: payload.cid, userId: payload.sub };
  } catch {
    return null;
  }
}
