'use server';

import { redirect } from 'next/navigation';

import type { PublicUser, User } from '@/domain/types';
import { entityId } from '@/lib/ids';
import { loginSchema, registerSchema } from '@/lib/validation/auth';

import { hashPassword, needsRehash, verifyPassword } from '../auth/password';
import { landingPathFor } from '../auth/rbac';
import {
  clearGuestToken,
  endSession,
  getGuestToken,
  startSession,
} from '../auth/session';
import { collections, toEntity } from '../db/collections';
import { mergeGuestCart } from '../services/cart';
import { mergeGuestWishlist } from '../services/wishlist';

/**
 * Authentication actions.
 *
 * Failures return a message rather than throwing, so the form can render it
 * beside the fields. The one thing never revealed is WHICH half was wrong:
 * "email not found" turns the sign-in form into an account-enumeration oracle.
 */

export interface AuthResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/** A safe projection. The password hash must never leave this module. */
function toPublicUser(user: User): PublicUser {
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

/** Only relative, single-slash paths — an open redirect is a phishing vector. */
function safeNext(next: string | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  return next;
}

export async function signIn(input: {
  email: string;
  password: string;
  next?: string;
}): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Check the details below and try again.' };
  }

  const users = await collections.users();
  const user = toEntity(await users.findOne({ email: parsed.data.email }));

  // Same message, same work, whether the account exists or the password is
  // wrong. `verifyPassword` burns an equivalent derivation on a missing user so
  // the two paths cannot be told apart by timing either.
  const generic = 'That email and password do not match.';

  if (!user) {
    await verifyPassword(parsed.data.password, 'invalid$0$$');
    return { ok: false, error: generic };
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) return { ok: false, error: generic };

  if (user.status === 'SUSPENDED') {
    return {
      ok: false,
      error: 'This account has been suspended. Contact support if you think that is a mistake.',
    };
  }
  if (user.status !== 'ACTIVE') {
    return { ok: false, error: 'This account is not active yet. Check your email to finish setting it up.' };
  }

  // Transparently upgrade a hash made with an older work factor.
  if (needsRehash(user.passwordHash)) {
    const upgraded = await hashPassword(parsed.data.password);
    await users.updateOne({ _id: user.id }, { $set: { passwordHash: upgraded } });
  }

  await users.updateOne(
    { _id: user.id },
    { $set: { lastLoginAt: new Date().toISOString() } },
  );

  // Carry the guest bag and wishlist across, BEFORE the session starts, so the
  // merge is attributable to the right owner. Losing either at sign-in is one
  // of the most common ways an e-commerce funnel leaks.
  const guestToken = await getGuestToken();
  if (guestToken) {
    await mergeGuestCart(guestToken, user.id);
    await mergeGuestWishlist(guestToken, user.id);
    await clearGuestToken();
  }

  await startSession(toPublicUser(user));

  redirect(safeNext(parsed.data.next) ?? landingPathFor(user.roles));
}

export async function register(input: {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  marketingOptIn?: boolean;
}): Promise<AuthResult> {
  const parsed = registerSchema.safeParse({
    ...input,
    marketingOptIn: input.marketingOptIn ?? false,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: 'Check the details below.', fieldErrors };
  }

  const users = await collections.users();

  const existing = await users.findOne({ email: parsed.data.email });
  if (existing) {
    return {
      ok: false,
      fieldErrors: { email: 'An account with this email already exists.' },
      error: 'An account with this email already exists.',
    };
  }

  const now = new Date().toISOString();
  const user: User = {
    id: entityId('usr'),
    email: parsed.data.email,
    emailVerified: false,
    phone: parsed.data.phone ? parsed.data.phone : null,
    phoneVerified: false,
    fullName: parsed.data.fullName,
    passwordHash: await hashPassword(parsed.data.password),
    roles: ['CUSTOMER'],
    status: 'ACTIVE',
    avatarUrl: null,
    gender: null,
    dateOfBirth: null,
    sellerId: null,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
    creditBalance: 0,
    preferences: {
      notifications: {},
      marketingOptIn: parsed.data.marketingOptIn,
      theme: 'system',
      preferredSizes: {},
      language: 'en-IN',
      currency: 'INR',
    },
  };

  try {
    await users.insertOne({ ...user, _id: user.id });
  } catch {
    // The unique index is the real guard: two simultaneous signups with the
    // same email both pass the check above, and only one can pass this.
    return {
      ok: false,
      fieldErrors: { email: 'An account with this email already exists.' },
      error: 'An account with this email already exists.',
    };
  }

  const guestToken = await getGuestToken();
  if (guestToken) {
    await mergeGuestCart(guestToken, user.id);
    await mergeGuestWishlist(guestToken, user.id);
    await clearGuestToken();
  }

  await startSession(toPublicUser(user));
  redirect('/');
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect('/');
}
