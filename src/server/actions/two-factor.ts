'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { TwoFactorSettings, User } from '@/domain/types';

import { completeSignIn } from '../auth/complete-sign-in';
import { requireUser } from '../auth/session';
import {
  clearPendingSignIn,
  judgeCode,
  latestSettingsChallenge,
  readPendingSignIn,
  resendChallenge,
  startSettingsChallenge,
  type Verdict,
} from '../auth/two-factor';
import { collections, toEntity } from '../db/collections';
import { sendTwoFactorChangedEmail } from '../email/two-factor';
import { record } from '../services/audit';

/**
 * Two-step verification: the actions behind the code page and the profile.
 *
 * Every action here proves who is asking BEFORE it touches a challenge: the
 * sign-in ones by the signed pending cookie a correct password set, the
 * settings ones by the session. `auth/two-factor` never does that proving
 * itself, which is why none of it is exported as an action.
 */

export interface CodeResult {
  ok: boolean;
  error?: string;
  /** The message belongs under the code field rather than above the form. */
  field?: 'code';
  /** This attempt can no longer finish here; start it again. */
  restart?: boolean;
  /** The masked address a code was sent to. */
  sentTo?: string;
  retryAfterSeconds?: number;
}

const TIMED_OUT = 'This sign-in has timed out. Enter your password again to get a new code.';

function failure(verdict: Exclude<Verdict, { ok: true }>): CodeResult {
  return {
    ok: false,
    error: verdict.error,
    field: verdict.reason === 'wrong' || verdict.reason === 'malformed' ? 'code' : undefined,
    restart: verdict.reason === 'spent',
  };
}

/* ---------------------------------------------------------------- sign-in */

export async function verifySignInCode(input: { code: string }): Promise<CodeResult> {
  const pending = await readPendingSignIn();
  if (!pending) {
    await clearPendingSignIn();
    return { ok: false, restart: true, error: TIMED_OUT };
  }

  const verdict = await judgeCode(pending.challenge, String(input.code ?? ''));
  if (!verdict.ok) {
    if (verdict.reason !== 'spent') return failure(verdict);
    // Five wrong codes send someone back to the password, not to another code:
    // a guesser should have to know the password again for every five guesses.
    await clearPendingSignIn();
    return { ok: false, restart: true, error: `${verdict.error} Enter your password again to get a new code.` };
  }

  await clearPendingSignIn();
  redirect(await completeSignIn(pending.user, pending.challenge.next));
}

export async function resendSignInCode(): Promise<CodeResult> {
  const pending = await readPendingSignIn();
  if (!pending) return { ok: false, restart: true, error: TIMED_OUT };

  const sent = await resendChallenge(pending.challenge, pending.user);
  return sent.ok
    ? { ok: true, sentTo: sent.sentTo }
    : { ok: false, error: sent.error, retryAfterSeconds: sent.retryAfterSeconds };
}

/** "Use a different account": forget the half-finished sign-in. */
export async function cancelSignIn(): Promise<void> {
  await clearPendingSignIn();
  redirect('/login');
}

/* --------------------------------------------------------------- settings */

async function accountFor(userId: string): Promise<User | null> {
  const users = await collections.users();
  return toEntity(await users.findOne({ _id: userId }));
}

function purposeFor(enable: boolean): 'ENABLE_TWO_FACTOR' | 'DISABLE_TWO_FACTOR' {
  return enable ? 'ENABLE_TWO_FACTOR' : 'DISABLE_TWO_FACTOR';
}

/**
 * Start switching two-step verification on or off.
 *
 * Both directions need a code from the inbox, not only a session. A session
 * left open on a shared computer must not be enough to turn protection off,
 * and switching it on proves the address works before sign-in starts to
 * depend on it.
 */
export async function requestTwoFactorChange(input: { enable: boolean }): Promise<CodeResult> {
  const session = await requireUser();
  const user = await accountFor(session.id);
  if (!user) return { ok: false, error: 'Your account could not be found.' };

  const enabled = Boolean(user.twoFactor?.enabled);
  if (Boolean(input.enable) === enabled) {
    return {
      ok: false,
      error: enabled ? 'Two-step verification is already on.' : 'Two-step verification is already off.',
    };
  }

  const sent = await startSettingsChallenge(user, purposeFor(Boolean(input.enable)));
  return sent.ok
    ? { ok: true, sentTo: sent.sentTo }
    : { ok: false, error: sent.error, retryAfterSeconds: sent.retryAfterSeconds };
}

export async function resendTwoFactorChangeCode(input: { enable: boolean }): Promise<CodeResult> {
  const session = await requireUser();
  const user = await accountFor(session.id);
  if (!user) return { ok: false, error: 'Your account could not be found.' };

  const challenge = await latestSettingsChallenge(user.id, purposeFor(Boolean(input.enable)));
  if (!challenge) return requestTwoFactorChange(input);

  const sent = await resendChallenge(challenge, user);
  return sent.ok
    ? { ok: true, sentTo: sent.sentTo }
    : { ok: false, error: sent.error, retryAfterSeconds: sent.retryAfterSeconds };
}

export async function confirmTwoFactorChange(input: {
  enable: boolean;
  code: string;
}): Promise<CodeResult> {
  const session = await requireUser();
  const user = await accountFor(session.id);
  if (!user) return { ok: false, error: 'Your account could not be found.' };

  const enable = Boolean(input.enable);
  const challenge = await latestSettingsChallenge(user.id, purposeFor(enable));
  if (!challenge) {
    return { ok: false, restart: true, error: 'That code no longer works. Send yourself a new one.' };
  }

  const verdict = await judgeCode(challenge, String(input.code ?? ''));
  if (!verdict.ok) return { ...failure(verdict), restart: verdict.reason === 'spent' || verdict.reason === 'expired' };

  const now = new Date().toISOString();
  const settings: TwoFactorSettings = { enabled: enable, method: 'EMAIL', enabledAt: enable ? now : null };

  const users = await collections.users();
  await users.updateOne(
    { _id: user.id },
    {
      $set: {
        twoFactor: settings,
        // A code that reached the inbox is proof the address works.
        ...(enable ? { emailVerified: true } : {}),
        updatedAt: now,
      },
    },
  );

  await record({
    actor: session,
    action: enable ? 'account.two_factor.enable' : 'account.two_factor.disable',
    entityType: 'user',
    entityId: user.id,
    entityLabel: user.email,
    changes: [{ field: 'twoFactor.enabled', before: Boolean(user.twoFactor?.enabled), after: enable }],
    // Turning protection OFF is the step an intruder takes first.
    severity: enable ? 'INFO' : 'NOTICE',
  });

  await sendTwoFactorChangedEmail({ to: user.email, name: user.fullName, enabled: enable });

  revalidatePath('/account/profile');
  return { ok: true };
}
