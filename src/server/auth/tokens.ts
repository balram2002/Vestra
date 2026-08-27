import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { TOKEN_TTL } from '@/config/email';

import { collections, toEntity } from '../db/collections';

/**
 * Single-use, expiring tokens for email links.
 *
 * Three rules, each of which exists because of a specific failure:
 *
 *   1. ONLY A HASH IS STORED. A reset token is a credential; a database dump
 *      or a stray log line containing the raw value would let anyone take over
 *      any account whose token had not yet expired. SHA-256 is right here
 *      rather than a password hash — the token is 32 random bytes, so there is
 *      no dictionary to attack and nothing for a slow KDF to buy.
 *   2. CONSUMED ON USE. A reset link that still works after the password has
 *      been changed is a reset link sitting in an inbox that may not be the
 *      owner's any more.
 *   3. COMPARED IN CONSTANT TIME. Comparing hashes with `===` leaks their
 *      prefix through timing.
 */

export type TokenPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function ttlFor(purpose: TokenPurpose): number {
  return purpose === 'PASSWORD_RESET' ? TOKEN_TTL.passwordReset : TOKEN_TTL.emailVerification;
}

/**
 * Mint a token and return the RAW value, which is the only time it exists.
 *
 * Any outstanding token for the same purpose is consumed first: asking for a
 * new verification link should invalidate the old one, or a forwarded earlier
 * mail stays live for its full window.
 */
export async function issueToken(userId: string, purpose: TokenPurpose): Promise<string> {
  const tokens = await collections.authTokens();

  await tokens.updateMany(
    { userId, purpose, consumedAt: null },
    { $set: { consumedAt: new Date().toISOString() } },
  );

  // 32 bytes, URL-safe. Long enough that guessing is not a threat model.
  const raw = randomBytes(32).toString('base64url');
  const now = Date.now();

  const digest = hash(raw);
  await tokens.insertOne({
    _id: digest,
    id: digest,
    userId,
    purpose,
    hash: digest,
    expiresAt: new Date(now + ttlFor(purpose) * 1000).toISOString(),
    consumedAt: null,
    createdAt: new Date(now).toISOString(),
  });

  return raw;
}

export type TokenResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'unknown' | 'expired' | 'used' };

/**
 * Check a token and consume it.
 *
 * Verification and consumption are one operation on purpose: splitting them
 * leaves a window in which the same link works twice, which for a password
 * reset is the whole vulnerability.
 */
export async function consumeToken(raw: string, purpose: TokenPurpose): Promise<TokenResult> {
  if (!raw) return { ok: false, reason: 'unknown' };

  const tokens = await collections.authTokens();
  const candidate = hash(raw);
  const record = toEntity(await tokens.findOne({ _id: candidate, purpose }));

  if (!record) return { ok: false, reason: 'unknown' };

  // Constant-time, even though the lookup above already matched: the comparison
  // is what the rule is about, and a future change to the lookup must not
  // silently remove it.
  const a = Buffer.from(record.hash, 'hex');
  const b = Buffer.from(candidate, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'unknown' };

  if (record.consumedAt) return { ok: false, reason: 'used' };
  if (new Date(record.expiresAt).getTime() < Date.now()) return { ok: false, reason: 'expired' };

  const consumed = await tokens.updateOne(
    { _id: record.id, consumedAt: null },
    { $set: { consumedAt: new Date().toISOString() } },
  );

  /*
   * Lost the race. Two requests arriving together — a mail client prefetching
   * the link, then the person clicking it — must not both succeed.
   */
  if (consumed.modifiedCount !== 1) return { ok: false, reason: 'used' };

  return { ok: true, userId: record.userId };
}

/** Why a link did not work, phrased for the person holding it. */
export function tokenFailureMessage(reason: 'unknown' | 'expired' | 'used'): string {
  switch (reason) {
    case 'expired':
      return 'That link has expired. Ask for a new one and we will send it straight away.';
    case 'used':
      return 'That link has already been used. Ask for a new one if you still need it.';
    default:
      return 'That link is not valid. Check you copied all of it, or ask for a new one.';
  }
}
