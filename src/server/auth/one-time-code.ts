import 'server-only';

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { ACCOUNTS } from '@/config/business';

/**
 * One-time codes.
 *
 * The second step of signing in, and the proof of a mailbox behind turning
 * two-step verification on or off.
 *
 * A CODE RATHER THAN A LINK. A link finishes signing in wherever it is opened,
 * which is often a different device from the one being signed in to -- and a
 * mail client that prefetches links would spend it before anyone clicked. A
 * code is typed into the very page that asked for it, so the session lands
 * where the person is.
 *
 * THE RULES, EACH FOR A REASON
 *
 *   1. ONLY A KEYED HASH IS STORED. Six digits are a million possibilities, so
 *      a plain SHA-256 of a code is reversed by trying all of them in well under
 *      a second. An HMAC under the server's secret cannot be, without the
 *      secret. The challenge id is part of the message, so a code is only ever
 *      good for the challenge it was sent for.
 *   2. FIVE WRONG ANSWERS SPEND THE CHALLENGE. Guessing needs a fresh code, and
 *      fresh codes are rate-limited per account.
 *   3. TEN MINUTES, USED ONCE.
 *   4. COMPARED IN CONSTANT TIME.
 *
 * The judging is pure, so the rules are tested without a database. Counting an
 * attempt and spending a challenge are the caller's writes.
 */

export const CODE_LENGTH: number = ACCOUNTS.otpLength;
export const CODE_TTL_SECONDS = ACCOUNTS.otpTtlMinutes * 60;
export const MAX_CODE_ATTEMPTS = 5;
/** How long before another code may be sent for the same challenge. */
export const RESEND_AFTER_SECONDS = 30;

export function generateCode(length: number = CODE_LENGTH): string {
  let code = '';
  // `randomInt` is uniform and cryptographically random. `Math.random` is
  // neither, and modulo arithmetic on random bytes would skew toward low digits.
  for (let index = 0; index < length; index += 1) code += String(randomInt(0, 10));
  return code;
}

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error('[vestrawab:auth] AUTH_SECRET is missing or too short.');
  }
  return value;
}

export function hashCode(code: string, challengeId: string, key: string = secret()): string {
  return createHmac('sha256', key).update(`${challengeId}:${code}`).digest('hex');
}

/** What a person typed, as digits: "123 456" and "123-456" are the same code. */
export function normaliseCode(input: string): string {
  return input.replace(/[\s-]/g, '');
}

export interface ChallengeState {
  id: string;
  codeHash: string;
  attempts: number;
  expiresAt: string;
  consumedAt: string | null;
}

/**
 * The verdict on an answer.
 *
 * `malformed` is separate from `wrong` on purpose: five digits, or a stray
 * letter, is a typo the form can point at, and it must not cost one of the five
 * attempts.
 */
export type CodeCheck = 'ok' | 'wrong' | 'expired' | 'used' | 'locked' | 'malformed';

export function checkCode(
  challenge: ChallengeState,
  input: string,
  now: number = Date.now(),
  key?: string,
): CodeCheck {
  if (challenge.consumedAt) return 'used';
  if (challenge.attempts >= MAX_CODE_ATTEMPTS) return 'locked';
  if (Date.parse(challenge.expiresAt) <= now) return 'expired';

  const code = normaliseCode(input);
  if (code.length !== CODE_LENGTH || !/^\d+$/.test(code)) return 'malformed';

  const expected = Buffer.from(challenge.codeHash, 'hex');
  const actual = Buffer.from(hashCode(code, challenge.id, key), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? 'ok' : 'wrong';
}

export function attemptsLeft(attempts: number): number {
  return Math.max(0, MAX_CODE_ATTEMPTS - attempts);
}

/** "an•••••@example.com": enough to recognise the inbox, not enough to harvest it. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return email;
  const shown = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${shown}${'•'.repeat(Math.max(3, local.length - shown.length))}@${domain}`;
}

/** "123 456": how a code is printed in an email, for a person reading and typing it. */
export function formatCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
