/**
 * Exchange lifecycle smoke test.
 *
 *     npm run start &
 *     node scripts/smoke-exchange.mjs
 *
 * Walks a real size swap from both sides: customer asks, seller approves,
 * reverse parcel is collected and arrives, quality check passes, replacement
 * ships. The assertions are mostly about STOCK, because that is where an
 * exchange implementation actually goes wrong — the replacement has to be held
 * from the moment it is promised and released the moment the promise dies,
 * and neither is visible on screen.
 */

import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'vestra123';

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

const client = await MongoClient.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017');
const db = client.db(process.env.MONGODB_DB ?? 'vestra');

const availableOf = async (variantId) => {
  const product = await db.collection('products').findOne({ 'variants.id': variantId });
  return product?.variants.find((v) => v.id === variantId)?.inventory.available ?? null;
};
const reservedOf = async (variantId) => {
  const product = await db.collection('products').findOne({ 'variants.id': variantId });
  return product?.variants.find((v) => v.id === variantId)?.inventory.reserved ?? null;
};

console.log('\nExchange lifecycle\n');

/* ----------------------------------------------------- find a candidate */

/**
 * A delivered, exchangeable line whose product has another same-priced size in
 * stock. Searched rather than constructed, so the test runs against real
 * seeded data rather than a fixture that flatters the implementation.
 */
let candidate = null;

const delivered = await db
  .collection('orderItems')
  .find({ status: 'DELIVERED', exchangeable: true, exchangeId: null, returnId: null })
  .limit(400)
  .toArray();

for (const item of delivered) {
  const order = await db.collection('orders').findOne({ _id: item.orderId });
  if (!order?.userId) continue;
  if (item.returnEligibleUntil && Date.parse(item.returnEligibleUntil) < Date.now()) continue;

  /*
   * Require the order to have exactly ONE exchangeable line.
   *
   * Otherwise "click the first Exchange button" targets whichever item the
   * page happened to render first, and the test asserts against a different
   * line than the one it acted on — which is precisely how this test failed
   * the first time, reporting a bug that did not exist.
   */
  const siblings = await db.collection('orderItems').countDocuments({
    orderId: item.orderId,
    status: 'DELIVERED',
    exchangeable: true,
    exchangeId: null,
    returnId: null,
  });
  if (siblings !== 1) continue;

  const product = await db.collection('products').findOne({ _id: item.productId });
  if (!product || product.status !== 'PUBLISHED') continue;

  const source = product.variants.find((v) => v.id === item.variantId);
  if (!source) continue;

  const target = product.variants.find(
    (v) =>
      v.id !== item.variantId &&
      v.isActive &&
      v.sellingPrice === source.sellingPrice &&
      v.inventory.available > 0,
  );
  if (!target) continue;

  candidate = { item, order, product, source, target };
  break;
}

if (!candidate) {
  check('a delivered item with a swappable size exists', false, 'none found in the dataset');
  await client.close();
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(1);
}

check('found a delivered item with a swappable size', true,
  `${candidate.item.size} -> ${candidate.target.size}`);

const customer = await db.collection('users').findOne({ _id: candidate.order.userId });
const seller = await db.collection('sellers').findOne({ _id: candidate.item.sellerId });
const sellerUser = await db.collection('users').findOne({ _id: seller.ownerUserId });

const browser = await chromium.launch();

async function sessionFor(email) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  return { context, page };
}

/* ------------------------------------------------------- customer asks */

const availableBefore = await availableOf(candidate.target.id);
const reservedBefore = await reservedOf(candidate.target.id);

const shopper = await sessionFor(customer.email);
await shopper.page.goto(`${BASE}/orders/${candidate.order._id}`, { waitUntil: 'domcontentloaded' });
await shopper.page.waitForTimeout(1500);

const exchangeButton = shopper.page.getByRole('button', { name: 'Exchange size' }).first();
check('the order page offers an exchange', (await exchangeButton.count()) > 0);

if ((await exchangeButton.count()) > 0) {
  await exchangeButton.click();
  await shopper.page.waitForTimeout(400);

  const selects = shopper.page.locator('select');
  // First select is the size picker, second is the reason.
  await selects.nth(0).selectOption(candidate.target.id);
  await selects.nth(1).selectOption('SIZE_TOO_SMALL');

  await shopper.page.getByRole('button', { name: 'Request exchange' }).click();
  await shopper.page.waitForTimeout(2500);
}

