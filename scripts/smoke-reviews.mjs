/**
 * Reviews, written and moderated.
 *
 *     npm run start &
 *     node --env-file=.env.local scripts/smoke-reviews.mjs
 *
 *   1. a customer reviews a delivered item from the order page, and it is live;
 *   2. the product's rating moves by exactly one review, in the right star;
 *   3. the order page then says "You rated it" instead of offering another;
 *   4. a review carrying a phone number is held, and the rating does not move;
 *   5. an admin takes the live review down, and the rating moves back;
 *   6. an admin publishes the held review.
 *
 * Both reviews are deleted at the end and both products' ratings restored
 * from snapshots, pass or fail.
 */

import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const SHOPPER = 'ananya.iyer@example.com';
const ADMIN = 'superadmin@vestra.test';
const PASSWORD = 'vestra123';

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db(process.env.MONGODB_DB ?? 'vestrawab');
const names = (await db.listCollections().toArray()).map((entry) => entry.name);
const itemCollection = names.find((name) => /^orderitems$/i.test(name)) ?? 'orderItems';

const shopper = await db.collection('users').findOne({ email: SHOPPER });
const orderIds = (
  await db.collection('orders').find({ userId: shopper._id }, { projection: { _id: 1 } }).toArray()
).map((order) => order._id);
const reviewed = new Set(
  (await db.collection('reviews').find({ userId: shopper._id }).toArray()).map((r) => r.productId),
);

// Two delivered items, of two different products this shopper has not reviewed.
const eligible = [];
for (const item of await db
  .collection(itemCollection)
  .find({ orderId: { $in: orderIds }, status: 'DELIVERED' })
  .toArray()) {
  if (reviewed.has(item.productId) || eligible.some((entry) => entry.productId === item.productId)) continue;
  eligible.push(item);
  if (eligible.length === 2) break;
}

const snapshots = new Map();
for (const item of eligible) {
  const product = await db.collection('products').findOne({ _id: item.productId }, { projection: { rating: 1 } });
  snapshots.set(item.productId, product.rating);
}

const started = new Date().toISOString();
const browser = await chromium.launch();
const pageErrors = [];
let failures = 0;

async function step(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failures += 1;
    const lines = String(error?.message ?? error).split('\n').filter((line) => line.trim());
    console.log(`  FAIL  ${name}`);
    for (const line of lines.slice(0, 5)) console.log(`        ${line.trim().slice(0, 150)}`);
    throw error;
  }
}

async function poll(check, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error('timed out waiting for the change to reach the database');
}

async function signIn(email) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  return page;
}

const ratingOf = async (productId) =>
  (await db.collection('products').findOne({ _id: productId }, { projection: { rating: 1 } })).rating;

async function writeReview(page, item, stars, body) {
  await page.goto(`${BASE}/orders/${item.orderId}`, { waitUntil: 'load' });
  const row = page.locator('main li').filter({ hasText: item.productTitle.slice(0, 28) }).first();
  await row.getByRole('button', { name: 'Write a review' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: `${stars} stars` }).click();
  await dialog.getByRole('radio', { name: 'True to size' }).click();
  await dialog.locator('textarea[name="body"]').fill(body);
  await dialog.getByRole('button', { name: 'Post review' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 15000 });
  return row;
}

console.log('\n  reviews\n');

