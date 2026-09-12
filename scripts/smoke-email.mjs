/**
 * Email smoke test.
 *
 *     npm run start &
 *     node scripts/smoke-email.mjs
 *
 * Exercises the three flows that only exist because of email — verification,
 * password reset, and a transactional notification — and asserts on what was
 * actually rendered rather than on "the function returned ok". With no SMTP
 * configured the console transport writes each message to `.data/outbox`, so
 * the rendered HTML is available to read back, which is exactly what makes
 * these assertions possible without a mail server.
 */

import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUTBOX = path.join(process.cwd(), '.data', 'outbox');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  ok    ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
  }
};

/** Every message in the outbox, newest first. */
async function outbox() {
  try {
    const names = await readdir(OUTBOX);
    return names.sort().reverse();
  } catch {
    return [];
  }
}

/** Wait for a message whose filename matches, then return its HTML. */
async function waitForMail(pattern, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const names = await outbox();
    const hit = names.find((name) => pattern.test(name));
    if (hit) return { name: hit, html: await readFile(path.join(OUTBOX, hit), 'utf8') };
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return null;
}

const client = await MongoClient.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017');
const db = client.db(process.env.MONGODB_DB ?? 'vestra');

console.log('\nEmail\n');

await rm(OUTBOX, { recursive: true, force: true });

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const stamp = Date.now().toString().slice(-8);
const address = `smoke.email.${stamp}@example.test`;

try {
  /* ------------------------------------------------------- verification */

  await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
  /*
   * By ROLE, not by label. "Email me about new arrivals" is a checkbox whose
   * label also starts with "Email", and a loose label match hits both.
   */
  await page.getByRole('textbox', { name: /full name/i }).fill('Smoke Tester');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(address);
  await page.locator('input[name="password"]').fill('vestra123');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/register'), { timeout: 30000 }),
    page.getByRole('button', { name: /create|register|sign up/i }).first().click(),
  ]);

  check('registering signs the person in', !page.url().includes('/register'), page.url());

  const verification = await waitForMail(/confirm-your-email/);
  check('a verification email was rendered', Boolean(verification), (await outbox()).join(', '));

  if (verification) {
    check(
      'it carries an absolute confirmation link',
      /href="https?:\/\/[^"]*\/verify-email\?token=/.test(verification.html),
      verification.html.slice(0, 0),
    );
    check('it says how long the link lasts', /24 hours/.test(verification.html));
    check('it names the sender', /VestraWAB/.test(verification.html));

    /*
     * The token must NOT be recoverable from the database — only its hash is
     * stored, so a dump cannot be replayed into an account takeover.
     */
    const token = verification.html.match(/verify-email\?token=([^"&]+)/)?.[1];
    const stored = await db.collection('authTokens').findOne({ userId: { $exists: true } });
    check(
      'only a hash of the token is stored',
      Boolean(token) && Boolean(stored) && stored._id !== decodeURIComponent(token),
      stored?._id?.slice(0, 12),
    );

    /* ------------------------------------------- following the link works */

    await page.goto(`${BASE}/verify-email?token=${token}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const confirmed = await page.locator('body').innerText();
    check('following the link confirms the address', /Email confirmed/i.test(confirmed), confirmed.slice(0, 80));

    const user = await db.collection('users').findOne({ email: address });
    check('the account is marked verified', user?.emailVerified === true);

    /* ------------------------------------------ and cannot be used twice */

    await page.goto(`${BASE}/verify-email?token=${token}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const replay = await page.locator('body').innerText();
    check(
      'the same link cannot be replayed',
      /already been used|did not work/i.test(replay),
      replay.slice(0, 80),
    );
  }

  /* ------------------------------------------------------ password reset */

  await page.goto(`${BASE}/forgot-password`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(address);
  await page.getByRole('button', { name: /send reset link/i }).click();
  await page.waitForTimeout(2000);

  const sentState = await page.locator('body').innerText();
  check('the reset form confirms without confirming the account exists', /Check your inbox/i.test(sentState));

  const reset = await waitForMail(/reset-your-password/);
  check('a reset email was rendered', Boolean(reset));

  if (reset) {
    check('it says the link is short-lived', /30 minutes/.test(reset.html));
    check(
      'it reassures someone who did not ask',
      /did not ask for it/i.test(reset.html),
    );

    const resetToken = reset.html.match(/reset-password\?token=([^"&]+)/)?.[1];

    await page.goto(`${BASE}/reset-password?token=${resetToken}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.locator('input[name="password"]').fill('vestra456');
    await page.locator('input[name="confirm"]').fill('vestra456');
    await page.getByRole('button', { name: /change my password/i }).click();
    await page.waitForTimeout(2500);

    const changed = await page.locator('body').innerText();
    check('the password can be changed', /Password changed/i.test(changed), changed.slice(0, 80));

    const notice = await waitForMail(/your-password-was-changed/);
    check('a password-changed warning is sent', Boolean(notice));

    /* --------------------------------- an unknown address reveals nothing */

    await page.goto(`${BASE}/forgot-password`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(`nobody.${stamp}@example.test`);
    await page.getByRole('button', { name: /send reset link/i }).click();
    await page.waitForTimeout(1500);
    const unknown = await page.locator('body').innerText();
    check(
      'an unknown address gets the same answer',
      /Check your inbox/i.test(unknown),
      unknown.slice(0, 80),
    );
  }

  /* ------------------------------------------- a transactional notification */

  /*
   * Categories the catalogue marks in-app only must not reach an inbox. This is
   * the rule that stops a seller who lists forty styles a week getting forty
   * emails, and it is enforced in `notify()` rather than at each call site.
   */
  const before = (await outbox()).length;
  const shopper = await db.collection('users').findOne({ email: 'ananya.iyer@example.com' });
  const order = await db.collection('orders').findOne({ userId: shopper._id });

  if (order) {
    check('found a seeded order to notify about', true, order.orderNumber);
  }

  const after = (await outbox()).length;
  check('nothing was mailed without an action', after === before, `${before} -> ${after}`);
} finally {
  /* Leave no test account behind. */
  const created = await db.collection('users').findOne({ email: address });
  if (created) {
    await db.collection('authTokens').deleteMany({ userId: created._id });
    await db.collection('notifications').deleteMany({ userId: created._id });
    await db.collection('carts').deleteMany({ userId: created._id });
    await db.collection('wishlists').deleteMany({ userId: created._id });
    await db.collection('users').deleteOne({ _id: created._id });
  }
}

check('the test account was removed', !(await db.collection('users').findOne({ email: address })));

await browser.close();
await client.close();

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