const request = await db.collection('exchanges').findOne({ orderItemId: candidate.item._id });
check('an exchange request was recorded', Boolean(request), 'no exchange document');

if (request) {
  check('it targets the chosen size', request.toVariantId === candidate.target.id);
  check('it starts as requested', request.status === 'EXCHANGE_REQUESTED', request.status);
  check(
    'the order item follows',
    (await db.collection('orderItems').findOne({ _id: candidate.item._id }))?.status ===
      'EXCHANGE_REQUESTED',
  );

  // The promise has to be backed by held stock, or the size can sell away.
  const availableAfter = await availableOf(candidate.target.id);
  const reservedAfter = await reservedOf(candidate.target.id);
  check(
    'the replacement was reserved at request time',
    availableAfter === availableBefore - 1 && reservedAfter === reservedBefore + 1,
    `available ${availableBefore}->${availableAfter}, reserved ${reservedBefore}->${reservedAfter}`,
  );
}

await shopper.context.close();

/* ----------------------------------------------------- seller approves */

if (request) {
  const sellerSession = await sessionFor(sellerUser.email);
  await sellerSession.page.goto(`${BASE}/seller/returns`, { waitUntil: 'domcontentloaded' });
  await sellerSession.page.waitForTimeout(1500);

  const queueText = await sellerSession.page.locator('body').innerText();
  check('the exchange appears in the seller queue', queueText.includes(request.exchangeNumber),
    queueText.slice(0, 160));

  const approve = sellerSession.page.getByRole('button', { name: 'Approve exchange' }).first();
  if ((await approve.count()) > 0) {
    await approve.click();
    await sellerSession.page.waitForTimeout(2500);
  }

  const approved = await db.collection('exchanges').findOne({ _id: request._id });
  check('approval moved it forward', approved?.status === 'EXCHANGE_APPROVED', approved?.status);
  check('a reverse pickup was booked', Boolean(approved?.returnShipmentId));

  if (approved?.returnShipmentId) {
    const reverse = await db.collection('shipments').findOne({ _id: approved.returnShipmentId });
    check('the reverse parcel travels the other way', reverse?.direction === 'RETURN',
      reverse?.direction);
    check(
      'it is addressed to the seller, not the customer',
      reverse?.deliveryAddress?.pincode !== candidate.order.shippingAddress.pincode ||
        reverse?.deliveryAddress?.fullName !== candidate.order.shippingAddress.fullName,
    );
  }

  /* ---------------------------------------------- quality check passes */

  await sellerSession.page.goto(`${BASE}/seller/returns`, { waitUntil: 'domcontentloaded' });
  await sellerSession.page.waitForTimeout(1500);

  const qc = sellerSession.page.getByRole('button', { name: /^Passed/ }).first();
  check('a quality check is offered once approved', (await qc.count()) > 0);

  if ((await qc.count()) > 0) {
    const returnedAvailableBefore = await availableOf(candidate.source.id);

    await qc.click();
    await sellerSession.page.waitForTimeout(3000);

    const shipped = await db.collection('exchanges').findOne({ _id: request._id });
    check('passing dispatches the replacement', shipped?.status === 'EXCHANGE_SHIPPED',
      shipped?.status);
    check('a forward replacement parcel exists', Boolean(shipped?.forwardShipmentId));

    if (shipped?.forwardShipmentId) {
      const forward = await db.collection('shipments').findOne({ _id: shipped.forwardShipmentId });
      check('the replacement parcel is an exchange leg',
        forward?.direction === 'EXCHANGE_FORWARD', forward?.direction);
      check('the replacement was labelled straight away', Boolean(forward?.awb));
    }

    const returnedAvailableAfter = await availableOf(candidate.source.id);
    check(
      'the returned unit went back on sale',
      returnedAvailableAfter === returnedAvailableBefore + 1,
      `${returnedAvailableBefore} -> ${returnedAvailableAfter}`,
    );

    const reservedNow = await reservedOf(candidate.target.id);
    check(
      'the held replacement became a sale rather than staying reserved',
      reservedNow === reservedBefore,
      `reserved ${reservedBefore} -> ${reservedNow}`,
    );

    check(
      'the order item reads as an exchange in flight',
      (await db.collection('orderItems').findOne({ _id: candidate.item._id }))?.status ===
        'EXCHANGE_SHIPPED',
    );
  }

  await sellerSession.context.close();
}

await browser.close();
await client.close();

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
