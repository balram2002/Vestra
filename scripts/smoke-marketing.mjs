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

/**
 * Poll a shopper-side check until it gives the expected answer or 15 seconds
 * pass. Publishing expires the cache at once, but the first request after it
 * can race the refresh; "within seconds" is the promise being tested.
 */
async function eventually(probe, expected) {
  const until = Date.now() + 15000;
  let value = await probe();
  while (value !== expected && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    value = await probe();
  }
  return value === expected;
}

const browser = await chromium.launch();
const staff = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const shopper = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
staff.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));
if (process.env.DEBUG_SMOKE) {
  staff.on('console', (message) => {
    if (message.type() === 'error') console.log(`    [console] ${message.text().slice(0, 600)}`);
  });
}

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
  // Loaded and settled before the first click: a click on server HTML does nothing.
  await staff.goto(`${BASE}/admin/design/store`, { waitUntil: 'load' });
  await staff.waitForTimeout(1200);
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
    // The status names the layout it will publish: wait for THIS one, not any
    // earlier "Draft saved" line still on screen.
    await staff.getByText(`Will publish ${name}.`).waitFor({ timeout: 30000 });
  };
  const publish = async () => {
    await staff.getByRole('button', { name: 'Publish', exact: true }).click();
    await staff.getByRole('button', { name: 'Publish now' }).click();
    // The status line, not the toast: two publishes in a row leave the first
    // toast on screen, and waiting on it would pass before this one landed.
    await staff.getByText(/^Nothing unpublished\./).first().waitFor({ timeout: 30000 });
  };
  const liveIsSpotlight = async () => {
    await shopper.goto(storeUrl, { waitUntil: 'domcontentloaded' });
    await shopper.locator('h1').first().waitFor({ timeout: 60000 });
    const spotlight = (await shopper.locator('h1.uppercase').count()) > 0;
    if (process.env.DEBUG_SMOKE) {
      const h1 = await shopper.locator('h1').first().getAttribute('class');
      console.log(`    [shopper ${shopper.url()}] ${spotlight ? 'spotlight' : 'classic'} · ${h1?.slice(0, 40)}`);
    }
    return spotlight;
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
  check('Publishing makes it live for shoppers', await eventually(liveIsSpotlight, true));

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
  check('Classic is live again', await eventually(liveIsSpotlight, false));
  await staff.getByRole('button', { name: 'Put back' }).first().click();
  await staff.getByRole('button', { name: 'Put it back' }).click();
  await staff.getByText('That version is live again').waitFor({ timeout: 30000 });
  check('An older version can be put back', await eventually(liveIsSpotlight, true));

  await chooseLayout('Variant 1 · Classic');
  await publish();
  check('Left as found: Classic live', await eventually(liveIsSpotlight, false));

  /* ----------------------------------------------------------- coupons */
  const code = `SMK${Date.now().toString(36).toUpperCase().slice(-6)}`;
  // Lists stream in behind a skeleton: wait for the row, don't just glance.
  const appears = (locator) => locator.first().waitFor({ timeout: 30000 }).then(() => true, () => false);
  await staff.goto(`${BASE}/admin/coupons/new`, { waitUntil: 'load' });
  await staff.waitForTimeout(1200);
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

  await staff.goto(couponUrl, { waitUntil: 'load' });

  await staff.waitForTimeout(1200);
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

  await staff.goto(couponUrl, { waitUntil: 'load' });

  await staff.waitForTimeout(1200);
  await staff.getByRole('button', { name: 'Archive' }).click();
  await staff.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
  await staff.getByText(`${code} archived`).waitFor({ timeout: 30000 });
  await staff.goto(`${BASE}/admin/coupons?status=archived&q=${code}`, { waitUntil: 'domcontentloaded' });
  check('Archiving moves it to Archived', await appears(staff.getByRole('row').filter({ hasText: code })));

  /* -------------------------------------------------------- promotions */
  const promo = `Smoke sale ${code}`;
  await staff.goto(`${BASE}/admin/promotions/new`, { waitUntil: 'load' });
  await staff.waitForTimeout(1200);
  await staff.getByLabel('Title', { exact: true }).fill(promo);
  await staff.getByLabel('Description', { exact: true }).fill('Ten percent off everything, for the smoke test.');
  await staff.getByRole('spinbutton', { name: 'Percent off' }).fill('10');
  // The preview runs the checkout evaluator: 10% of ₹1,999 is ₹200.
  check('The preview prices an example item', await appears(staff.getByText('Saves ₹200')));
  check('Overlaps with other offers are shown', await appears(staff.getByText(/Overlaps \d+ other/)));
  await staff.getByRole('button', { name: 'Create promotion' }).click();
  await staff.waitForURL(/\/admin\/promotions\/prm_/, { timeout: 30000 });
  const promoUrl = staff.url();

  await staff.goto(`${BASE}/admin/promotions?q=${encodeURIComponent(code)}`, { waitUntil: 'domcontentloaded' });
  check('A new promotion is saved paused', await appears(staff.getByRole('row').filter({ hasText: promo }).getByText('Paused')));

  await staff.goto(`${BASE}/admin/promotions?view=calendar`, { waitUntil: 'domcontentloaded' });
  check('It appears on the calendar', await appears(staff.getByRole('link', { name: promo })));

  await staff.goto(promoUrl, { waitUntil: 'load' });

  await staff.waitForTimeout(1200);
  await staff.getByRole('button', { name: 'Archive' }).click();
  await staff.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
  await staff.getByText(`${promo} archived`).waitFor({ timeout: 30000 });
  check('A promotion can be archived', true);

  /* ------------------------------------------------ homepage publishing */
  const openBuilder = async () => {
    await staff.goto(`${BASE}/admin/cms`, { waitUntil: 'load' });
    await staff.waitForTimeout(1200);
    await staff.getByRole('region', { name: 'Publishing' }).waitFor({ timeout: 60000 });
  };
  await openBuilder();
  // Start clean: nothing unpublished.
  if (await staff.getByRole('button', { name: 'Discard', exact: true }).isVisible()) {
    await staff.getByRole('button', { name: 'Discard', exact: true }).click();
    await staff.getByRole('button', { name: 'Discard changes' }).click();
    await staff.getByText('Draft discarded').waitFor({ timeout: 30000 });
    await openBuilder();
  }
  check('The homepage builder starts with nothing unpublished', await appears(staff.getByText('Everything here is live')));

  const rail = staff.locator('li[data-section-row="PRODUCT_RAIL"]').filter({ hasText: 'Live' }).first();
  const railName = (await rail.getByRole('link').first().innerText()).trim();
  await rail.getByRole('button', { name: 'Hide from the page' }).click();
  await staff.getByRole('button', { name: 'Hide section' }).click();
  // Let the hide land before leaving the page.
  await staff.locator('li[data-section-row]').filter({ hasText: railName }).getByText('Hidden', { exact: true }).waitFor({ timeout: 30000 });
  await openBuilder();
  check('Hiding a section becomes an unpublished change', await appears(staff.getByText(`Hides section “${railName}”`)));

  const homeShows = async (url) => {
    // Not networkidle: live sections poll, so the network never goes quiet.
    await shopper.goto(url, { waitUntil: 'load' });
    await shopper.waitForTimeout(3000);
    return (await shopper.getByRole('heading', { name: railName, exact: true }).count()) > 0;
  };
  check('The live homepage still shows it', await homeShows(`${BASE}/`));
  // The draft preview needs a staff session.
  await staff.goto(`${BASE}/draft/home`, { waitUntil: 'load' });
  await staff.waitForTimeout(3000);
  check('The draft preview already hides it', (await staff.getByRole('heading', { name: railName, exact: true }).count()) === 0);

  await openBuilder();
  await staff.getByRole('button', { name: 'Publish', exact: true }).click();
  await staff.getByRole('button', { name: 'Publish now' }).click();
  await staff.getByText('Published — live now').waitFor({ timeout: 30000 });
  check('Publishing hides it from shoppers', await eventually(() => homeShows(`${BASE}/`), false));

  await openBuilder();
  await staff.getByRole('button', { name: 'History' }).click();
  await staff.getByRole('dialog').getByRole('button', { name: 'Put back' }).first().click();
  await staff.getByRole('button', { name: 'Put it back' }).click();
  await staff.getByText('That version is live again').waitFor({ timeout: 30000 });
  check('Putting the previous version back restores it', await eventually(() => homeShows(`${BASE}/`), true));

  /* ------------------------------------------------------ content pages */
  await staff.goto(`${BASE}/admin/pages?section=Company`, { waitUntil: 'load' });
  await staff.waitForTimeout(1200);
  await staff.getByRole('link', { name: /About/ }).first().click();
  await staff.waitForURL(/\/admin\/pages\/.+/, { timeout: 30000 });
  await staff.getByRole('region', { name: 'Publishing' }).waitFor({ timeout: 60000 });
  const aboutEditor = staff.url();
  const pageId = aboutEditor.split('/').pop();

  const publishPage = async () => {
    await staff.getByRole('button', { name: 'Publish', exact: true }).click();
    await staff.getByRole('button', { name: 'Publish now' }).click();
    await staff.getByText('Published — live now').waitFor({ timeout: 30000 });
  };
  const chooseTemplate = async (name) => {
    await staff.getByRole('button', { name: new RegExp(name) }).first().click();
    await staff.getByText('Draft saved. Shoppers still see the published page.').waitFor({ timeout: 30000 });
  };
  // "min read" appears only in the Editorial template.
  const aboutIsEditorial = async () => {
    await shopper.goto(`${BASE}/about`, { waitUntil: 'load' });
    await shopper.waitForTimeout(2000);
    return (await shopper.getByText(/min read/).count()) > 0;
  };

  // Start from a known state: About published as Plain, nothing pending.
  await staff.getByRole('button', { name: /Plain/ }).first().click();
  await staff.waitForTimeout(2500);
  if (await staff.getByRole('button', { name: 'Publish', exact: true }).isEnabled()) await publishPage();

  await chooseTemplate('Editorial');
  check('A template change is a draft', !(await aboutIsEditorial()));
  await staff.goto(`${BASE}/draft/content/${pageId}`, { waitUntil: 'load' });
  await staff.waitForTimeout(2000);
  check('The content preview shows the draft', (await staff.getByText(/min read/).count()) > 0);

  await staff.goto(aboutEditor, { waitUntil: 'load' });

  await staff.waitForTimeout(1200);
  await publishPage();
  check('Publishing a content page makes it live', await eventually(aboutIsEditorial, true));

  await chooseTemplate('Plain');
  await publishPage();
  await staff.getByRole('button', { name: 'Put back' }).first().click();
  await staff.getByRole('button', { name: 'Put it back' }).click();
  await staff.getByText('That version is live again').waitFor({ timeout: 30000 });
  check('A content page version can be put back', await eventually(aboutIsEditorial, true));

  await staff.goto(aboutEditor, { waitUntil: 'load' });

  await staff.waitForTimeout(1200);
  await chooseTemplate('Plain');
  await publishPage();
  check('Left as found: About is Plain', await eventually(aboutIsEditorial, false));

  /* -------------------------------------------------------- page layout */
  const headerCount = async (path) => {
    await shopper.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await shopper.waitForTimeout(2500);
    return shopper.locator('header.sticky').count();
  };
  await staff.goto(`${BASE}/admin/page-chrome`, { waitUntil: 'load' });
  await staff.waitForTimeout(1200);
  await staff.getByRole('button', { name: 'Add a page' }).click();
  const pathInput = staff.getByLabel('Page path').last();
  await pathInput.fill('/about');
  await staff.getByRole('combobox', { name: 'Header on /about' }).selectOption('none');
  await staff.getByRole('button', { name: 'Save', exact: true }).click();
  await staff.getByText('Saved — live on the shop').waitFor({ timeout: 30000 });
  check('A single-page rule removes the header there', (await headerCount('/about')) === 0);
  check('…and nowhere else', (await headerCount('/help/shipping')) > 0);

  await staff.goto(`${BASE}/admin/page-chrome`, { waitUntil: 'load' });

  await staff.waitForTimeout(1200);
  await staff.getByRole('button', { name: 'History' }).first().click();
  await staff.getByRole('dialog').getByRole('button', { name: 'Put back' }).first().click();
  await staff.getByRole('button', { name: 'Put it back' }).click();
  await staff.getByText('Put back — live on the shop').waitFor({ timeout: 30000 });
  check('Page layout History puts the header back', (await headerCount('/about')) > 0);

  /* --------------------------------------------------- strip schedule */
  const stripLine = `Smoke line ${code}`;
  const stripShows = async () => {
    await shopper.goto(`${BASE}/help/shipping`, { waitUntil: 'load' });
    await shopper.waitForTimeout(2500);
    return (await shopper.getByText(stripLine).count()) > 0;
  };
  await staff.goto(`${BASE}/admin/appearance`, { waitUntil: 'load' });
  await staff.waitForTimeout(1200);
  const strip = staff.getByRole('region', { name: 'Announcement strip' });
  // Wait for the new row itself: a click before hydration adds nothing.
  const linesBefore = await strip.getByLabel('Text').count();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await strip.getByRole('button', { name: 'Add a line' }).click();
    if (await strip.getByLabel('Text').nth(linesBefore).waitFor({ timeout: 4000 }).then(() => true, () => false)) break;
  }
  await strip.getByLabel('Text').nth(linesBefore).fill(stripLine);
  await strip.getByRole('button', { name: 'Schedule' }).last().click();
  const tomorrow = new Date(Date.now() + 86_400_000);
  const tomorrowLocal = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await strip.getByLabel('Starts').last().fill(tomorrowLocal);
  await strip.getByRole('button', { name: 'Save', exact: true }).click();
  await staff.getByText('Saved — live on the shop').waitFor({ timeout: 30000 });
  check('A strip line scheduled for tomorrow is not showing', !(await stripShows()));

  await staff.goto(`${BASE}/admin/appearance`, { waitUntil: 'load' });

  await staff.waitForTimeout(1200);
  await strip.getByLabel('Starts').last().fill('');
  await strip.getByRole('button', { name: 'Save', exact: true }).click();
  await staff.getByText('Saved — live on the shop').waitFor({ timeout: 30000 });
  check('Clearing its start shows it', await stripShows());

  await staff.goto(`${BASE}/admin/appearance`, { waitUntil: 'load' });

  await staff.waitForTimeout(1200);
  await strip.getByRole('button', { name: 'History' }).click();
  // The newest entry is the value before the last save; the one before it is
  // the strip as it was before this test added a line.
  await staff.getByRole('dialog').getByRole('button', { name: 'Put back' }).nth(1).click();
  await staff.getByRole('button', { name: 'Put it back' }).click();
  await staff.getByText('Put back — live on the shop').waitFor({ timeout: 30000 });
  check('Appearance History puts the strip back', !(await stripShows()));
  /* ------------------------------------------------------ product page */
  await staff.goto(`${BASE}/admin/design/product`, { waitUntil: 'load' });
  await staff.waitForTimeout(1500);
  const productSlug = await staff.getByLabel('Preview with product').inputValue();

  // Start from an empty bag: runs add the same items, and a bag caps each
  // item at five, so a full bag would make a working button look broken.
  const emptyBag = async () => {
    await staff.goto(`${BASE}/bag`, { waitUntil: 'load' });
    await staff.waitForTimeout(1500);
    for (let guard = 0; guard < 20; guard += 1) {
      if (await staff.getByText('Your bag is empty').isVisible()) break;
      const remove = staff.getByRole('button', { name: 'Remove' }).filter({ visible: true }).first();
      if (!(await remove.count())) break;
      await remove.click({ timeout: 5000 }).catch(() => {});
      await staff.waitForTimeout(1500);
    }
  };
  await emptyBag();

  // Buying must work in every layout: the buy box is shared, but its buttons move.
  for (const [variant, label] of [['classic', 'Add to bag'], ['lookbook', 'Add to bag'], ['social', 'Buy now']]) {
    await staff.goto(`${BASE}/product/${productSlug}/preview/${variant}`, { waitUntil: 'load' });
    await staff.waitForTimeout(2000);
    // A size chip that is in stock -- not the Size guide link, which also lives here.
    await staff.locator('#size-options button:not([aria-disabled="true"])').filter({ hasNotText: 'Size guide' }).first().click();
    await staff.getByRole('button', { name: label }).filter({ visible: true }).first().click();
    check(`Add to bag works in the ${variant} layout`, await appears(staff.getByText('Added to your bag')));
  }

  const productIsLookbook = async () => {
    await shopper.goto(`${BASE}/product/${productSlug}`, { waitUntil: 'load' });
    await shopper.waitForTimeout(2000);
    return (await shopper.getByRole('heading', { name: 'Complete the look' }).count()) > 0;
  };
  await staff.goto(`${BASE}/admin/design/product`, { waitUntil: 'load' });
  await staff.waitForTimeout(1500);
  await chooseLayout('Variant 2 · Lookbook');
  check('A product layout change is a draft', !(await productIsLookbook()));
  await publish();
  check('Publishing the Lookbook reaches shoppers', await eventually(productIsLookbook, true));
  await chooseLayout('Variant 1 · Classic');
  await publish();
  check('Left as found: product page Classic', await eventually(productIsLookbook, false));

  /* ------------------------------------------------------ product demo */
  // The demo and the product page above default to the same top product.
  await emptyBag();
  await staff.goto(`${BASE}/admin/design/demo`, { waitUntil: 'load' });
  await staff.waitForTimeout(1500);
  const demoSlug = await staff.getByLabel('Preview with product').inputValue();
  const pickFirstOption = async () => {
    await staff.getByRole('dialog').locator('input[type="radio"]:not([disabled])').first().check();
    await staff.getByRole('dialog').getByRole('button', { name: 'Add to bag' }).click();
  };

  // Classic: the product panel's button opens the chooser.
  await staff.goto(`${BASE}/demo/${demoSlug}/preview/classic`, { waitUntil: 'load' });
  await staff.waitForTimeout(2000);
  await staff.getByRole('button', { name: 'Choose & add' }).filter({ visible: true }).first().click();
  await pickFirstOption();
  check('Add to bag works in the classic demo', await appears(staff.getByText('Added to your bag')));

  // Showroom: the lead piece is bought in place, no chooser.
  await staff.goto(`${BASE}/demo/${demoSlug}/preview/showroom`, { waitUntil: 'load' });
  await staff.waitForTimeout(2000);
  await staff.locator('aside button[aria-pressed]:not([disabled])').first().click();
  await staff.locator('aside').getByRole('button', { name: 'Add to bag' }).click();
  check('Add to bag works in the showroom demo', await appears(staff.getByText('Added to your bag')));

  // Stories: the sticker opens the chooser.
  await staff.goto(`${BASE}/demo/${demoSlug}/preview/stories`, { waitUntil: 'load' });
  await staff.waitForTimeout(2000);
  await staff.getByRole('button', { name: 'Shop this' }).click();
  await pickFirstOption();
  check('Add to bag works in the stories demo', await appears(staff.getByText('Added to your bag')));

  const demoIsStories = async () => {
    await shopper.goto(`${BASE}/demo/${demoSlug}`, { waitUntil: 'load' });
    await shopper.waitForTimeout(2000);
    return (await shopper.getByLabel(/^Part 1 of \d+$/).count()) > 0;
  };
  await staff.goto(`${BASE}/admin/design/demo`, { waitUntil: 'load' });
  await staff.waitForTimeout(1500);
  await chooseLayout('Variant 3 · Stories');
  check('A demo layout change is a draft', !(await demoIsStories()));
  await publish();
  check('Publishing Stories reaches shoppers', await eventually(demoIsStories, true));
  await chooseLayout('Variant 1 · Classic');
  await publish();
  check('Left as found: demo Classic', await eventually(demoIsStories, false));

  /* ---------------------------------------------------- category page */
  // The wall's quick view sells in place: colour, size, add -- no page change.
  await emptyBag();
  await staff.goto(`${BASE}/category/women/preview/wall`, { waitUntil: 'load' });
  await staff.waitForTimeout(1200);
  check('The wall preview lists products', (await staff.getByRole('button', { name: /^Quick view: / }).count()) > 0);
  await staff.getByRole('button', { name: /^Quick view: / }).first().click();
  const quick = staff.getByRole('dialog');
  check('Quick view opens', await appears(quick));
  await quick.locator('fieldset').last().locator('button:not([disabled])').first().click();
  await quick.getByRole('button', { name: 'Add to bag' }).click();
  check('Add to bag works from the quick view', await appears(staff.getByText('Added to your bag')));
  check('Quick view stays on the listing', new URL(staff.url()).pathname === '/category/women/preview/wall');

  // Editorial's shortcut tiles filter the same listing.
  await staff.goto(`${BASE}/category/women/preview/editorial`, { waitUntil: 'load' });
  await staff.waitForTimeout(1200);
  check('Editorial shows photo tiles by type', await appears(staff.getByRole('heading', { name: 'Shop by type' })));
  const tileHref = await staff.getByRole('link', { name: /Under ₹999/ }).first().getAttribute('href');
  check('A shortcut tile filters this category', tileHref === '/category/women/preview/editorial?maxPrice=999');

  const categoryIsEditorial = async () => {
    await shopper.goto(`${BASE}/category/women`, { waitUntil: 'load' });
    await shopper.waitForTimeout(1200);
    return (await shopper.getByRole('link', { name: /Shop the edit/ }).count()) > 0;
  };
  await staff.goto(`${BASE}/admin/design/category`, { waitUntil: 'load' });
  await staff.waitForTimeout(1500);
  check('Wall-only settings are hidden while Classic is edited', (await staff.getByText('Quick view', { exact: true }).count()) === 0);
  await chooseLayout('Variant 2 · Editorial');
  check('A category layout change is a draft', !(await categoryIsEditorial()));
  await publish();
  check('Publishing Editorial reaches shoppers', await eventually(categoryIsEditorial, true));
  await chooseLayout('Variant 1 · Classic');
  await publish();
  check('Left as found: category Classic', await eventually(categoryIsEditorial, false));

  /* ------------------------------------------------ sellers directory */
  await staff.goto(`${BASE}/stores/preview/stories`, { waitUntil: 'load' });
  await staff.waitForTimeout(1200);
  check('Stories shows the story row', await appears(staff.getByRole('navigation', { name: 'Stores to follow' })));
  check('Stories ranks stores', await appears(staff.getByRole('heading', { name: 'Most trusted' })));
  await staff.goto(`${BASE}/stores/preview/market`, { waitUntil: 'load' });
  await staff.waitForTimeout(1200);
  const jump = staff.getByRole('navigation', { name: 'Jump to a city' }).getByRole('link').first();
  const target = (await jump.getAttribute('href')) ?? '';
  check('Local market groups stores by city', target.startsWith('#city-') && (await staff.locator(target).count()) === 1);

  const directoryIsMarket = async () => {
    await shopper.goto(`${BASE}/stores`, { waitUntil: 'load' });
    await shopper.waitForTimeout(1200);
    return (await shopper.getByRole('navigation', { name: 'Jump to a city' }).count()) > 0;
  };
  await staff.goto(`${BASE}/admin/design/stores`, { waitUntil: 'load' });
  await staff.waitForTimeout(1500);
  check('The directory designer previews without choosing a record', await appears(staff.locator('iframe[src*="/stores/preview/"]')));
  await chooseLayout('Variant 2 · Local market');
  check('A directory layout change is a draft', !(await directoryIsMarket()));
  await publish();
  check('Publishing Local market reaches shoppers', await eventually(directoryIsMarket, true));
  await chooseLayout('Variant 1 · Classic');
  await publish();
  check('Left as found: directory Classic', await eventually(directoryIsMarket, false));

  /* --------------------------------------------------------- brand page */
  await staff.goto(`${BASE}/admin/design/brand`, { waitUntil: 'load' });
  await staff.waitForTimeout(1500);
  const brandSlug = await staff.getByLabel('Preview with brand').inputValue();
  await staff.goto(`${BASE}/brand/${brandSlug}/preview/campaign`, { waitUntil: 'load' });
  await staff.waitForTimeout(1200);
  check('Campaign leads with the brand', await appears(staff.getByRole('link', { name: /Shop the collection/ })));
  const brandCategory = staff.getByRole('navigation', { name: /by category$/ }).getByRole('link').first();
  check(
    'Shop by category opens the category filtered to the brand',
    ((await brandCategory.getAttribute('href')) ?? '').endsWith(`?brand=${brandSlug}`),
  );
  await staff.goto(`${BASE}/brand/${brandSlug}/preview/catalogue`, { waitUntil: 'load' });
  await staff.waitForTimeout(1200);
  check('Catalogue folds the story away', await appears(staff.locator('summary', { hasText: /^About / })));
  check('The brand itself is not counted as a filter', (await staff.getByText(/^Clear all \(/).count()) === 0);

  const brandIsCampaign = async () => {
    await shopper.goto(`${BASE}/brand/${brandSlug}`, { waitUntil: 'load' });
    await shopper.waitForTimeout(1200);
    return (await shopper.getByRole('link', { name: /Shop the collection/ }).count()) > 0;
  };
  await staff.goto(`${BASE}/admin/design/brand`, { waitUntil: 'load' });
  await staff.waitForTimeout(1500);
  await chooseLayout('Variant 2 · Campaign');
  check('A brand layout change is a draft', !(await brandIsCampaign()));
  await publish();
  check('Publishing Campaign reaches shoppers', await eventually(brandIsCampaign, true));
  await chooseLayout('Variant 1 · Classic');
  await publish();
  check('Left as found: brand Classic', await eventually(brandIsCampaign, false));
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
