/**
 * Seller onboarding smoke test.
 *
 *     npm run start &
 *     node scripts/smoke-onboarding.mjs
 *
 * Takes a customer through the whole journey to selling, and checks the two
 * things that make it both easy and safe:
 *
 *   EASY  the application is business details only, goes straight to review,
 *         and a rejected one is corrected and resent from the status screen;
 *         the pickup address and bank account are added in the console later.
 *   SAFE  a store that is not approved cannot trade. The applicant gets the
 *         SELLER role the moment they apply, so the console gates on the
 *         store's STATUS, and an admin rejection must carry a reason.
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

console.log('\nSeller onboarding\n');

/*
 * Accounts other suites shop as, which this one must not turn into sellers: a
 * crash half-way would leave them owning a store, and the next suite would
 * fail somewhere unrelated and inexplicable.
 */
const RESERVED = ['ananya.iyer@example.com'];

const applicant = await db.collection('users').findOne({
  roles: { $eq: ['CUSTOMER'] },
  sellerId: null,
  email: { $nin: RESERVED },
});
check('found a customer without a store', Boolean(applicant), applicant?.email ?? '');

if (!applicant) {
  await client.close();
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(1);
}

// Leave the account as we found it, whatever happens below.
const restore = async () => {
  const store = await db.collection('sellers').findOne({ ownerUserId: applicant._id });
  if (store) {
    await db.collection('sellerLocations').deleteMany({ sellerId: store._id });
    await db.collection('sellers').deleteOne({ _id: store._id });
  }
  await db
    .collection('users')
    .updateOne({ _id: applicant._id }, { $set: { roles: ['CUSTOMER'], sellerId: null } });
};

await restore();

async function signIn(context, email) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000, waitUntil: 'domcontentloaded' }),
    page.click('button[type="submit"]'),
  ]);
  return page;
}

async function storeNow() {
  return db.collection('sellers').findOne({ ownerUserId: applicant._id });
}

/** Waits for the store to reach a status, since actions settle a beat after the click. */
async function storeReaches(status) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const store = await storeNow();
    if (store?.status === status) return store;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return storeNow();
}

