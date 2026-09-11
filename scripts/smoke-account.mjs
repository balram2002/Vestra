/**
 * A brand-new customer, end to end.
 *
 *     npm run start &
 *     node --env-file=.env.local scripts/smoke-account.mjs
 *
 * Signs up as a new person and does what a new person does first. Each of
 * these had no working path before:
 *
 *   1. checkout with an EMPTY address book adds an address in place and
 *      places the order (it used to link to a page whose Add button was
 *      disabled, so a new customer could not buy at all);
 *   2. the address book adds, re-defaults, edits and removes;
 *   3. the profile saves a new name, and a changed password is the one that
 *      signs in;
 *   4. a support request is opened against the order, and answered by the
 *      customer in its thread.
 *
 * The account is recreated on every run and removed at the end with its
 * addresses, bag and tickets. Its order stays, like the funnel's.
 */

import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const EMAIL = 'account-smoke@example.com';
const PASSWORD = 'vestra-smoke-1';
const NEW_PASSWORD = 'vestra-smoke-2';

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db(process.env.MONGODB_DB ?? 'vestrawab');

const collectionNames = (await db.listCollections().toArray()).map((entry) => entry.name);
const ticketCollection = collectionNames.find((name) => /ticket/i.test(name));

async function purge() {
  for (const user of await db.collection('users').find({ email: EMAIL }).toArray()) {
    await db.collection('addresses').deleteMany({ userId: user._id });
    await db.collection('carts').deleteMany({ userId: user._id });
    if (ticketCollection) await db.collection(ticketCollection).deleteMany({ userId: user._id });
    await db.collection('users').deleteOne({ _id: user._id });
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

const findUser = () => db.collection('users').findOne({ email: EMAIL });

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

async function fillAddress(dialog, address) {
  await dialog.locator('input[name="fullName"]').fill('Smoke Test Shopper');
  await dialog.locator('input[name="phone"]').fill('9876543210');
  await dialog.locator('input[name="line1"]').fill(address.line1);
  await dialog.locator('input[name="city"]').fill(address.city);
  await dialog.locator('select[name="state"]').selectOption(address.state);
  await dialog.locator('input[name="pincode"]').fill(address.pincode);
}

await purge();
console.log('\n  a brand-new customer\n');

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await step('a new customer can register', async () => {
    await page.goto(`${BASE}/register`, { waitUntil: 'load' });
    await page.fill('input[name="fullName"]', 'Smoke Test Shopper');
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.fill('input[name="phone"]', '9876543210');
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/register'), { timeout: 30000 }),
      page.click('button[type="submit"]'),
    ]);
    if (!(await findUser())) throw new Error('no user was written');
  });

  await step('an item goes in the bag', async () => {
    await page.goto(`${BASE}/category/womens-ethnic-wear`, { waitUntil: 'load' });
    const href = await page.locator('a[href^="/product/"]').first().getAttribute('href');
    await page.goto(BASE + href, { waitUntil: 'load' });
    const sizes = page.locator('#size-options button[aria-pressed]');
    const count = await sizes.count();
    for (let i = 0; i < count; i++) {
      const size = sizes.nth(i);
      if ((await size.getAttribute('aria-disabled')) === 'true') continue;
      await size.click();
      break;
    }
    await page.getByRole('button', { name: /add to bag/i }).click();
    const user = await findUser();
    await poll(async () => {
      const cart = await db.collection('carts').findOne({ userId: user._id });
      return (cart?.items?.length ?? 0) > 0;
    });
  });

  await step('checkout with no saved address adds one in place', async () => {
    await page.goto(`${BASE}/checkout`, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Add an address' }).click();
    const dialog = page.getByRole('dialog');
    await fillAddress(dialog, {
      line1: '14, 2nd Cross, Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
    });
    await dialog.getByRole('button', { name: 'Save address' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 15000 });
    await page.locator('input[name="addressId"]:checked').waitFor({ timeout: 15000 });
  });

  let orderId = null;

  await step('the order is placed to that address', async () => {
    const cod = page.locator('input[name="paymentMethod"][value="COD"]');
    if (await cod.count()) await cod.check();
    await Promise.all([
      page.waitForURL(/\/orders\/|\/checkout\/payment\//, { timeout: 45000 }),
      page.getByRole('button', { name: /place order|^pay /i }).click(),
    ]);
    for (let attempt = 0; attempt < 4 && page.url().includes('/checkout/payment/'); attempt++) {
      await page.getByRole('button', { name: /^pay |try payment again/i }).click();
      await page.waitForTimeout(2500);
    }
    if (!/\/orders\/[^/]+/.test(page.url())) throw new Error(`landed on ${page.url()}`);
    orderId = new URL(page.url()).pathname.split('/').pop();
    const order = await db.collection('orders').findOne({ _id: orderId });
    if (!order || !JSON.stringify(order).includes('560038')) {
      throw new Error('the order does not carry the new address');
    }
  });

  /* ---------------------------------------------------------- the book */

  await step('the book adds a second address as the default', async () => {
    await page.goto(`${BASE}/account/addresses`, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Add address' }).click();
    const dialog = page.getByRole('dialog');
    await fillAddress(dialog, {
      line1: '2, Marine Lines',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400002',
    });
    await dialog.locator('input[name="isDefault"]').check({ force: true });
    await dialog.getByRole('button', { name: 'Save address' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 15000 });

    const user = await findUser();
    await poll(async () => {
      const book = await db.collection('addresses').find({ userId: user._id }).toArray();
      const second = book.find((address) => address.pincode === '400002');
      const first = book.find((address) => address.pincode === '560038');
      return book.length === 2 && second?.isDefault === true && first?.isDefault === false;
    });
  });

  await step('an address can be edited', async () => {
    const card = page.locator('li', { hasText: '400002' });
    await card.getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name="landmark"]').fill('Near the clock tower');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 15000 });
    await page.getByText('Near the clock tower').waitFor({ timeout: 15000 });
  });

  await step('removing the default hands the role to the other address', async () => {
    const card = page.locator('li', { hasText: '400002' });
    await card.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
    const user = await findUser();
    await poll(async () => {
      const book = await db.collection('addresses').find({ userId: user._id }).toArray();
      return book.length === 1 && book[0].isDefault === true && book[0].pincode === '560038';
    });
  });

  /* ------------------------------------------------------------ profile */

  await step('the profile saves a new name', async () => {
    await page.goto(`${BASE}/account/profile`, { waitUntil: 'load' });
    await page.locator('input[name="fullName"]').fill('Smoke Tested Shopper');
    await page.getByRole('button', { name: 'Save details' }).click();
    await poll(async () => (await findUser())?.fullName === 'Smoke Tested Shopper');
  });

  await step('a changed password signs in, and the old one does not', async () => {
    const before = (await findUser()).passwordHash;
    await page.locator('input[name="current"]').fill(PASSWORD);
    await page.locator('input[name="next"]').fill(NEW_PASSWORD);
    await page.locator('input[name="confirm"]').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Change password' }).click();
    await poll(async () => (await findUser())?.passwordHash !== before);

    const fresh = await browser.newContext();
    const login = await fresh.newPage();
    await login.goto(`${BASE}/login`, { waitUntil: 'load' });
    await login.fill('input[name="email"]', EMAIL);
    await login.fill('input[name="password"]', PASSWORD);
    await login.click('button[type="submit"]');
    await login.waitForTimeout(2500);
    if (!new URL(login.url()).pathname.startsWith('/login')) {
      throw new Error('the OLD password still signs in');
    }
    // The form clears after a failed attempt, so both fields go back in.
    await login.getByText('That email and password do not match.').waitFor({ timeout: 10000 });
    await login.fill('input[name="email"]', EMAIL);
    await login.fill('input[name="password"]', NEW_PASSWORD);
    await Promise.all([
      login.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 }),
      login.click('button[type="submit"]'),
    ]);
    await fresh.close();
  });

  /* ------------------------------------------------------------ support */

  await step('a support request opens against the order', async () => {
    await page.goto(`${BASE}/account/support`, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'New request' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('select[name="category"]').selectOption({ index: 1 });
    await dialog.locator('select[name="orderId"]').selectOption({ index: 1 });
    await dialog.locator('input[name="subject"]').fill('Smoke test: where is my parcel');
    await dialog
      .locator('textarea[name="body"]')
      .fill('Checking that a customer can open a request from the help page.');
    await dialog.getByRole('button', { name: 'Send request' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 15000 });
    await page.getByText('Smoke test: where is my parcel').waitFor({ timeout: 15000 });

    const user = await findUser();
    const ticket = ticketCollection
      ? await db.collection(ticketCollection).findOne({ userId: user._id })
      : null;
    if (!ticket?.orderId) throw new Error('the request is not linked to the order');
  });

  await step('the customer can reply in the thread', async () => {
    await page.locator('textarea[placeholder="Add a reply"]').fill('Adding a detail to my own request.');
    await page.getByRole('button', { name: 'Send reply' }).click();
    await page.getByText('Adding a detail to my own request.').waitFor({ timeout: 15000 });
  });
} catch {
  // Reported by `step`; later steps depend on the one that failed.
} finally {
  await purge();
  await browser.close();
  await client.close();
}

for (const message of pageErrors.slice(0, 3)) console.log(`  page error: ${message.slice(0, 160)}`);
console.log(`\n  ${failures === 0 ? 'a new customer can do everything they need' : `${failures} failed`}\n`);
process.exitCode = failures > 0 || pageErrors.length > 0 ? 1 : 0;