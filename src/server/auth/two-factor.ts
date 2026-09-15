import 'server-only';

import { cookies } from 'next/headers';

import type { AuthChallenge, User } from '@/domain/types';
import { entityId } from '@/lib/ids';

import { collections, toEntity } from '../db/collections';
import { sendOneTimeCodeEmail } from '../email/two-factor';
import { LIMITS, hit, peek, retryMessage } from '../security/rate-limit';
import {
  TWO_FACTOR_COOKIE,
  cookieOptions,
  signTwoFactorPending,
  verifyTwoFactorPending,
} from './jwt';
import {
  CODE_LENGTH,
  MAX_CODE_ATTEMPTS,
  CODE_TTL_SECONDS,
  RESEND_AFTER_SECONDS,
  attemptsLeft,
  checkCode,
  generateCode,
  hashCode,
  maskEmail,
} from './one-time-code';

/**
 * Two-step verification by email: the half that touches the database.
 *
 * `one-time-code` decides whether an answer is right. This module issues codes,
 * counts wrong answers, spends challenges, and carries a half-finished sign-in
 * from the password page to the code page in a cookie of its own.
 *
 * NOTHING HERE IS A SERVER ACTION, and that is the design, not an omission.
 * These functions act for an account the caller has ALREADY proven -- with a
 * password, or with a session -- and a Server Action can be called by anybody
 * with the page open. The actions in `actions/auth` and `actions/two-factor` do
 * the proving, then call in.
 */

export type ChallengePurpose = AuthChallenge['purpose'];

export type SendResult =
  | { ok: true; sentTo: string }
  | { ok: false; error: string; retryAfterSeconds?: number };

type Issued =
  | { ok: true; sentTo: string; challengeId: string }
  | { ok: false; error: string; retryAfterSeconds?: number };

type Recipient = Pick<User, 'id' | 'email' | 'fullName'>;

const DAY_MS = 24 * 60 * 60 * 1000;

async function issue(user: Recipient, purpose: ChallengePurpose, next: string | null): Promise<Issued> {
  // Every code is an email, so sending is budgeted per account whether or not
  // the codes are ever used.
  const limited = await hit(LIMITS.twoFactorSend, user.id);
  if (!limited.allowed) {
    return { ok: false, error: retryMessage(limited), retryAfterSeconds: limited.retryAfterSeconds };
  }

  const challenges = await collections.authChallenges();
  const now = Date.now();
  const stamp = new Date(now).toISOString();

  // One live code per purpose. Two live codes for the same sign-in double a
  // guesser's odds, and a person who asked twice types the newest one anyway.
  await challenges.updateMany(
    { userId: user.id, purpose, consumedAt: null },
    { $set: { consumedAt: stamp } },
  );

  const id = entityId('chl');
  const code = generateCode();
  const expires = now + CODE_TTL_SECONDS * 1000;
  const challenge: AuthChallenge = {
    id,
    userId: user.id,
    purpose,
    codeHash: hashCode(code, id),
    attempts: 0,
    expiresAt: new Date(expires).toISOString(),
    purgeAt: new Date(expires + DAY_MS),
    consumedAt: null,
    sentAt: stamp,
    next,
    createdAt: stamp,
  };
  await challenges.insertOne({ ...challenge, _id: id });

  const sent = await sendOneTimeCodeEmail({ to: user.email, name: user.fullName, code, purpose });
  if (!sent.ok) {
    // A code nobody received must not stay live.
    await challenges.updateOne({ _id: id }, { $set: { consumedAt: new Date().toISOString() } });
    return { ok: false, error: 'The code could not be sent just now. Try again in a minute.' };
  }

  return { ok: true, sentTo: maskEmail(user.email), challengeId: id };
}

async function holdSignIn(challengeId: string, userId: string): Promise<void> {
  const store = await cookies();
  store.set(
    TWO_FACTOR_COOKIE,
    await signTwoFactorPending({ challengeId, userId }, CODE_TTL_SECONDS),
    cookieOptions(CODE_TTL_SECONDS),
  );
}

/* ---------------------------------------------------------------- sign-in */

/**
 * A correct password, on an account with two-step verification on.
 *
 * Sends the code and holds the sign-in. Nothing that belongs to signing in has
 * happened yet: no session, no last-login stamp, no guest bag merged.
 */
export async function startSignInChallenge(user: User, next: string | null): Promise<SendResult> {
  const issued = await issue(user, 'SIGN_IN', next);
  if (!issued.ok) return issued;
  await holdSignIn(issued.challengeId, user.id);
  return { ok: true, sentTo: issued.sentTo };
}

export interface PendingSignIn {
  challenge: AuthChallenge;
  user: User;
}

/**
 * The sign-in waiting for its code, if there is one.
 *
 * Null when the cookie is missing, forged or expired; when the challenge has
 * been spent; or when the account was suspended in the meantime.
 */