const browser = await chromium.launch();
try {
  const page = await signIn(await browser.newContext({ viewport: { width: 1280, height: 900 } }), applicant.email);

  /* -------------------------------------------------------- before applying */

  const beforeConsole = await page.goto(`${BASE}/seller`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  check(
    'a customer cannot reach the seller console',
    !new URL(page.url()).pathname.startsWith('/seller') || beforeConsole?.status() === 403,
    page.url(),
  );

  /* ---------------------------------------------------------------- apply */

  const storeName = `Smoke Looms ${Date.now().toString().slice(-5)}`;
  await page.goto(`${BASE}/sell-with-us/apply`, { waitUntil: 'domcontentloaded' });
  const form = page.locator('form').filter({ has: page.locator('input[name="displayName"]') });
  await form.waitFor({ state: 'visible', timeout: 20000 });
  check('the application form is reachable', true);

  const fields = await form.locator('input:not([type="hidden"]), select, textarea').count();
  check('the application is short: eight fields or fewer', fields <= 8, `${fields} fields`);
  check(
    'it does not ask for bank or pickup details',
    (await form.locator('input[name="accountNumber"], input[name="pincode"], input[name="ifsc"]').count()) === 0,
  );

  await form.getByRole('button', { name: 'Send application' }).click();
  await form.getByText('Give your store a name').waitFor({ timeout: 15000 }).catch(() => {});
  check('an empty application names the missing field', await form.getByText('Give your store a name').isVisible());

  await page.fill('input[name="displayName"]', storeName);
  await page.fill('input[name="supportPhone"]', '9812345671');
  await page.fill('input[name="city"]', 'Jaipur');
  await form.getByRole('button', { name: 'Women', exact: true }).click();

  // Rajasthan is state code 08, so a GSTIN starting 08 with Karnataka is wrong.
  await page.fill('input[name="gstin"]', '08ABCDE1234F1Z5');
  await page.selectOption('select[name="state"]', 'Karnataka');
  await form.getByRole('button', { name: 'Send application' }).click();
  await form.getByText(/not the code for Karnataka/).waitFor({ timeout: 15000 }).catch(() => {});
  check(
    'a GSTIN that disagrees with the state is refused, under the field',
    await form.getByText(/not the code for Karnataka/).isVisible(),
  );

  await page.selectOption('select[name="state"]', 'Rajasthan');
  await Promise.all([
    page.waitForURL(/\/seller\/onboarding/, { timeout: 30000 }).catch(() => {}),
    form.getByRole('button', { name: 'Send application' }).click(),
  ]);
  check('applying lands on the status screen', /\/seller\/onboarding/.test(page.url()), page.url());

  const store = await storeNow();
  check('a store was created', Boolean(store), store?.displayName ?? '');
  if (!store) throw new Error('no store to continue with');

  check('it goes straight to review', store.status === 'KYC_SUBMITTED', store.status);
  check('it has a unique store code and a slug', Boolean(store.code && store.slug), `${store.code} ${store.slug}`);
  check('no bank account was needed', store.bank.accountNumberMasked === '');
  check(
    'no pickup address was needed',
    (await db.collection('sellerLocations').countDocuments({ sellerId: store._id })) === 0,
  );

  const updated = await db.collection('users').findOne({ _id: applicant._id });
  check('the applicant owns the store and has the seller role', updated.sellerId === store._id && updated.roles.includes('SELLER'));

  // Wait for the words rather than for a moment: the status screen streams in
  // behind the shell, so reading the body too early reads the skeleton.
  await page
    .getByText(/We are reviewing your application/)
    .first()
    .waitFor({ timeout: 30000 })
    .catch(() => {});
  const status = await page.locator('body').innerText();
  check('the status screen says it is being reviewed', /We are reviewing your application/.test(status));

  /* ------------------------------------ a store in review still cannot trade */

  for (const path of ['/seller', '/seller/products', '/seller/settings']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    /*
     * The console redirects a store that cannot trade yet, and it does so from
     * inside a streamed boundary -- so the move happens in the browser, after
     * the shell has arrived. Waiting for the URL is the only honest check.
     */
    await page.waitForURL('**/seller/onboarding', { timeout: 30000 }).catch(() => {});
    check(`a store in review is kept out of ${path}`, new URL(page.url()).pathname === '/seller/onboarding', page.url());
  }

  /* ------------------------------------------------- admin: reject, with reason */

  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const admin = await signIn(adminContext, 'admin@vestra.test');

  await admin.goto(`${BASE}/admin/sellers?status=PENDING`, { waitUntil: 'domcontentloaded' });
  const row = admin.locator(':is(tr, li)', { hasText: storeName }).first();
  await row.waitFor({ timeout: 15000 }).catch(() => {});
  check('the application is in the admin queue', await row.isVisible(), storeName);

  await row.getByRole('button', { name: 'Reject' }).click();
  const confirm = row.getByRole('button', { name: 'Reject' });
  check('rejecting waits for a reason', await confirm.isDisabled());
  await row.locator('textarea').fill('Please add the city your workshop is in, not the head office.');
  await confirm.click();
  const rejected = await storeReaches('REJECTED');
  check('the application is sent back', rejected?.status === 'REJECTED', rejected?.status);
  check('with the reason kept for the applicant', /workshop/.test(rejected?.kyc?.rejectionReason ?? ''));

  /* ------------------------------------------------ applicant: correct, resend */

  await page.goto(`${BASE}/seller/onboarding`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  check('the applicant reads the reason', /workshop your workshop|workshop is in/.test(await page.locator('body').innerText()));

  await page.fill('input[name="city"]', 'Sanganer');
  await page.getByRole('button', { name: 'Send it again' }).click();
  const resent = await storeReaches('KYC_SUBMITTED');
  check('the corrected application goes back to review', resent?.status === 'KYC_SUBMITTED', resent?.status);
  check('with the correction', resent?.kyc?.registeredAddress?.city === 'Sanganer', resent?.kyc?.registeredAddress?.city);

  /* ---------------------------------------------------------- admin: approve */

  await admin.goto(`${BASE}/admin/sellers/${store._id}`, { waitUntil: 'domcontentloaded' });
  await admin.getByRole('button', { name: 'Approve' }).click();
  const approved = await storeReaches('ACTIVE');
  check('approving opens the store', approved?.status === 'ACTIVE' && Boolean(approved?.approvedAt), approved?.status);
  await adminContext.close();

  /* ------------------------------------------------ set up, when it is needed */

  await page.goto(`${BASE}/seller`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  check('the approved seller reaches the console', new URL(page.url()).pathname === '/seller', page.url());
  check(
    'the dashboard lists what is left to set up',
    /Finish setting up your store/.test(await page.locator('body').innerText()),
  );

  await page.goto(`${BASE}/seller/settings#pickup`, { waitUntil: 'domcontentloaded' });
  const pickup = page.locator('#pickup form');
  await pickup.locator('input[name="line1"]').fill('12, Amer Road');
  await pickup.locator('input[name="pincode"]').fill('302002');
  await pickup.locator('select[name="state"]').selectOption('Rajasthan');
  await pickup.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Pickup address saved').waitFor({ timeout: 15000 }).catch(() => {});
  check(
    'a pickup address can be added later',
    (await db.collection('sellerLocations').countDocuments({ sellerId: store._id, isPickupEnabled: true })) === 1,
  );

  const bank = page.locator('#bank form');
  await bank.locator('input[name="accountHolderName"]').fill('Smoke Looms');
  await bank.locator('input[name="bankName"]').fill('HDFC Bank');
  await bank.locator('input[name="accountNumber"]').fill('50100123456789');
  await bank.locator('input[name="ifsc"]').fill('HDFC0001234');
  await bank.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Payout account saved').waitFor({ timeout: 15000 }).catch(() => {});
  const withBank = await storeNow();
  check('a payout account can be added later, last four digits only', withBank?.bank?.accountNumberMasked === '••••6789', withBank?.bank?.accountNumberMasked);
} catch (error) {
  fail++;
  console.log(`  FAIL  stopped early: ${String(error.message).split('\n')[0]}`);
} finally {
  await restore();
}

check('applicant account restored', Boolean(await db.collection('users').findOne({ _id: applicant._id, sellerId: null })));

await browser.close();
await client.close();

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
