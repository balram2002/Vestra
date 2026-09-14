'use server';

import { redirect } from 'next/navigation';

import { defaultNotificationPreferences } from '@/domain/notifications';
import type { User } from '@/domain/types';
import { entityId } from '@/lib/ids';
import {
  loginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  registerSchema,
} from '@/lib/validation/auth';

import { completeSignIn } from '../auth/complete-sign-in';
import { hashPassword, needsRehash, verifyPassword } from '../auth/password';
import { endSession } from '../auth/session';
import { startSignInChallenge } from '../auth/two-factor';
import { collections, toEntity } from '../db/collections';
import { LIMITS, clientIp, hitAll, peekAll, retryMessage } from '../security/rate-limit';

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

function duplicateKeyField(error: unknown): 'email' | 'phone' | null {
  if (!error || typeof error !== 'object' || (error as { code?: number }).code !== 11000) {
    return null;
  }

  const keyPattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern;
  if (keyPattern?.email || keyPattern?.email === 1) return 'email';
  if (keyPattern?.phone || keyPattern?.phone === 1) return 'phone';

  const message = error instanceof Error ? error.message : '';
  if (message.includes('uniq_email') || message.includes('email_1')) return 'email';
  if (message.includes('uniq_phone') || message.includes('phone_1')) return 'phone';
  return null;
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

  // Checked before any real work, so a locked-out guesser costs one small read.
  const ip = await clientIp();
  const limited = await peekAll([
    [LIMITS.signInByEmail, parsed.data.email],
    [LIMITS.signInByIp, ip],
  ]);
  if (!limited.allowed) return { ok: false, error: retryMessage(limited) };

  const users = await collections.users();
  const user = toEntity(await users.findOne({ email: parsed.data.email }));

  // Same message, same work, whether the account exists or the password is
  // wrong. `verifyPassword` burns an equivalent derivation on a missing user so
  // the two paths cannot be told apart by timing either.
  const generic = 'That email and password do not match.';

  // Only FAILURES spend the budget: a person signing in correctly is never
  // slowed, while guessing a password runs out after a handful of tries.
  const failed = async (): Promise<AuthResult> => {
    await hitAll([
      [LIMITS.signInByEmail, parsed.data.email],
      [LIMITS.signInByIp, ip],
    ]);
    return { ok: false, error: generic };
  };

  if (!user) {
    await verifyPassword(parsed.data.password, 'invalid$0$$');
    return failed();
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) return failed();

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

  /*
   * Two-step verification.
   *
   * A correct password earns the second question and nothing more. No session,
   * no last-login stamp, no guest bag merged: all of that waits for the code,
   * on the page this redirects to. See `auth/two-factor`.
   */
  if (user.twoFactor?.enabled) {
    const started = await startSignInChallenge(user, parsed.data.next ?? null);
    if (!started.ok) return { ok: false, error: started.error };
    redirect('/login/verify');
  }

  redirect(await completeSignIn(user, parsed.data.next));
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

  const limited = await hitAll([[LIMITS.register, await clientIp()]]);
  if (!limited.allowed) return { ok: false, error: retryMessage(limited) };

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
      notifications: defaultNotificationPreferences(),
      marketingOptIn: parsed.data.marketingOptIn,
      theme: 'system',
      preferredSizes: {},
      language: 'en-IN',
      currency: 'INR',
    },
  };

  try {
    await users.insertOne({ ...user, _id: user.id });
  } catch (error) {
    // The unique indexes are the real guard against concurrent signups. Only
    // report an existing account when Mongo confirms which unique key collided.
    const field = duplicateKeyField(error);
    if (field === 'email') {
      return {
        ok: false,
        fieldErrors: { email: 'An account with this email already exists.' },
        error: 'An account with this email already exists.',
      };
    }
    if (field === 'phone') {
      return {
        ok: false,
        fieldErrors: { phone: 'An account with this phone number already exists.' },
        error: 'An account with this phone number already exists.',
      };
    }

    console.error('[vestrawab:auth] could not create account', error);
    return { ok: false, error: 'We could not create your account right now. Please try again.' };
  }

  // The same last step as every sign-in, so a new account keeps its guest bag.
  const destination = await completeSignIn(user);

  /*
   * Send the confirmation, but do not make signup wait on it. A mail server
   * having a slow minute must not turn a successful registration into an error
   * the person cannot act on — they are signed in either way, and the account
   * page carries a prompt to resend.
   */
  void issueAndSendVerification(user.id, user.email, user.fullName);

  redirect(destination);
}


/* ------------------------------------------------------- email verification */

