/**
 * Live call, inside the room.
 *
 *     npm run start &
 *     node --env-file=.env.local scripts/smoke-live-call.mjs
 *
 * `smoke-live` proves a shopper and a shop can reach each other. This proves
 * what happens once they have: that every control in both rooms reaches the
 * other side, and that a price quoted on camera is the price the bag charges.
 *
 *   1. a quick ask from the muted shopper appears in the shop's room;
 *   2. the shop's reply appears in the shopper's room;
 *   3. a raised hand reaches the shop, and the shop can clear it;
 *   4. a 10% live offer reaches the shopper's card;
 *   5. buying puts ONE piece in the bag at the offered price, held on the line;
 *   6. the bag page labels it as a live price;
 *   7. ending the call shows the summary on both sides, recorded as a sale;
 *   8. "Find another store" starts a fresh search rather than reopening one.
 *
 * Steps depend on each other, so the first failure stops the run. The bag line
 * and the extra request it creates are removed at the end, pass or fail.
 * Mock provider only: pointed at a real one it would bill a room per run.
 */

import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'vestra123';

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db(process.env.MONGODB_DB ?? 'vestrawab');

const owner = await db.collection('users').findOne({ email: /seller\.vestra\.test$/ });
const seller = await db.collection('sellers').findOne({ _id: owner.sellerId });
const location = await db.collection('sellerLocations').findOne({ sellerId: seller._id });
const product = await db.collection('products').findOne({
  sellerId: seller._id,
  status: 'PUBLISHED',
  'variants.inventory.available': { $gt: 0 },
});

console.log(`\n  ${seller.displayName} \u00b7 ${product.title.slice(0, 40)}\n`);

const browser = await chromium.launch();
const pageErrors = [];
let failures = 0;
let sessionId = null;
let retryId = null;

async function step(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failures += 1;
    const lines = String(error?.message ?? error).split('\n').filter((line) => line.trim());
    console.log(`  FAIL  ${name}`);
    for (const line of lines.slice(0, 6)) console.log(`        ${line.trim().slice(0, 150)}`);
    throw error;
  }
}

