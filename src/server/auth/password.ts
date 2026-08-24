import 'server-only';

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Password hashing.
 *
 * scrypt from Node's own crypto module rather than a bcrypt binding: it is
 * memory-hard, needs no native compilation step, and is the algorithm Node
 * ships specifically for this job.
 *
 * The stored format is self-describing --
 *
 *     scrypt$<N>$<salt-hex>$<hash-hex>
 *
 * so the work factor can be raised later without invalidating existing
 * passwords: old hashes keep verifying against the N recorded in the string,
 * and `needsRehash` tells the sign-in path to quietly upgrade them.
 */

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const COST = 16_384; // 2^14

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${COST}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Constant-time verification.
 *
 * Every failure path costs the same as a success -- a malformed hash still
 * runs a derivation before returning false -- so response timing cannot be
 * used to tell "no such user" from "wrong password".
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');

  if (parts.length !== 4 || parts[0] !== 'scrypt') {
    // Burn equivalent work so an unknown-user lookup is not faster.
    await scrypt(password, randomBytes(SALT_LENGTH), KEY_LENGTH);
    return false;
  }

  const cost = Number(parts[1]);
  const salt = Buffer.from(parts[2], 'hex');
  const expected = Buffer.from(parts[3], 'hex');

  if (!Number.isFinite(cost) || salt.length === 0 || expected.length !== KEY_LENGTH) {
    await scrypt(password, randomBytes(SALT_LENGTH), KEY_LENGTH);
    return false;
  }

  const derived = await scrypt(password, salt, KEY_LENGTH);
  return timingSafeEqual(derived, expected);
}

/** True when a hash was made with an older work factor and should be upgraded. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return true;
  return Number(parts[1]) < COST;
}

/** Single-use token for password reset and email verification links. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