/**
 * Mint a verification token and mail it.
 *
 * Shared by signup and by the resend button so the two cannot drift — issuing
 * a token consumes any earlier one, which is what stops an older link in an
 * inbox staying live after a resend.
 */
async function issueAndSendVerification(
  userId: string,
  email: string,
  fullName: string,
): Promise<void> {
  try {
    const { issueToken } = await import('../auth/tokens');
    const { sendVerificationEmail } = await import('../email/account');
    const token = await issueToken(userId, 'EMAIL_VERIFICATION');
    await sendVerificationEmail({ to: email, name: fullName, token });
  } catch (error) {
    console.error('[vestrawab:auth] could not send a verification email', error);
  }
}

export async function resendVerificationEmail(): Promise<AuthResult> {
  const { getSessionUser } = await import('../auth/session');
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'Sign in first.' };
  if (user.emailVerified) return { ok: true };

  await issueAndSendVerification(user.id, user.email, user.fullName);
  return { ok: true };
}

/**
 * Confirm an address from the link in the email.
 *
 * Idempotent from the reader's point of view: a link clicked twice reports
 * success the second time if the address is already confirmed, because telling
 * someone their working email "is not valid" is worse than useless.
 */
export async function verifyEmail(token: string): Promise<AuthResult> {
  const { consumeToken, tokenFailureMessage } = await import('../auth/tokens');

  const result = await consumeToken(token, 'EMAIL_VERIFICATION');
  if (!result.ok) return { ok: false, error: tokenFailureMessage(result.reason) };

  const users = await collections.users();
  await users.updateOne(
    { _id: result.userId },
    { $set: { emailVerified: true, updatedAt: new Date().toISOString() } },
  );

  return { ok: true };
}

/* ----------------------------------------------------------- password reset */

/**
 * Start a reset.
 *
 * Always reports success, whether or not the address exists. Saying "no account
 * with that email" turns this form into an account-enumeration oracle — the
 * same reason the sign-in form never says which half was wrong.
 */
export async function requestPasswordReset(input: { email: string }): Promise<AuthResult> {
  const parsed = passwordResetRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: { email: 'Enter a valid email address.' } };
  }

  // Each request sends an email. The budget is per address AND per caller, so
  // nobody can bury a stranger's inbox in reset links.
  const limited = await hitAll([
    [LIMITS.passwordResetByEmail, parsed.data.email],
    [LIMITS.passwordResetByIp, await clientIp()],
  ]);
  if (!limited.allowed) return { ok: false, error: retryMessage(limited) };

  const users = await collections.users();
  const user = toEntity(await users.findOne({ email: parsed.data.email }));

  if (user && user.status === 'ACTIVE') {
    try {
      const { issueToken } = await import('../auth/tokens');
      const { sendPasswordResetEmail } = await import('../email/account');
      const token = await issueToken(user.id, 'PASSWORD_RESET');
      await sendPasswordResetEmail({ to: user.email, name: user.fullName, token });
    } catch (error) {
      console.error('[vestrawab:auth] could not send a reset email', error);
    }
  }

  return { ok: true };
}

export async function resetPassword(input: {
  token: string;
  password: string;
}): Promise<AuthResult> {
  const parsed = passwordResetSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, fieldErrors: { password: parsed.error.issues[0]?.message ?? 'Check the password.' } };
  }

  const { consumeToken, tokenFailureMessage } = await import('../auth/tokens');
  const result = await consumeToken(parsed.data.token, 'PASSWORD_RESET');
  if (!result.ok) return { ok: false, error: tokenFailureMessage(result.reason) };

  const users = await collections.users();
  const user = toEntity(await users.findOne({ _id: result.userId }));
  if (!user) return { ok: false, error: 'That account no longer exists.' };

  await users.updateOne(
    { _id: user.id },
    {
      $set: {
        passwordHash: await hashPassword(parsed.data.password),
        /*
         * Reaching the reset link proves the address works, so confirming it
         * here saves the person a second round trip for the same proof.
         */
        emailVerified: true,
        updatedAt: new Date().toISOString(),
      },
    },
  );

  /*
   * Tell them it changed. If the reset was not theirs, this mail is the only
   * signal they will get, so it goes to the address on the account regardless
   * of who just used the link.
   */
  try {
    const { sendPasswordChangedEmail } = await import('../email/account');
    await sendPasswordChangedEmail({ to: user.email, name: user.fullName });
  } catch (error) {
    console.error('[vestrawab:auth] could not send a password-changed email', error);
  }

  return { ok: true };
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect('/');
}
