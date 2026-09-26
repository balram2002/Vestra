/**
 * Marketing page designer, end to end, against a running server.
 *
 *     npm run start &
 *     npm run smoke:marketing
 *
 * Signs in as the Marketing Manager and drives the Store page designer the
 * way a person would, checking the one promise the designer makes: SHOPPERS
 * SEE NOTHING UNTIL PUBLISH. A second, signed-out browser plays the shopper.
 *
 *   draft      choosing a layout saves a draft; the public page is unchanged
 *   preview    the framed preview shows the draft
 *   publish    the public page changes
 *   discard    a draft thrown away leaves nothing pending
 *   schedule   a schedule can be set and cancelled
 *   history    an older version can be put back
 *
 * It leaves the Store page as it found it: Classic, published.
 *
 * Needs the local test outbox for the staff sign-in code, so run the server
 * without SMTP configured.
 */

import { chromium } from '@playwright/test';
import { readdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'vestra123';
const EMAIL = 'marketing@vestra.test';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const staff = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const shopper = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
staff.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));

try {
  /* ---------------------------------------------------------- sign in */
  await staff.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await staff.fill('input[name="email"]', EMAIL);
  await staff.fill('input[name="password"]', PASSWORD);
  await staff.click('button[type="submit"]');
  await staff.waitForURL((url) => url.pathname === '/login/verify' || !url.pathname.startsWith('/login'), { timeout: 60000 });
  if (new URL(staff.url()).pathname === '/login/verify') {
    const files = (await readdir('.data/outbox')).filter((name) => name.includes('sign-in-code')).sort();
    const code = files.at(-1)?.match(/-(\d{6})-/)?.[1];
    if (!code) throw new Error('Sign-in code missing from the local outbox — is SMTP configured?');
    await staff.getByLabel('Sign-in code').fill(code);
    await staff.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60000 });
  }

  /* --------------------------------------------------------- overview */
  await staff.goto(`${BASE}/admin/marketing`, { waitUntil: 'domcontentloaded' });
  await staff.getByRole('heading', { name: 'Page designs' }).waitFor({ timeout: 60000 });
  check('Marketing overview renders', true);

  /* ---------------------------------------------------------- designer */
  // Hydrated before the first click: a click on server HTML does nothing.
  await staff.goto(`${BASE}/admin/design/store`, { waitUntil: 'networkidle' });
  const status = staff.getByRole('status').filter({ hasText: /draft|unpublished/i });
  await status.waitFor({ timeout: 60000 });
  const slug = await staff.getByLabel('Preview with store').inputValue();
  const storeUrl = `${BASE}/store/${slug}`;

  const card = (name) => staff.getByRole('article').filter({ hasText: name });
  const chooseLayout = async (name) => {
    const button = card(name).getByRole('button', { name: 'Use this layout' });
    // Already the layout in use: nothing to choose.
    if ((await button.count()) === 0) return;
    await button.click();
    await staff.getByText(/Draft saved\. Will publish/).waitFor({ timeout: 30000 });
  };
  const publish = async () => {
    await staff.getByRole('button', { name: 'Publish', exact: true }).click();
    await staff.getByRole('button', { name: 'Publish now' }).click();
    await staff.getByText('Published — live now').waitFor({ timeout: 30000 });
  };
  const liveIsSpotlight = async () => {
    await shopper.goto(storeUrl, { waitUntil: 'domcontentloaded' });
    await shopper.locator('h1').first().waitFor({ timeout: 60000 });
    return (await shopper.locator('h1.uppercase').count()) > 0;
  };

  // Start from a known state: Classic live, nothing pending.
  if (await staff.getByRole('button', { name: 'Discard' }).isVisible()) {
    await staff.getByRole('button', { name: 'Discard' }).click();
    await staff.getByRole('button', { name: 'Discard draft' }).click();
    await staff.getByText('Draft discarded').waitFor({ timeout: 30000 });
  }
  const liveLine = await staff.locator('p', { hasText: 'Live: Variant' }).first().innerText();
  console.log(`  (start: ${liveLine.replace(/\s+/g, ' ').trim()})`);
  if (!/Live: Variant 1/.test(liveLine)) {
    await chooseLayout('Variant 1 · Classic');
    await publish();
  }

  // Draft.
  await chooseLayout('Variant 2 · Spotlight');
  check('Choosing a layout saves a draft', true);
  check('Shoppers do not see the draft', !(await liveIsSpotlight()));

  // Preview.
  const frame = staff.frameLocator('iframe[title="Page preview"]');
  await frame.getByText(/Preview · Variant \d/).first().waitFor({ timeout: 60000 });
  check('The preview frame renders the page', true);

  // Publish.
  await publish();
  check('Publishing makes it live for shoppers', await liveIsSpotlight());

  // Discard.
  await chooseLayout('Variant 3 · Studio');
  await staff.getByRole('button', { name: 'Discard' }).click();
  await staff.getByRole('button', { name: 'Discard draft' }).click();
  await staff.getByText('Draft discarded').waitFor({ timeout: 30000 });
  check('Discarding leaves nothing pending', await staff.getByText('Nothing unpublished').isVisible());

  // Schedule, then cancel.
  await chooseLayout('Variant 1 · Classic');
  await staff.getByRole('button', { name: 'Schedule', exact: true }).click();
  const soon = new Date(Date.now() + 3 * 86_400_000);
  const local = new Date(soon.getTime() - soon.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await staff.getByLabel('Go live at').fill(local);
  await staff.getByRole('dialog').getByRole('button', { name: 'Schedule' }).click();
  await staff.getByText(/Goes live/).waitFor({ timeout: 30000 });
  check('A draft can be scheduled', true);
  check('A scheduled change is not live yet', await liveIsSpotlight());
  await staff.getByRole('button', { name: 'Cancel the schedule' }).click();
  await staff.getByText('Schedule cancelled').waitFor({ timeout: 30000 });
  check('A schedule can be cancelled', !(await staff.getByText(/Goes live/).isVisible()));

  // History: publish Classic, then put Spotlight back, then restore Classic.
  await chooseLayout('Variant 1 · Classic');
  await publish();
  check('Classic is live again', !(await liveIsSpotlight()));
  await staff.getByRole('button', { name: 'Put back' }).first().click();
  await staff.getByRole('button', { name: 'Put it back' }).click();
  await staff.getByText('That version is live again').waitFor({ timeout: 30000 });
  check('An older version can be put back', await liveIsSpotlight());

  await chooseLayout('Variant 1 · Classic');
  await publish();
  check('Left as found: Classic live', !(await liveIsSpotlight()));

  /* ----------------------------------------------------------- coupons */
  const code = `SMK${Date.now().toString(36).toUpperCase().slice(-6)}`;
  // Lists stream in behind a skeleton: wait for the row, don't just glance.
  const appears = (locator) => locator.first().waitFor({ timeout: 30000 }).then(() => true, () => false);
  await staff.goto(`${BASE}/admin/coupons/new`, { waitUntil: 'networkidle' });
  await staff.getByLabel('Code', { exact: true }).fill(code);
  await staff.getByLabel('Title', { exact: true }).fill('Smoke test coupon');
  // A flat discount with no minimum could make an order free: refused on the field.
  await staff.getByRole('radio', { name: 'Amount off' }).click();
  await staff.getByRole('spinbutton', { name: 'Amount off' }).fill('300');
  await staff.getByLabel('Minimum order', { exact: true }).fill('100');
  await staff.getByRole('button', { name: 'Create coupon' }).click();
  await staff.getByText('Set a minimum above the discount').first().waitFor({ timeout: 30000 });
  check('Coupon rules are enforced on the field', true);

  await staff.getByLabel('Minimum order', { exact: true }).fill('1499');
  check(
    'The preview describes the rules',
    await staff.getByText('₹300 off · orders above ₹1,499').isVisible(),
  );
  await staff.getByRole('button', { name: 'Create coupon' }).click();
  await staff.waitForURL(/\/admin\/coupons\/cpn_/, { timeout: 30000 });
  const couponUrl = staff.url();
  check('Creating a coupon opens its page', true);

  await staff.goto(`${BASE}/admin/coupons?q=${code}`, { waitUntil: 'domcontentloaded' });
  check('It is listed as live', await appears(staff.getByRole('row').filter({ hasText: code }).getByText('Live')));

  await staff.goto(couponUrl, { waitUntil: 'networkidle' });
  await staff.getByLabel('Title', { exact: true }).fill('Smoke test coupon, edited');
  await staff.getByRole('button', { name: 'Save changes' }).click();
  await staff.getByText('Saved — live rules updated').waitFor({ timeout: 30000 });
  check('A coupon can be edited', true);

  await staff.getByRole('link', { name: 'Duplicate' }).click();
  await staff.waitForURL(/\/admin\/coupons\/new\?from=/, { timeout: 30000 });
  await staff.getByRole('heading', { name: `Duplicate ${code}` }).waitFor({ timeout: 30000 });
  check(
    'Duplicating keeps the rules with a fresh code',
    // Next keeps the page just left mounted but hidden; read the visible form.
    (await staff.getByLabel('Title', { exact: true }).filter({ visible: true }).inputValue()).includes('(copy)') &&
      (await staff.getByLabel('Code', { exact: true }).filter({ visible: true }).inputValue()) === '',
  );

  await staff.goto(couponUrl, { waitUntil: 'networkidle' });
  await staff.getByRole('button', { name: 'Archive' }).click();
  await staff.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
  await staff.getByText(`${code} archived`).waitFor({ timeout: 30000 });
  await staff.goto(`${BASE}/admin/coupons?status=archived&q=${code}`, { waitUntil: 'domcontentloaded' });
  check('Archiving moves it to Archived', await appears(staff.getByRole('row').filter({ hasText: code })));
} catch (error) {
  const where = String(error.stack ?? '').split('\n').find((line) => line.includes('smoke-marketing')) ?? '';
  check('Run completed', false, `${String(error).split('\n')[0]} ${where.trim()}`);
  await staff.screenshot({ path: '.data/smoke-marketing-failure.png', fullPage: true }).catch(() => {});
} finally {
  check('No page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
