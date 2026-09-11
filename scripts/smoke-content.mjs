/**
 * Content console smoke test.
 *
 *     npm run start &
 *     node --env-file=.env.local scripts/smoke-content.mjs
 *
 * Drives the homepage banners and the site-page editor through the real UI,
 * and checks each change reaches both the database and the storefront:
 *
 *   - a banner with a javascript: link is refused, under the Links to field;
 *   - a banner is created from an image link and appears on the homepage;
 *   - hidden, it leaves the homepage; deleted, it leaves the database;
 *   - a page edit is saved and served, an empty page is refused, and the
 *     contact page carries its contact block and a way to raise a ticket
 *     without inventing any details.
 *
 * Everything it changes is put back at the end, pass or fail. It needs the
 * demo seed for the superadmin account, and the site pages from either seed.
 */

import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const stamp = Date.now().toString(36).slice(-5).toLowerCase();
const NAME = `Smoke banner ${stamp}`;
const HREF = `/search?q=smoke-${stamp}`;
const IMAGE = 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=1600&h=900&q=80';
const TITLE = `Contact us ${stamp}`;

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db(process.env.MONGODB_DB ?? 'vestrawab');

const contact = await db.collection('cmsPages').findOne({ slug: 'help/contact' });
if (!contact) {
  console.log('\n  No help/contact page. Run npm run seed:reference (or npm run seed) first.\n');
  await client.close();
  process.exit(1);
}

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

/**
 * Whether the homepage links to the test banner.
 *
 * Asked a few times: the action invalidates the content cache, but the page a
 * browser gets straight afterwards can still be the one rendered a moment
 * before.
 */
async function homepageLinksToBanner() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    if ((await page.locator(`a[href="${HREF}"]`).count()) > 0) return true;
    await page.waitForTimeout(1500);
  }
  return false;
}

async function homepageDropsBanner() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    if ((await page.locator(`a[href="${HREF}"]`).count()) === 0) return true;
    await page.waitForTimeout(1500);
  }
  return false;
}

try {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', 'superadmin@vestra.test');
  await page.fill('input[name="password"]', 'vestra123');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);

  console.log('\n  homepage banners\n');

  await step('banner: a javascript: link is refused under the field', async () => {
    await page.goto(`${BASE}/admin/cms`);
    await page.getByRole('button', { name: 'Add tile' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name="name"]').fill(NAME);
    // The tile grid shows every banner it has; the hero shows one at a time.
    await dialog.locator('select[name="placement"]').selectOption('HOME_GRID');
    await dialog.locator('input[name="imageUrl"]').fill(IMAGE);
    await dialog.locator('input[name="alt"]').fill('A folded stack of cotton shirts');
    await dialog.locator('input[name="headline"]').fill(`Smoke ${stamp}`);
    await dialog.locator('input[name="href"]').fill('javascript:alert(1)');
    await dialog.getByRole('button', { name: 'Add banner' }).click();
    await dialog.getByText('Use a path on this site').waitFor({ timeout: 15000 });
    if (await db.collection('banners').findOne({ name: NAME })) throw new Error('stored despite the bad link');
  });

  await step('banner: created, stored, and on the homepage', async () => {
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name="href"]').fill(HREF);
    await dialog.getByRole('button', { name: 'Add banner' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 15000 });

    const doc = await db.collection('banners').findOne({ name: NAME });
    if (!doc) throw new Error('no banner document');
    if (doc.placement !== 'HOME_GRID' || !doc.isActive || doc.imageUrl !== IMAGE) {
      throw new Error(`stored ${doc.placement}, active ${doc.isActive}`);
    }
    if (!(await homepageLinksToBanner())) throw new Error('the homepage does not link to it');
  });

  await step('banner: hidden, it leaves the homepage', async () => {
    await page.goto(`${BASE}/admin/cms`);
    const card = page.locator('li', { hasText: NAME });
    await card.getByRole('switch').click();
    await card.locator('[role="switch"][aria-checked="false"]').waitFor({ timeout: 15000 });

    const doc = await db.collection('banners').findOne({ name: NAME });
    if (doc?.isActive !== false) throw new Error('still active in the database');
    if (!(await homepageDropsBanner())) throw new Error('still on the homepage');
  });

  await step('banner: deleted, after a confirmation', async () => {
    await page.goto(`${BASE}/admin/cms`);
    const card = page.locator('li', { hasText: NAME });
    await card.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete banner' }).click();
    await card.waitFor({ state: 'detached', timeout: 15000 });
    if (await db.collection('banners').findOne({ name: NAME })) throw new Error('still in the database');
  });

  console.log('\n  site pages\n');

  await step('page: an edit is saved and served', async () => {
    await page.goto(`${BASE}/admin/pages`);
    await page.getByRole('link', { name: contact.title, exact: true }).first().click();
    await page.waitForURL(/\/admin\/pages\/[^/]+$/, { timeout: 15000 });
    await page.locator('input[name="title"]').fill(TITLE);
    await page.getByRole('button', { name: 'Save page' }).click();
    await page.getByText('Page saved').waitFor({ timeout: 15000 });

    const doc = await db.collection('cmsPages').findOne({ slug: 'help/contact' });
    if (doc?.title !== TITLE) throw new Error(`stored title ${doc?.title}`);

    await page.goto(`${BASE}/help/contact`);
    await page.getByRole('heading', { level: 1, name: TITLE }).waitFor({ timeout: 15000 });
  });

  await step('page: the contact block offers a ticket and invents nothing', async () => {
    await page.getByRole('heading', { name: 'Reach us' }).waitFor({ timeout: 15000 });
    await page.getByRole('link', { name: 'your support tickets' }).waitFor({ timeout: 15000 });
    const text = await page.locator('body').innerText();
    if (/vestrawab\.example|4718 0000|Residency Road/.test(text)) throw new Error('made-up contact details on the page');
  });

  await step('page: an empty page is refused under the field', async () => {
    await page.goto(`${BASE}/admin/pages/${contact._id}`);
    await page.locator('textarea[name="body"]').fill('');
    await page.getByRole('button', { name: 'Save page' }).click();
    await page.getByText('The page needs some text.').waitFor({ timeout: 15000 });
    const doc = await db.collection('cmsPages').findOne({ slug: 'help/contact' });
    if (!doc?.body) throw new Error('an empty body was stored');
  });

  if (pageErrors.length > 0) {
    failures += 1;
    console.log(`\n  FAIL  uncaught page errors:\n        ${pageErrors.join('\n        ')}`);
  }
} finally {
  await db.collection('banners').deleteMany({ name: NAME });
  await db.collection('cmsPages').replaceOne({ _id: contact._id }, contact);
  await browser.close();
  await client.close();
}

console.log(failures === 0 ? '\n  all content checks passed\n' : `\n  ${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
