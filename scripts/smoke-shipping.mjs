/**
 * Fulfilment smoke test.
 *
 *     npm run start &
 *     node scripts/smoke-shipping.mjs
 *
 * Two halves, because fulfilment has two very different failure modes.
 *
 * The COURIER half is checked over HTTP: signature rejection, replay defence
 * and out-of-order scans. That endpoint can mark an order delivered, which
 * starts the return clock and releases the seller's money, so it is the most
 * security-sensitive surface in the application.
 *
 * The SCREEN half is checked in a real browser, because sign-in goes through a
 * Server Action and a plain fetch cannot complete one — a fetch-based check
 * silently receives the login page with a 200 and reports success.
 */

import { createHmac } from 'node:crypto';
import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const SECRET = process.env.ESHOPBOX_WEBHOOK_SECRET ?? 'vestra-simulation-secret';
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

console.log('\nFulfilment smoke\n');

/* -------------------------------------------------------- data integrity */

const shipmentCount = await db.collection('shipments').countDocuments();
check('parcels exist in the dataset', shipmentCount > 0, String(shipmentCount));

const orphan = await db
  .collection('shipments')
  .countDocuments({ awb: null, status: { $ne: 'CREATED' } });
check('every dispatched parcel carries an AWB', orphan === 0, `${orphan} without`);

const dupes = await db
  .collection('shipments')
  .aggregate([{ $group: { _id: '$awb', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }])
  .toArray();
check('AWBs are unique', dupes.length === 0, `${dupes.length} duplicated`);

const delivered = await db.collection('shipments').find({ status: 'DELIVERED' }).limit(200).toArray();
const scrambled = delivered.filter((s) => {
  const times = s.events.map((e) => Date.parse(e.occurredAt));
  return times.some((t, i) => i > 0 && t < times[i - 1]);
});
check('scan histories are chronological', scrambled.length === 0, `${scrambled.length} scrambled`);

/* --------------------------------------------------------------- webhook */

const post = (body, signature) =>
  fetch(`${BASE}/api/webhooks/eshopbox`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'x-eshopbox-signature': signature } : {}),
    },
    body,
  });

const sign = (body) => createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');

const sample =
  (await db.collection('shipments').findOne({ status: 'PICKED_UP' })) ??
  (await db.collection('shipments').findOne({ status: 'IN_TRANSIT' }));

if (!sample) {
  check('a parcel in transit exists to test the webhook against', false);
} else {
  const body = JSON.stringify({
    eventId: `smoke-${Date.now()}`,
    customerOrderNumber: sample.shipmentNumber,
    awbNumber: sample.awb,
    status: 'out_for_delivery',
    location: 'Bengaluru Hub',
    occurredAt: new Date().toISOString(),
  });

  const unsigned = await post(body, null);
  check('unsigned webhook is rejected', unsigned.status === 401, `got ${unsigned.status}`);

  const forged = await post(body, 'deadbeef'.repeat(8));
  check('a forged signature is rejected', forged.status === 401, `got ${forged.status}`);

  const signed = await post(body, sign(body));
  const signedBody = await signed.json().catch(() => ({}));
  check('signed webhook is accepted', signed.status === 200 && signedBody.ok === true);
  check(
    'signed webhook advanced the parcel',
    String(signedBody.outcome ?? '').startsWith('applied:'),
    String(signedBody.outcome),
  );

  const replay = await post(body, sign(body));
  const replayBody = await replay.json().catch(() => ({}));
  check('replayed webhook is a no-op', replayBody.duplicate === true, JSON.stringify(replayBody));

  const after = await db.collection('shipments').findOne({ _id: sample._id });
  check('parcel moved to out for delivery', after.status === 'OUT_FOR_DELIVERY', after.status);
  check(
    'the scan reached the order items',
    (await db.collection('orderItems').countDocuments({
      _id: { $in: sample.items.map((i) => i.orderItemId) },
      status: 'OUT_FOR_DELIVERY',
    })) > 0,
  );

  const staleBody = JSON.stringify({
    eventId: `smoke-stale-${Date.now()}`,
    customerOrderNumber: sample.shipmentNumber,
    awbNumber: sample.awb,
    status: 'intransit',
    occurredAt: new Date(Date.now() - 86_400_000).toISOString(),
  });
  const stale = await post(staleBody, sign(staleBody));
  const staleResult = await stale.json().catch(() => ({}));
  check(
    'a stale scan cannot rewind the parcel',
    String(staleResult.outcome ?? '').startsWith('skipped:'),
    String(staleResult.outcome),
  );

  const unknownBody = JSON.stringify({
    eventId: `smoke-unknown-${Date.now()}`,
    customerOrderNumber: 'SH0000000000000',
    status: 'delivered',
    occurredAt: new Date().toISOString(),
  });
  const unknown = await post(unknownBody, sign(unknownBody));
  const unknownResult = await unknown.json().catch(() => ({}));
  check(
    'a webhook for an unknown parcel is journalled, not fatal',
    unknown.status === 200 && unknownResult.outcome === 'shipment-not-found',
    String(unknownResult.outcome),
  );
}