try {
  /* ------------------------------------------------------- both sides in */

  const shop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const shopPage = await shop.newPage();
  shopPage.on('pageerror', (error) => pageErrors.push(`shop: ${error.message}`));
  await shopPage.goto(`${BASE}/login`, { waitUntil: 'load' });
  await shopPage.fill('input[name="email"]', owner.email);
  await shopPage.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    shopPage.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 }),
    shopPage.click('button[type="submit"]'),
  ]);
  await shopPage.goto(`${BASE}/seller`, { waitUntil: 'load' });
  await shopPage.waitForTimeout(2000);

  // Set the switch, never toggle it: a previous run may have left it on.
  const liveSwitch = shopPage.locator('button[role="switch"]').first();
  if ((await liveSwitch.getAttribute('aria-checked')) !== 'true') await liveSwitch.click();
  await shopPage.waitForTimeout(2500);

  const buyer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const shopper = await buyer.newPage();
  shopper.on('pageerror', (error) => pageErrors.push(`shopper: ${error.message}`));

  await step('the shopper starts a live request from the product page', async () => {
    await shopper.goto(`${BASE}/product/${product.slug}`, { waitUntil: 'load', timeout: 60000 });
    await shopper.waitForTimeout(2000);
    await shopper.locator('button[aria-label="See this product live"]').first().click();
    await shopper.fill('input[name="pincode"]', location.pincode);
    await shopper.getByRole('button', { name: 'Find a live store' }).click();
    await shopper.waitForURL('**/live/finding/**', { timeout: 30000 });
  });

  await step('the shop takes the call and both rooms open', async () => {
    const take = shopPage.locator('button').filter({ hasText: 'Take the call' }).first();
    await take.waitFor({ timeout: 20000 });
    await take.click();
    await shopPage.waitForURL('**/seller/live/**', { timeout: 30000 });
    await shopper.waitForURL('**/live/session/**', { timeout: 30000 });
    sessionId = new URL(shopper.url()).pathname.split('/').pop();
  });

  /* ------------------------------------------------------------ talking */

  await step('a quick ask from the shopper reaches the shop', async () => {
    await shopper.getByRole('button', { name: 'Show another colour' }).click();
    await shopPage.getByText('Show another colour', { exact: true }).waitFor({ timeout: 15000 });
  });

  await step("the shop's reply reaches the shopper", async () => {
    await shopPage.getByRole('button', { name: 'Showing it now' }).click();
    await shopper.getByText('Showing it now').first().waitFor({ timeout: 15000 });
  });

  await step('a raised hand reaches the shop, and clears', async () => {
    await shopper.getByRole('button', { name: 'Ask to speak' }).click();
    await shopper.getByRole('button', { name: 'Hand raised' }).waitFor({ timeout: 5000 });
    await shopPage.getByText('The shopper wants to speak').waitFor({ timeout: 15000 });
    await shopPage.getByRole('button', { name: 'Done', exact: true }).click();
    await shopPage
      .getByText('The shopper wants to speak')
      .waitFor({ state: 'hidden', timeout: 10000 });
    const doc = await db.collection('liveSessions').findOne({ _id: sessionId });
    if (doc.speakRequestedAt) throw new Error('the request to speak was not cleared');
  });

  /* ------------------------------------------------------------ selling */

  let offered = 0;

  await step('a 10% live offer reaches the shopper', async () => {
    await shopPage.getByRole('button', { name: /^10% off/ }).click();
    await shopper.getByText('Live offer').first().waitFor({ timeout: 15000 });
    const doc = await db.collection('liveSessions').findOne({ _id: sessionId });
    offered = doc.offeredPrice;
    if (!offered) throw new Error('no offer stored on the session');
  });

  await step('buying puts one piece in the bag at the offered price', async () => {
    const action = shopper.getByRole('button', { name: /^(Choose size|Buy now)$/ }).first();
    const label = ((await action.textContent()) ?? '').trim();
    await action.click();
    if (label.includes('Choose size')) {
      const dialog = shopper.getByRole('dialog');
      await dialog.locator('[role="radio"]:not([disabled])').first().click();
      await dialog.getByRole('button', { name: /^Add size/ }).click();
    }
    await shopper.getByRole('button', { name: 'Checkout' }).first().waitFor({ timeout: 15000 });

    const cart = await db.collection('carts').findOne({ 'items.liveOffer.sessionId': sessionId });
    const line = cart?.items.find((item) => item.liveOffer?.sessionId === sessionId);
    if (!line) throw new Error('no bag line holds the live price');
    if (line.priceAtAdd !== offered || line.liveOffer.price !== offered) {
      throw new Error(`line priced ${line.priceAtAdd}, offer was ${offered}`);
    }
    if (line.quantity !== 1) throw new Error(`quantity ${line.quantity}, expected 1`);
  });

  await step('the bag labels it as a live price', async () => {
    const bag = await buyer.newPage();
    await bag.goto(`${BASE}/bag`, { waitUntil: 'load' });
    await bag.getByText(`Live price from ${seller.displayName}`).waitFor({ timeout: 15000 });
    await bag.close();
    // A page left behind a closed tab can stay "hidden" in headless Chromium.
    await shopper.bringToFront();
  });

  /* ------------------------------------------------------------- ending */

  await step('ending the call shows the summary on both sides', async () => {
    await shopper.getByRole('button', { name: 'End', exact: true }).click();
    await shopper.getByRole('dialog').getByRole('button', { name: 'End call' }).click();
    await shopper.getByRole('heading', { name: 'Call ended' }).waitFor({ timeout: 15000 });
    await shopPage.getByText(/Sold on the call|The call has ended/).waitFor({ timeout: 15000 });
    const doc = await db.collection('liveSessions').findOne({ _id: sessionId });
    if (doc.status !== 'ENDED') throw new Error(`session is ${doc.status}`);
    if (doc.outcome !== 'PURCHASED') throw new Error(`outcome is ${doc.outcome}, expected PURCHASED`);
  });

  await step('"Find another store" starts a fresh search', async () => {
    const session = await db.collection('liveSessions').findOne({ _id: sessionId });
    await shopper.getByRole('button', { name: 'Find another store' }).click();
    await shopper.waitForURL('**/live/finding/**', { timeout: 30000 });
    retryId = new URL(shopper.url()).pathname.split('/').pop();
    if (retryId === session.requestId) throw new Error('it reopened the old request');
    const request = await db.collection('liveRequests').findOne({ _id: retryId });
    if (!request) throw new Error('no new request was written');
  });
} catch {
  // Reported by `step`; the rest depends on the step that failed.
} finally {
  if (sessionId) {
    await db
      .collection('carts')
      .updateMany(
        { 'items.liveOffer.sessionId': sessionId },
        { $pull: { items: { 'liveOffer.sessionId': sessionId } } },
      );
  }
  if (retryId) {
    await db
      .collection('liveRequests')
      .updateOne({ _id: retryId, status: 'MATCHING' }, { $set: { status: 'CANCELLED' } });
  }
  await browser.close();
  await client.close();
}

for (const message of pageErrors.slice(0, 4)) console.log(`  page error: ${message.slice(0, 160)}`);
console.log(`\n  ${failures === 0 ? 'every control reaches the other side' : `${failures} failed`}\n`);
process.exitCode = failures > 0 || pageErrors.length > 0 ? 1 : 0;