export async function readPendingSignIn(): Promise<PendingSignIn | null> {
  const store = await cookies();
  const pending = await verifyTwoFactorPending(store.get(TWO_FACTOR_COOKIE)?.value);
  if (!pending) return null;

  const challenges = await collections.authChallenges();
  const challenge = toEntity(
    await challenges.findOne({ _id: pending.challengeId, userId: pending.userId, purpose: 'SIGN_IN' }),
  );
  if (!challenge || challenge.consumedAt) return null;

  const users = await collections.users();
  const user = toEntity(await users.findOne({ _id: pending.userId }));
  if (!user || user.status !== 'ACTIVE') return null;

  return { challenge, user };
}

export async function clearPendingSignIn(): Promise<void> {
  const store = await cookies();
  store.delete(TWO_FACTOR_COOKIE);
}

/* --------------------------------------------------------------- settings */

/** A code for switching two-step verification on or off, for a signed-in account. */
export async function startSettingsChallenge(
  user: Recipient,
  purpose: Exclude<ChallengePurpose, 'SIGN_IN'>,
): Promise<SendResult> {
  const issued = await issue(user, purpose, null);
  return issued.ok ? { ok: true, sentTo: issued.sentTo } : issued;
}

export async function latestSettingsChallenge(
  userId: string,
  purpose: Exclude<ChallengePurpose, 'SIGN_IN'>,
): Promise<AuthChallenge | null> {
  const challenges = await collections.authChallenges();
  const [latest] = await challenges
    .find({ userId, purpose, consumedAt: null })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  return toEntity(latest ?? null);
}

/* ---------------------------------------------------------------- judging */

export type Verdict =
  | { ok: true }
  | {
      ok: false;
      reason: 'malformed' | 'wrong' | 'expired' | 'spent' | 'limited';
      error: string;
    };

/**
 * Judge an answer, and keep the books the verdict implies.
 *
 *   right     the challenge is spent ATOMICALLY: the same code submitted from
 *             two tabs gets in once.
 *   wrong     one attempt counted on the challenge and against the account;
 *             the fifth spends the challenge.
 *   a typo    nothing counted -- see `malformed` in `one-time-code`.
 */
export async function judgeCode(challenge: AuthChallenge, input: string): Promise<Verdict> {
  const limited = await peek(LIMITS.twoFactorVerify, challenge.userId);
  if (!limited.allowed) return { ok: false, reason: 'limited', error: retryMessage(limited) };

  const challenges = await collections.authChallenges();
  const verdict = checkCode(challenge, input);

  switch (verdict) {
    case 'ok': {
      const spent = await challenges.updateOne(
        { _id: challenge.id, consumedAt: null, attempts: { $lt: MAX_CODE_ATTEMPTS }, expiresAt: { $gt: new Date().toISOString() } },
        { $set: { consumedAt: new Date().toISOString() } },
      );
      return spent.modifiedCount === 1
        ? { ok: true }
        : { ok: false, reason: 'spent', error: 'That code has already been used.' };
    }
    case 'malformed':
      return {
        ok: false,
        reason: 'malformed',
        error: `Enter the ${CODE_LENGTH}-digit code from the email.`,
      };
    case 'expired':
      return { ok: false, reason: 'expired', error: 'That code has expired. Send yourself a new one.' };
    case 'used':
    case 'locked':
      return { ok: false, reason: 'spent', error: 'That code no longer works. Send yourself a new one.' };
    case 'wrong':
      break;
  }

  await hit(LIMITS.twoFactorVerify, challenge.userId);
  const counted = await challenges.findOneAndUpdate(
    { _id: challenge.id, consumedAt: null },
    { $inc: { attempts: 1 } },
    { returnDocument: 'after' },
  );
  const left = attemptsLeft(counted?.attempts ?? Number.POSITIVE_INFINITY);

  if (left === 0) {
    await challenges.updateOne(
      { _id: challenge.id },
      { $set: { consumedAt: new Date().toISOString() } },
    );
    return { ok: false, reason: 'spent', error: 'Too many wrong codes, so that one no longer works.' };
  }

  return {
    ok: false,
    reason: 'wrong',
    error: `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
  };
}

/* ---------------------------------------------------------------- resending */

/** When the next code may be sent, for the countdown beside the resend button. */
export function resendAvailableAt(challenge: AuthChallenge): string {
  return new Date(Date.parse(challenge.sentAt) + RESEND_AFTER_SECONDS * 1000).toISOString();
}

/**
 * A fresh code for a challenge still in progress.
 *
 * No sooner than thirty seconds after the last one: impatient double-taps
 * should not become a pile of emails, each invalidating the one before it.
 */
export async function resendChallenge(challenge: AuthChallenge, user: User): Promise<SendResult> {
  const waitMs = Date.parse(challenge.sentAt) + RESEND_AFTER_SECONDS * 1000 - Date.now();
  if (waitMs > 0) {
    const seconds = Math.ceil(waitMs / 1000);
    return {
      ok: false,
      error: `You can ask for another code in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`,
      retryAfterSeconds: seconds,
    };
  }

  const issued = await issue(user, challenge.purpose, challenge.next);
  if (!issued.ok) return issued;
  if (challenge.purpose === 'SIGN_IN') await holdSignIn(issued.challengeId, user.id);
  return { ok: true, sentTo: issued.sentTo };
}