/* ----------------------------------------------------------- the screens */

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

const parcel = await db.collection('shipments').findOne({ awb: { $ne: null } });

if (parcel) {
  const seller = await db.collection('sellers').findOne({ _id: parcel.sellerId });
  const ownerUser = await db.collection('users').findOne({ _id: seller.ownerUserId });
  const { context, page } = await sessionFor(ownerUser.email);

  await page.goto(`${BASE}/seller/shipments`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const listText = await page.locator('body').innerText();
  check('seller shipment queue renders', /Shipments/i.test(listText));

  // The queue defaults to "needs action", which is correctly EMPTY for a seller
  // with nothing left to label or hand over. The full history is a tab away, so
  // that is where the listing itself is checked.
  await page.goto(`${BASE}/seller/shipments?status=ALL`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const allText = await page.locator('body').innerText();
  check('queue lists parcels', /SH\d{10}/.test(allText), allText.slice(-200));

  await page.goto(`${BASE}/seller/shipments/${parcel._id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const detailText = await page.locator('body').innerText();
  check('seller parcel detail renders', detailText.includes(parcel.shipmentNumber));
  check('parcel detail shows the AWB', detailText.includes(parcel.awb), detailText.slice(0, 160));
  check('parcel detail shows the tracking timeline', /Shipment created|Packed|Picked up|Delivered/i.test(detailText));

  await page.goto(`${BASE}/seller/shipments/${parcel._id}/label`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const labelText = await page.locator('body').innerText();
  const barcodes = await page.locator('svg[role="img"]').count();
  check('shipping label renders', labelText.includes(parcel.awb), labelText.slice(0, 160));
  check('label carries scannable barcodes', barcodes >= 2, `${barcodes} found`);
  check('label shows the destination pincode', labelText.includes(parcel.deliveryAddress.pincode));
  check('label shows the payment mode', /Prepaid|Collect COD/i.test(labelText));

  await context.close();

  /*
   * Ownership: a different seller must not be able to open this parcel.
   *
   * The intruder has to be an ACTIVE store. An unverified one is redirected to
   * its own onboarding screen before scoping is ever reached, which would prove
   * nothing about isolation while still looking like a pass.
   */
  const other = await db
    .collection('sellers')
    .findOne({ _id: { $ne: parcel.sellerId }, status: 'ACTIVE' });
  const otherUser = await db.collection('users').findOne({ _id: other.ownerUserId });
  const intruder = await sessionFor(otherUser.email);
  const response = await intruder.page.goto(`${BASE}/seller/shipments/${parcel._id}`, {
    waitUntil: 'domcontentloaded',
  });
  await intruder.page.waitForTimeout(600);
  const intruderText = await intruder.page.locator('body').innerText();
  /*
   * Assert on what actually matters — that none of the parcel's details reached
   * the intruder's browser. A status code alone would accept any redirect,
   * including one that happened to land somewhere harmless for another reason.
   */
  const leaked = [parcel.awb, parcel.shipmentNumber, parcel.deliveryAddress.pincode].filter(
    (value) => value && intruderText.includes(value),
  );
  check(
    'another seller cannot open the parcel',
    leaked.length === 0 && (response?.status() === 404 || /not found|404/i.test(intruderText)),
    leaked.length ? `leaked ${leaked.join(', ')}` : `status ${response?.status()}`,
  );
  await intruder.context.close();
}

/* --------------------------------------------------------- customer view */

const shipped = await db.collection('shipments').find({ awb: { $ne: null } }).limit(120).toArray();
const trackedOrder = await db.collection('orders').findOne({
  _id: { $in: shipped.map((s) => s.orderId) },
  userId: { $ne: null },
});

if (trackedOrder) {
  const customer = await db.collection('users').findOne({ _id: trackedOrder.userId });
  const { context, page } = await sessionFor(customer.email);

  await page.goto(`${BASE}/orders/${trackedOrder._id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const text = await page.locator('body').innerText();

  check('customer order page renders', text.includes(trackedOrder.orderNumber));
  check('customer sees courier tracking', /AWB|Courier/i.test(text), text.slice(0, 200));

  await context.close();
}

await browser.close();
await client.close();

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
