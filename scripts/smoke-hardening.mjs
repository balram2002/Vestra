/**
 * Production hardening, checked against a running server.
 *
 *     npm run build && npm run start &
 *     node --env-file=.env.local scripts/smoke-hardening.mjs
 *
 *   1. /api/health answers 200 with the database reachable, uncached;
 *   2. every page carries the security headers, and no X-Powered-By;
 *   3. live rooms may use the camera and microphone, the rest of the site may not;
 *   4. the eleventh wrong password for one account is refused as rate limited,
 *      while the ten before it are ordinary failures.
 *
 * The rate-limit windows it fills are deleted at the end, so it can run
 * alongside the other suites without locking anybody out.
 */

import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db(process.env.MONGODB_DB ?? 'vestrawab');

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

console.log('\n  hardening\n');

/* ------------------------------------------------------------------ health */

const health = await fetch(`${BASE}/api/health`);
const body = await health.json().catch(() => ({}));
check('health answers 200 with the database up', health.status === 200 && body.status === 'ok', `${health.status} ${body.status}`);
check('health is never cached', (health.headers.get('cache-control') ?? '').includes('no-store'));

/* ----------------------------------------------------------------- headers */

const home = await fetch(`${BASE}/`);
const h = home.headers;
check('nosniff', h.get('x-content-type-options') === 'nosniff');
check('framing limited to this site', (h.get('content-security-policy') ?? '').includes("frame-ancestors 'self'"));
check('plugins blocked', (h.get('content-security-policy') ?? '').includes("object-src 'none'"));
check('referrer policy set', Boolean(h.get('referrer-policy')));
check('no X-Powered-By', !h.get('x-powered-by'), h.get('x-powered-by') ?? '');
check('camera off across the site', (h.get('permissions-policy') ?? '').includes('camera=()'));

const room = await fetch(`${BASE}/live/room/smoke-check`);
const roomPolicy = room.headers.get('permissions-policy') ?? '';
check('live rooms may use the camera', roomPolicy.includes('camera=(self'), roomPolicy.slice(0, 60));
check('live rooms may use the microphone', roomPolicy.includes('microphone=(self'));

/* -------------------------------------------------------------- rate limit */

const email = `ratelimit-${Date.now()}@example.com`;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'load' });

let ordinary = 0;
let limitedAt = 0;
let limitedMessage = '';
const escaped = email.replace(/[.+]/g, '\$&');

for (let attempt = 1; attempt <= 11; attempt++) {
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'definitely-not-it');
  // Wait for THIS attempt's answer. The previous failure's message stays on
  // screen, so reading the page before the response lands reads the last one.
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST', { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(300);
  const text = await page.locator('body').innerText();
  if (/Too many attempts/.test(text)) {
    limitedAt = attempt;
    limitedMessage = text.match(/Too many attempts[^\n]*/)?.[0] ?? '';
    break;
  }
  if (/do not match/.test(text)) ordinary += 1;
}

const bucket = await db.collection('rateLimits').findOne({ _id: { $regex: `^signin:email:${escaped}:` } });
console.log(`        failures stored for the account: ${bucket?.count ?? 0}`);

check('ten wrong passwords are ordinary failures', ordinary === 10, `${ordinary} before the limit`);
check('the eleventh is refused as rate limited', limitedAt === 11, limitedMessage.trim() || `limited at ${limitedAt}`);

await browser.close();
await db.collection('rateLimits').deleteMany({ _id: { $regex: `^signin:(email:${email.replace(/[.+]/g, '\\$&')}|ip:)` } });
await client.close();

console.log(`\n  ${failures === 0 ? 'hardened' : `${failures} failed`}\n`);
process.exitCode = failures > 0 ? 1 : 0;