try {
  if (eligible.length < 2) {
    failures += 1;
    console.log(`  FAIL  need two delivered, unreviewed items for ${SHOPPER}; found ${eligible.length}`);
    throw new Error('no fixtures');
  }
  const [first, second] = eligible;
  const firstBefore = snapshots.get(first.productId);
  const secondBefore = snapshots.get(second.productId);

  const page = await signIn(SHOPPER);

  await step('a delivered item is reviewed from the order page, and goes live', async () => {
    const row = await writeReview(page, first, 4, 'Smoke review: the fabric is soft and the colour is true to the photos.');
    await row.getByText('You rated it 4 of 5').waitFor({ timeout: 15000 });
    const review = await db.collection('reviews').findOne({ userId: shopper._id, productId: first.productId });
    if (review?.status !== 'PUBLISHED') throw new Error(`status ${review?.status}`);
    if (!review.verifiedPurchase) throw new Error('not marked as a verified purchase');
  });

  await step("the product's rating moves by exactly one, in the fourth star", async () => {
    const after = await ratingOf(first.productId);
    if (after.count !== firstBefore.count + 1) throw new Error(`count ${firstBefore.count} -> ${after.count}`);
    if (after.distribution[3] !== firstBefore.distribution[3] + 1) throw new Error('wrong star moved');
  });

  await step('a second review is not offered for the same item', async () => {
    await page.reload({ waitUntil: 'load' });
    const row = page.locator('main li').filter({ hasText: first.productTitle.slice(0, 28) }).first();
    await row.getByText('You rated it 4 of 5').waitFor({ timeout: 15000 });
    if ((await row.getByRole('button', { name: 'Write a review' }).count()) > 0) {
      throw new Error('the button is still offered');
    }
  });

  await step('a review with a phone number is held, and the rating stays put', async () => {
    const row = await writeReview(page, second, 5, 'Smoke review: lovely piece, call me on 9876543210 to see it.');
    await row.getByText(/publishing after a quick check/).waitFor({ timeout: 15000 });
    const review = await db.collection('reviews').findOne({ userId: shopper._id, productId: second.productId });
    if (review?.status !== 'PENDING') throw new Error(`status ${review?.status}`);
    if ((await ratingOf(second.productId)).count !== secondBefore.count) throw new Error('the rating moved');
  });

  const admin = await signIn(ADMIN);

  await step('an admin takes the live review down, and the rating moves back', async () => {
    await admin.goto(`${BASE}/admin/reviews?status=PUBLISHED`, { waitUntil: 'load' });
    const row = admin.locator('tr', { hasText: 'Smoke review: the fabric is soft' });
    await row.getByRole('button', { name: 'Take down' }).click();
    const dialog = admin.getByRole('dialog');
    await dialog.locator('textarea').fill('Smoke test takedown.');
    await dialog.getByRole('button', { name: 'Take down' }).click();
    await poll(async () => {
      const review = await db.collection('reviews').findOne({ userId: shopper._id, productId: first.productId });
      return review?.status === 'REJECTED';
    });
    if ((await ratingOf(first.productId)).count !== firstBefore.count) throw new Error('the rating did not move back');
  });

  await step('an admin publishes the held review', async () => {
    await admin.goto(`${BASE}/admin/reviews`, { waitUntil: 'load' });
    const row = admin.locator('tr', { hasText: 'Smoke review: lovely piece' });
    await row.getByRole('button', { name: 'Publish' }).click();
    await poll(async () => {
      const review = await db.collection('reviews').findOne({ userId: shopper._id, productId: second.productId });
      return review?.status === 'PUBLISHED';
    });
    if ((await ratingOf(second.productId)).count !== secondBefore.count + 1) throw new Error('the rating did not move');
  });
} catch {
  // Reported by `step`; later steps depend on the one that failed.
} finally {
  await db.collection('reviews').deleteMany({
    userId: shopper._id,
    productId: { $in: eligible.map((item) => item.productId) },
    createdAt: { $gte: started },
  });
  for (const [productId, rating] of snapshots) {
    await db.collection('products').updateOne({ _id: productId }, { $set: { rating } });
  }
  await browser.close();
  await client.close();
}

for (const message of pageErrors.slice(0, 3)) console.log(`  page error: ${message.slice(0, 160)}`);
console.log(`\n  ${failures === 0 ? 'reviews are written, held and moderated correctly' : `${failures} failed`}\n`);
process.exitCode = failures > 0 || pageErrors.length > 0 ? 1 : 0;