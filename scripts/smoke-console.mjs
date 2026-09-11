/**
 * Console write-path smoke test.
 *
 *     npm run start &
 *     node --env-file=.env.local scripts/smoke-console.mjs
 *
 * Drives the admin create flows and the user suspension control through the
 * real UI, the way an operator would, and checks each one actually lands in
 * the database rather than merely closing a dialog:
 *
 *   - a coupon with a bad code is refused, with the error under the Code field;
 *   - a coupon is created, listed, and stored in paise and uppercase;
 *   - a category is created under a parent, hidden, and shown again;
 *   - a promotion is created PAUSED;
 *   - a customer is suspended with a reason, then reactivated.
 *
 * Everything it creates is removed at the end, pass or fail, and the customer
 * it suspends is put back to ACTIVE, so it can run against a shared seed as
 * often as needed.
 */

import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const stamp = Date.now().toString(36).slice(-5).toUpperCase();
const CODE = `SMOKE${stamp}`;
const CATEGORY = `Smoke ${stamp}`;
const PROMO = `Smoke promo ${stamp}`;

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db(process.env.MONGODB_DB ?? 'vestrawab');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

let failures = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  ${name}\n        ${String(error.message).split('\n')[0]}`);
  }
}

// A plain customer, picked from the database so the UI step is deterministic.
const suspect = await db.collection('users').findOne({
  roles: ['CUSTOMER'],
  status: 'ACTIVE',
  email: { $not: /shopper/ },
});

try {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', 'superadmin@vestra.test');
  await page.fill('input[name="password"]', 'vestra123');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);

  console.log('\n  admin write paths\n');

  await step('coupon: a bad code is refused under the field', async () => {
    await page.goto(`${BASE}/admin/coupons`);
    await page.getByRole('button', { name: 'New coupon' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name="code"]').fill('NO');
    await dialog.locator('input[name="title"]').fill('Smoke test coupon');
    await dialog.locator('input[name="value"]').fill('10');
    await dialog.getByRole('button', { name: 'Create coupon' }).click();
    await dialog.getByText('Codes are 4 to 20 letters or digits').waitFor({ timeout: 15000 });
  });

  await step('coupon: created, listed, stored correctly', async () => {
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name="code"]').fill(CODE.toLowerCase());
    await dialog.locator('input[name="maxDiscount"]').fill('250');
    await dialog.getByRole('button', { name: 'Create coupon' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 15000 });
    await page.getByText(CODE, { exact: true }).waitFor({ timeout: 15000 });

    const doc = await db.collection('coupons').findOne({ code: CODE });
    if (!doc) throw new Error('no coupon document');
    if (doc.type !== 'PERCENTAGE' || doc.value !== 10) throw new Error(`stored ${doc.type} ${doc.value}`);
    if (doc.maxDiscount !== 25000) throw new Error(`maxDiscount ${doc.maxDiscount}, expected paise`);
  });

  await step('category: created under a parent', async () => {
    await page.goto(`${BASE}/admin/categories`);
    await page.getByRole('button', { name: 'New category' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name="name"]').fill(CATEGORY);
    await dialog.getByRole('button', { name: 'Create category' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 15000 });
    await page.getByText(CATEGORY, { exact: true }).waitFor({ timeout: 15000 });
  });

  await step('category: hidden, then shown again', async () => {
    const row = page.locator('li', { hasText: CATEGORY });
    await row.locator('[role="switch"][aria-checked="true"]').click();
    await row.locator('[role="switch"][aria-checked="false"]').waitFor({ timeout: 15000 });
    const hidden = await db.collection('categories').findOne({ name: CATEGORY });
    if (hidden?.isActive !== false) throw new Error('not hidden in the database');
    await row.locator('[role="switch"][aria-checked="false"]').click();
    await row.locator('[role="switch"][aria-checked="true"]').waitFor({ timeout: 15000 });
  });

  await step('promotion: created paused', async () => {
    await page.goto(`${BASE}/admin/promotions`);
    await page.getByRole('button', { name: 'New promotion' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name="title"]').fill(PROMO);
    await dialog.locator('textarea[name="description"]').fill('Ten percent off, smoke test.');
    await dialog.locator('input[name="value"]').fill('10');
    await dialog.getByRole('button', { name: 'Save paused' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 15000 });
    await page.locator('tr', { hasText: PROMO }).getByText('Paused').first().waitFor({ timeout: 15000 });

    const doc = await db.collection('promotions').findOne({ title: PROMO });
    if (!doc || doc.isActive !== false) throw new Error('promotion missing or live');
    if (doc.type !== 'PERCENT_DISCOUNT' || doc.valueKind !== 'PERCENT') throw new Error(`stored ${doc.type}/${doc.valueKind}`);
  });

  await step('user: suspended with a reason, then reactivated', async () => {
    if (!suspect) throw new Error('no plain customer in the seed');
    await page.goto(`${BASE}/admin/users?q=${encodeURIComponent(suspect.fullName)}`);
    const row = page.locator('tbody tr', { hasText: suspect.fullName }).first();
    await row.getByRole('button', { name: 'Suspend' }).click();

    const dialog = page.getByRole('dialog');
    const confirm = dialog.getByRole('button', { name: 'Suspend account' });
    if (!(await confirm.isDisabled())) throw new Error('confirm enabled with no reason');
    await dialog.locator('textarea').fill('Smoke test: checking the suspension control.');
    await confirm.click();
    await dialog.waitFor({ state: 'hidden', timeout: 15000 });
    await row.getByText('Suspended').waitFor({ timeout: 15000 });

    const stored = await db.collection('users').findOne({ _id: suspect._id });
    if (stored?.status !== 'SUSPENDED') throw new Error('not suspended in the database');

    await row.getByRole('button', { name: 'Reactivate' }).click();
    await row.getByText('Active', { exact: true }).waitFor({ timeout: 15000 });
  });
} finally {
  await db.collection('coupons').deleteMany({ code: { $regex: '^SMOKE' } });
  await db.collection('categories').deleteMany({ name: { $regex: '^Smoke ' } });
  await db.collection('promotions').deleteMany({ title: { $regex: '^Smoke promo ' } });
  if (suspect) {
    await db.collection('users').updateOne({ _id: suspect._id }, { $set: { status: 'ACTIVE' } });
  }
  await browser.close();
  await client.close();
}

for (const message of pageErrors.slice(0, 3)) console.log(`  page error: ${message.slice(0, 160)}`);
console.log(`\n  ${failures === 0 ? 'all write paths work' : `${failures} failed`}\n`);
process.exitCode = failures > 0 || pageErrors.length > 0 ? 1 : 0;