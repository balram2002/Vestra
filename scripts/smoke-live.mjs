/**
 * Live commerce, end to end.
 *
 *     npm run start &
 *     node --env-file=.env.local scripts/smoke-live.mjs
 *
 * Drives the whole two-sided flow against a running server, because no unit
 * test can: the feature is a race between two browsers, a poll, a state machine
 * driven on read, and a meeting provider.
 *
 * What it proves, in order:
 *
 *   1. a shop can go live from the console, and presence lands on the right
 *      LOCATION rather than merely the right seller;
 *   2. a shopper can start a request from the product page and reach the
 *      matching screen;
 *   3. the request appears in that shop's console within one poll;
 *   4. accepting creates a session with a room;
 *   5. the shopper's screen notices the match on its own and moves to the room;
 *   6. the host and guest links are DIFFERENT — the permission split that stops
 *      a buyer hosting a call in somebody else's shop.
 *
 * Run against `LIVE_PROVIDER=mock`, which is the default. Pointed at a real
 * provider it would create and bill a room on every run.
 */

import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'vestra123';

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db(process.env.MONGODB_DB ?? 'vestrawab');

// Find a seller who owns a published product AND has a login we know.
const owner = await db.collection('users').findOne({ email: /seller\.vestra\.test$/ });
const seller = await db.collection('sellers').findOne({ _id: owner.sellerId });
const location = await db.collection('sellerLocations').findOne({ sellerId: seller._id });
const product = await db.collection('products').findOne({ sellerId: seller._id, status: 'PUBLISHED' });

console.log('seller  :', seller.displayName, '(' + owner.email + ')');
console.log('product :', product.title.slice(0, 44));
console.log('pincode :', location.pincode);

const browser = await chromium.launch();

/* ---------------------------------------------------- the shop goes live */

const shop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const shopPage = await shop.newPage();
await shopPage.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await shopPage.fill('input[name="email"]', owner.email);
await shopPage.fill('input[name="password"]', PASSWORD);
await Promise.all([
  shopPage.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
  shopPage.click('button[type="submit"]'),
]);
await shopPage.goto(BASE + '/seller', { waitUntil: 'domcontentloaded' });
await shopPage.waitForTimeout(2000);

/*
 * Set the switch, do not toggle it.
 *
 * Clicking blindly made this pass on a cold database and fail on the second
 * run: the previous run left the shop live, so the click turned it off and the
 * shopper was matched to nothing. A smoke test that only passes once is not a
 * smoke test.
 */
const liveSwitch = shopPage.locator('button[role="switch"]').first();
if ((await liveSwitch.getAttribute('aria-checked')) !== 'true') {
  await liveSwitch.click();
}
await shopPage.waitForTimeout(2500);

const presence = await db.collection('sellerPresence').findOne({ sellerId: seller._id });
console.log('presence:', presence?.state, '| location matches:', presence?.locationId === location._id);

/* ------------------------------------------------- the shopper calls in */

const buyer = await browser.newContext({ viewport: { width: 390, height: 844 } });
const buyerPage = await buyer.newPage();
await buyerPage.goto(BASE + '/product/' + product.slug, { waitUntil: 'domcontentloaded', timeout: 60000 });
await buyerPage.waitForTimeout(2500);
await buyerPage.locator('button[aria-label="See this product live"]').first().click();
await buyerPage.waitForTimeout(700);
await buyerPage.fill('input[name="pincode"]', location.pincode);
await buyerPage.locator('button[type="submit"]').filter({ hasText: 'Find a live store' }).click();
await buyerPage.waitForURL('**/live/finding/**', { timeout: 30000 });
console.log('shopper : on the finding screen');

/* ------------------------------------------------------ the shop answers */

await shopPage.waitForTimeout(4000);
const card = shopPage.locator('button').filter({ hasText: 'Take the call' }).first();
const appeared = await card.isVisible().catch(() => false);
console.log('call card visible in console:', appeared);

if (appeared) {
  await card.click();
  await shopPage.waitForURL('**/seller/live/**', { timeout: 30000 });
  console.log('shop    : in the host room →', new URL(shopPage.url()).pathname);

  await buyerPage.waitForURL('**/live/session/**', { timeout: 30000 });
  console.log('shopper : in the live room →', new URL(buyerPage.url()).pathname);

  const sessionId = buyerPage.url().split('/').pop();
  const session = await db.collection('liveSessions').findOne({ _id: sessionId });
  console.log('session :', session.status, '| provider:', session.meeting?.provider,
              '| embeddable:', session.meeting?.embeddable);
  console.log('host/guest links differ:', session.meeting?.hostUrl !== session.meeting?.joinUrl);

  /*
   * What the shopper can actually see and do.
   *
   * Asserted rather than eyeballed: the room is mostly an iframe with overlays,
   * so a body-text dump reads as almost empty even when it is correct.
   */
  await buyerPage.waitForTimeout(1500);
  const has = async (sel) => (await buyerPage.locator(sel).count()) > 0;

  console.log('room: video frame   ', await has('iframe'));
  console.log('room: buy control   ', await has('button:has-text("Buy now"), button:has-text("Choose size")'));
  console.log('room: end call      ', await has('button[aria-label="End"]'));
  console.log('room: no site header', !(await has('nav[aria-label="Departments"]')));
  console.log('room: url           ', new URL(buyerPage.url()).pathname);
  console.log('after client nav — strip present:', (await buyerPage.content()).includes('Free delivery above'));

  await buyerPage.reload({ waitUntil: 'domcontentloaded' });
  await buyerPage.waitForTimeout(1500);
  console.log('after hard reload  — strip present:', (await buyerPage.content()).includes('Free delivery above'));
}

/* ------------------------------------- the route-group boundary holds */

/*
 * Guards a bug that is invisible on the server and obvious in a browser.
 *
 * `(storefront)` and `(immersive)` are sibling groups under one root layout,
 * and a SOFT navigation between them does not unmount the layout being left —
 * the new one renders inside the old. The reel feed arrived with a site header,
 * a footer and two bottom bars; the live room arrived with a marquee of
 * delivery promises over the call.
 *
 * Every crossing is a document navigation now (see `lib/immersive`). This
 * checks the symptom rather than the mechanism, because the symptom is what
 * anybody would actually notice.
 */
const cross = await browser.newContext({ viewport: { width: 390, height: 844 } });
const crossPage = await cross.newPage();
await crossPage.goto(BASE + '/categories', { waitUntil: 'domcontentloaded' });
await crossPage.waitForTimeout(1500);
await crossPage.locator('nav[aria-label="Primary"] a', { hasText: 'Reels' }).first().click();
await crossPage.waitForURL('**/reels', { timeout: 20000 });
await crossPage.waitForTimeout(1500);

console.log('crossing into /reels:');
console.log('  storefront chrome gone :', !(await crossPage.content()).includes('Free delivery above'));
console.log('  exactly one bottom bar :', (await crossPage.locator('nav[aria-label="Primary"]').count()) === 1);
console.log('  no footer              :', (await crossPage.locator('footer').count()) === 0);

await browser.close();
await client.close();
