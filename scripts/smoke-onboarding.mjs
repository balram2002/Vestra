/**
 * Seller onboarding smoke test.
 *
 *     npm run start &
 *     node scripts/smoke-onboarding.mjs
 *
 * Takes a customer account through applying to sell, and checks the thing that
 * makes onboarding safe rather than merely present: an unverified store CANNOT
 * trade. The applicant gets the SELLER role the moment they apply — otherwise
 * they could not reach the screen that asks for their documents — so the
 * console has to gate on the store's STATUS, not on the role.
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

/* ------------------------------------------------- a customer with no store */

const applicant = await db.collection('users').findOne({
  roles: { $eq: ['CUSTOMER'] },
  sellerId: null,
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

/*
 * Everything from here runs inside a try/finally.
 *
 * This test mutates a real seeded account — it grants it a store and a role —
 * so a crash halfway through leaves behind an applicant who still owns an
 * unverified store. That residue is not inert: the next suite that reaches for
 * "some other seller" can pick it up and get a redirect where it expected a
 * refusal, which reads as a security failure that is really just litter.
 */
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  await page.fill('input[name="email"]', applicant.email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);

  /* -------------------------------------------------------- before applying */

  const beforeConsole = await page.goto(`${BASE}/seller`, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  check(
    'a customer cannot reach the seller console',
    !new URL(page.url()).pathname.startsWith('/seller') || beforeConsole?.status() === 403,
    page.url(),
  );

  /* ---------------------------------------------------------------- apply */

  const storeName = `Smoke Looms ${Date.now().toString().slice(-5)}`;

  await page.goto(`${BASE}/sell-with-us/apply`, { waitUntil: 'load' });
  /*
   * Anchored label matches throughout.
   *
   * `getByLabel` matches the label element's raw text, which here includes the
   * visible hint underneath it — so an exact match on "Store name" finds
   * nothing, while a loose match for "PAN" hits the business-type select,
   * because "Private limited company" contains those three letters. Anchoring to
   * the start of the label is the one form that is both precise and true.
   *
   * The markup itself is fine: the hints are `aria-hidden`, so the field's
   * ACCESSIBLE name — what a screen reader announces — is just the label.
   */
  await page.getByLabel(/^Store\ name/).waitFor({ state: 'visible', timeout: 20000 });
  check('the application form is reachable', true);

  await page.getByLabel(/^Store\ name/).fill(storeName);
  await page
    .getByLabel(/^About\ your\ store/)
    .fill('Handwoven cotton and linen made by a small workshop in Jaipur, dyed in small batches.');
  await page.getByLabel(/^Registered\ business\ name/).fill('Smoke Looms Private Limited');

  // Rajasthan is state code 08, so the GSTIN has to start with it.
  await page.getByLabel(/^GSTIN/).fill('08ABCDE1234F1Z5');
  await page.getByLabel(/^PAN/).fill('ABCDE1234F');
  await page.getByLabel(/^Address/).fill('12, Amer Road');
  await page.getByLabel(/^City/).fill('Jaipur');
  await page.getByLabel(/^State/).selectOption('Rajasthan');
  await page.getByLabel(/^Pincode/).fill('302002');
  await page.getByLabel(/^Support\ email/).fill('help@smokelooms.example');
  await page.getByLabel(/^Support\ phone/).fill('9812345671');
  await page.getByLabel(/^Account\ holder\ name/).fill('Smoke Looms Private Limited');
  await page.getByLabel(/^Bank\ name/).fill('HDFC Bank');
  await page.getByLabel(/^Account\ number/).fill('50100123456789');
  await page.getByLabel(/^IFSC/).fill('HDFC0001234');

  // At least one category is required.
  await page.locator('input[type="checkbox"]').first().check();

  /* ----------------------------------------- the GSTIN must match the state */

  await page.getByLabel(/^State/).selectOption('Karnataka');
  await page.getByRole('button', { name: /Continue to documents/i }).click();
  await page.waitForTimeout(2000);

  const mismatch = await page.locator('[role="alert"]').first().innerText().catch(() => '');
  check(
    'a GSTIN that disagrees with the state is refused',
    /GSTIN|state/i.test(mismatch),
    mismatch.slice(0, 90),
  );

  /* ---------------------------------------------------------- submit for real */

  await page.getByLabel(/^State/).selectOption('Rajasthan');
  await page.getByRole('button', { name: /Continue to documents/i }).click();
  await page.waitForURL(/\/seller\/onboarding/, { timeout: 30000 }).catch(() => {});

  check('applying lands on the onboarding screen', /\/seller\/onboarding/.test(page.url()), page.url());

  const store = await db.collection('sellers').findOne({ ownerUserId: applicant._id });
  check('a store was created', Boolean(store), store?.displayName ?? '');

  if (store) {
    check('it starts in onboarding', store.status === 'ONBOARDING', store.status);
    check('it has a unique store code', Boolean(store.code), store.code);
    check('it has a slug', Boolean(store.slug), store.slug);
    check(
      'only the last four digits of the bank account are kept',
      store.bank.accountNumberMasked === '••••6789',
      store.bank.accountNumberMasked,
    );
    check(
      'a pickup location was created',
      (await db.collection('sellerLocations').countDocuments({ sellerId: store._id })) === 1,
    );

    const updated = await db.collection('users').findOne({ _id: applicant._id });
    check('the applicant now owns the store', updated.sellerId === store._id);
    check('and has the seller role', updated.roles.includes('SELLER'));

    /* ------------------------------ an unverified store still cannot trade */

    for (const path of ['/seller', '/seller/products', '/seller/orders']) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
      await page.waitForTimeout(700);
      check(
        `an unverified store is kept out of ${path}`,
        new URL(page.url()).pathname === '/seller/onboarding',
        page.url(),
      );
    }

    /* ------------------------------------------- documents gate submission */

    await page.goto(`${BASE}/seller/onboarding`, { waitUntil: 'load' });
    await page.waitForTimeout(1200);

    const sendForReview = page.getByRole('button', { name: /Send for review/i });
    check('submission is blocked until documents are uploaded', await sendForReview.isDisabled());

    const onboardingText = await page.locator('body').innerText();
    check('it names what is still needed', /GST certificate/i.test(onboardingText));

    /* --------------------------------- upload the four, then send for review */

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    for (const type of ['GST_CERTIFICATE', 'PAN_CARD', 'CANCELLED_CHEQUE', 'ADDRESS_PROOF']) {
      await page
        .locator(`#kyc-${type}`)
        .setInputFiles({ name: `${type.toLowerCase()}.png`, mimeType: 'image/png', buffer: png });
      await page.waitForTimeout(1500);
    }

    const withDocuments = await db.collection('sellers').findOne({ _id: store._id });
    check(
      'all four documents were stored',
      withDocuments.kyc.documents.length === 4,
      `${withDocuments.kyc.documents.length} uploaded`,
    );

    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /Send for review/i }).click();

    for (let attempt = 0; attempt < 40; attempt++) {
      const now = await db.collection('sellers').findOne({ _id: store._id });
      if (now.status !== 'ONBOARDING') break;
      await page.waitForTimeout(250);
    }

    const submitted = await db.collection('sellers').findOne({ _id: store._id });
    check('the application moved into review', submitted.status === 'KYC_SUBMITTED', submitted.status);

    /* -------------------------------- documents lock once it is in review */

    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const lockedText = await page.locator('body').innerText();
    check('documents lock while in review', /Locked while your application is in review/i.test(lockedText));

    /* -------------------------------------------- it reaches the admin queue */

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`${BASE}/login`, { waitUntil: 'load' });
    await adminPage.fill('input[name="email"]', 'admin@vestra.test');
    await adminPage.fill('input[name="password"]', PASSWORD);
    await Promise.all([
      adminPage.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 }),
      adminPage.click('button[type="submit"]'),
    ]);

    await adminPage.goto(`${BASE}/admin/sellers?status=KYC_SUBMITTED`, { waitUntil: 'load' });
    await adminPage.waitForTimeout(1800);
    const queueText = await adminPage.locator('body').innerText();
    check('the application appears in the admin queue', queueText.includes(storeName), storeName);
    await adminContext.close();
  }
} finally {
  await restore();
}

check('applicant account restored', Boolean(await db.collection('users').findOne({ _id: applicant._id, sellerId: null })));

await browser.close();
await client.close();

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
