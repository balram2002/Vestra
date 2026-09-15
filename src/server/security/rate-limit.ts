import 'server-only';

import { headers } from 'next/headers';

import { getDb } from '../db/client';
import { COLLECTIONS } from '../db/collections';

/**
 * Fixed-window rate limits, stored in MongoDB.
 *
 * In the database rather than in memory because this runs as more than one
 * process: a counter per instance lets an attacker multiply their budget by
 * the number of instances behind the load balancer. A TTL index deletes each
 * window when it ends (see `db/indexes`), so the collection never grows.
 *
 * Two ways to spend a budget:
 *
 *   hit     counts every attempt. For actions that CREATE something: an
 *           account, a support ticket, a review, a live call that rings shops.
 *   peek    checks without counting, paired with a `hit` only on FAILURE. For
 *           sign-in, password changes and coupon codes: a person who gets it
 *           right is never slowed, while guessing runs out after a few tries.
 *
 * It FAILS OPEN. If the database cannot be reached the request goes through:
 * a limiter that takes sign-in down whenever Mongo blips is a larger outage
 * than the attack it prevents, and every limited action needs the database to
 * do its real work anyway.
 */

export interface RateLimitRule {
  name: string;
  max: number;
  windowSeconds: number;
}

export const LIMITS = {
  /** Failed sign-ins, per account and per address. */
  signInByEmail: { name: 'signin:email', max: 10, windowSeconds: 15 * 60 },
  signInByIp: { name: 'signin:ip', max: 50, windowSeconds: 15 * 60 },
  register: { name: 'register:ip', max: 10, windowSeconds: 60 * 60 },
  passwordResetByEmail: { name: 'reset:email', max: 3, windowSeconds: 60 * 60 },
  passwordResetByIp: { name: 'reset:ip', max: 20, windowSeconds: 60 * 60 },
  /** Wrong current passwords, per account. */
  passwordChange: { name: 'password:user', max: 5, windowSeconds: 15 * 60 },
  /** Profile photos, per account: every one is a file written to storage. */
  avatar: { name: 'avatar:user', max: 10, windowSeconds: 60 * 60 },
  /** One-time codes sent, per account: each one is an email. */
  twoFactorSend: { name: '2fa:send', max: 5, windowSeconds: 15 * 60 },
  /** Wrong codes, per account, across every challenge it has been sent. */
  twoFactorVerify: { name: '2fa:verify', max: 10, windowSeconds: 60 * 60 },
  /** Codes that did not work, per bag. */
  coupon: { name: 'coupon:owner', max: 15, windowSeconds: 10 * 60 },
  ticket: { name: 'ticket:user', max: 6, windowSeconds: 60 * 60 },
  review: { name: 'review:user', max: 10, windowSeconds: 60 * 60 },
  liveRequest: { name: 'live:owner', max: 8, windowSeconds: 10 * 60 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface Bucket {
  _id: string;
  count: number;
  expiresAt: Date;
}

const OPEN: RateLimitResult = { allowed: true, retryAfterSeconds: 0 };

function windowFor(rule: RateLimitRule, subject: string) {
  const now = Date.now();
  const length = rule.windowSeconds * 1000;
  const start = Math.floor(now / length) * length;
  return {
    id: `${rule.name}:${subject.trim().toLowerCase()}:${start}`,
    end: start + length,
    retryAfterSeconds: Math.ceil((start + length - now) / 1000),
  };
}

async function buckets() {
  const db = await getDb();
  return db.collection<Bucket>(COLLECTIONS.rateLimits);
}

/** Count one attempt against the budget. */
export async function hit(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
  const window = windowFor(rule, subject);
  try {
    const bucket = await (await buckets()).findOneAndUpdate(
      { _id: window.id },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(window.end) } },
      { upsert: true, returnDocument: 'after' },
    );
    return {
      allowed: (bucket?.count ?? 1) <= rule.max,
      retryAfterSeconds: window.retryAfterSeconds,
    };
  } catch (error) {
    console.warn('[vestrawab:rate-limit] store unavailable, allowing', rule.name, error);
    return OPEN;
  }
}

/** Is there budget left? Counts nothing. */
export async function peek(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
  const window = windowFor(rule, subject);
  try {
    const bucket = await (await buckets()).findOne({ _id: window.id });
    return {
      allowed: (bucket?.count ?? 0) < rule.max,
      retryAfterSeconds: window.retryAfterSeconds,
    };
  } catch (error) {
    console.warn('[vestrawab:rate-limit] store unavailable, allowing', rule.name, error);
    return OPEN;
  }
}

type Check = readonly [RateLimitRule, string];

/** The first exhausted budget, or allowed. */
async function firstBlocked(results: RateLimitResult[]): Promise<RateLimitResult> {
  return results.find((result) => !result.allowed) ?? OPEN;
}

export async function hitAll(checks: Check[]): Promise<RateLimitResult> {
  return firstBlocked(await Promise.all(checks.map(([rule, subject]) => hit(rule, subject))));
}

export async function peekAll(checks: Check[]): Promise<RateLimitResult> {
  return firstBlocked(await Promise.all(checks.map(([rule, subject]) => peek(rule, subject))));
}

/**
 * The caller's address, as the proxy in front of the app reports it.
 *
 * Only as trustworthy as that proxy: deployed without one, a client can set
 * X-Forwarded-For itself. The per-account budgets do not depend on it.
 */
export async function clientIp(): Promise<string> {
  const list = await headers();
  const forwarded = list.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || list.get('x-real-ip') || 'unknown';
}

export function retryMessage(result: RateLimitResult): string {
  const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
  return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}