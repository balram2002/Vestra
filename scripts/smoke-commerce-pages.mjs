import { chromium, expect as baseExpect } from '@playwright/test';
import { MongoClient } from 'mongodb';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const expect = baseExpect.configure({ timeout: 20000 });
const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const DB = process.env.MONGODB_DB;
if (!DB?.includes('test') || !['localhost', '127.0.0.1'].includes(new URL(BASE).hostname)) throw new Error('Select a local test server and database explicitly.');
const mongo = await new MongoClient(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017').connect();
const db = mongo.db(DB);
const browser = await chromium.launch();
const shots = '.shots/commerce';
await mkdir(shots, { recursive: true });
const seller = await db.collection('sellers').findOne({ status: 'ACTIVE' });
const products = await db.collection('products').find({ sellerId: seller.id, status: 'PUBLISHED' }).limit(3).toArray();
if (products.length < 2) throw new Error('Seed the isolated test database first.');
const product = products[0];
const mediaId = `smoke-clip-${Date.now()}`;
const path = `/demo/${product.slug}?clip=${mediaId}`;
const errors = [];
try {
  // MDN's CC0 clip is cached locally; it includes a seekable MP4 index.
  let clipBody;
  try { clipBody = await readFile('.data/commerce-fixture.mp4'); }
  catch { const response = await fetch('https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'); if (!response.ok) throw new Error('Video fixture unavailable'); clipBody = Buffer.from(await response.arrayBuffer()); await writeFile('.data/commerce-fixture.mp4', clipBody); }
  await db.collection('products').updateOne({ _id: product._id }, { $push: { media: { id: mediaId, kind: 'VIDEO', role: 'REEL', url: '/commerce-fixture.mp4', thumbnailUrl: product.media[0].url, alt: product.title, width: 360, height: 640, durationSeconds: 4.2, position: 10, variantId: null, featuredProductIds: [products[1].id] } } });
  const makeContext = async (width = 390) => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
    await context.route('**/commerce-fixture.mp4', (route) => {
      const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(Number(range[2]), clipBody.length - 1) : clipBody.length - 1;
      return route.fulfill({ status: range ? 206 : 200, body: clipBody.subarray(start, end + 1), contentType: 'video/mp4', headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${clipBody.length}` } : {}) } });
    });
    return context;
  };
  const context = await makeContext();
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Featured products', exact: true })).toBeVisible();
  await expect(page.getByText('2 pieces in this demo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play video', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate((element) => element.currentTime)).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Pause video', exact: true }).click();
  expect(await page.locator('video').evaluate((element) => element.paused)).toBe(true);
  await page.getByLabel('Unmute video').click();
  expect(await page.locator('video').evaluate((element) => element.muted)).toBe(false);
  console.log('video metadata', await page.locator('video').evaluate((v) => ({ duration: v.duration, time: v.currentTime, seekable: v.seekable.length ? v.seekable.end(0) : 0 })));
  await page.getByLabel('Video timeline').fill('1');
  await expect.poll(() => page.locator('video').evaluate((element) => element.currentTime)).toBeGreaterThanOrEqual(0.9);
  const slider = page.getByRole('slider', { name: 'Featured products panel height' });
  await slider.focus(); await page.keyboard.press('ArrowUp');
  await expect(slider).toHaveAttribute('aria-valuenow', '40');
  await page.getByRole('button', { name: 'See all', exact: true }).click();
  await expect(slider).toHaveAttribute('aria-valuenow', '72');
  await page.getByRole('button', { name: 'Choose & add', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to bag', exact: true })).toBeDisabled();
  await page.locator('input[type=radio]:not(:disabled)').first().check();
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(page.getByText('Added to your bag', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse', exact: true }).click();
  await page.screenshot({ path: `${shots}/demo-mobile.png` });
  await page.getByRole('link', { name: 'View bag', exact: true }).click();
  await expect(page.getByText(product.title, { exact: true }).first()).toBeVisible();
  console.log('PASS exact clip, featured products, playback, seek, mute, resizing, variant choice and guest bag');
  await page.goto(BASE + `/product/${product.slug}`);
  await page.getByLabel('More sharing options').click();
  await page.getByRole('menuitem', { name: 'Copy product demo link' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(BASE + `/demo/${product.slug}`);
  console.log('PASS product demo link copy');
  await context.close();
  for (const width of [320, 390, 768, 1440]) {
    const responsive = await makeContext(width);
    const screen = await responsive.newPage();
    screen.on('pageerror', (error) => errors.push(error.message));
    for (const route of [`/store/${seller.slug}`, `/product/${product.slug}`, path, '/category/womens-ethnic-wear', '/search?q=dress', '/categories', '/login', '/register', '/bag']) {
      await screen.goto(BASE + route, { waitUntil: 'domcontentloaded' });
      await screen.waitForTimeout(800);
      const overflow = await screen.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      if (overflow.scroll > overflow.width + 1) throw new Error(`Overflow ${width} ${route}: ${JSON.stringify(overflow)}`);
      if (/^\/(store|product|demo|category)\//.test(route)) await screen.screenshot({ path: `${shots}/${width}-${route.split('/')[1]}.png` });
    }
    console.log(`PASS ${width}px overflow sweep across 9 storefront/auth/demo routes`);
    await responsive.close();
  }
  const admin = await makeContext(1440);
  const adminPage = await admin.newPage();
  await adminPage.goto(BASE + '/login');
  await adminPage.locator('[name=email]').fill('superadmin@vestra.test');
  await adminPage.locator('[name=password]').fill('vestra123');
  await Promise.all([adminPage.waitForURL((url) => !url.pathname.startsWith('/login')), adminPage.getByRole('button', { name: 'Sign in', exact: true }).click()]);
  await adminPage.goto(`${BASE}/admin/sellers/${seller.id}`);
  await adminPage.getByLabel('Trust score', { exact: false }).fill('99/100');
  await adminPage.getByLabel('Average ship time', { exact: false }).fill('<1 day');
  await adminPage.getByLabel('Products sold', { exact: false }).fill('1.5L');
  await adminPage.getByRole('button', { name: 'Save scorecard' }).click();
  await expect(adminPage.getByText('Storefront scorecard saved', { exact: true })).toBeVisible();
  await adminPage.goto(`${BASE}/store/${seller.slug}`);
  await expect(adminPage.getByText('99/100', { exact: true })).toBeVisible();
  await expect(adminPage.getByText('<1 day', { exact: true })).toBeVisible();
  await expect(adminPage.getByText('1.5L', { exact: true })).toBeVisible();
  console.log('PASS admin scorecard persistence and public cache invalidation');
  await admin.close();
  const missing = await browser.newPage();
  await missing.goto(`${BASE}/demo/${product.slug}?clip=missing-clip`);
  await expect(missing.locator('body')).toContainText(/not found|couldn.t find|doesn.t exist|404/i);
  await missing.close();
  expect(errors).toEqual([]);
  await writeFile(`${shots}/results.json`, JSON.stringify({ passed: true, browserErrors: errors }, null, 2));
} finally {
  await db.collection('products').updateOne({ _id: product._id }, { $set: { media: product.media } });
  await db.collection('sellers').updateOne({ _id: seller._id }, seller.storefrontStats ? { $set: { storefrontStats: seller.storefrontStats } } : { $unset: { storefrontStats: '' } });
  await browser.close();
  await mongo.close();
}
