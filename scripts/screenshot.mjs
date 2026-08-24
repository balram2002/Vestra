/**
 * Screenshot key routes against a running server.
 *
 *     npm run start &
 *     node scripts/screenshot.mjs <output-dir>
 *
 * Exists because a storefront cannot be reviewed from a diff. Every visual
 * change in this project was checked against these before being committed.
 */
import { chromium } from '@playwright/test';

const SHOTS = process.argv[2];
const base = 'http://localhost:3000';

const pages = [
  ['home', '/', 1440, 2400],
  ['home-mobile', '/', 390, 2000],
  ['category', '/category/womens-ethnic-wear', 1440, 1800],
  ['pdp', null, 1440, 1800],
];

const browser = await chromium.launch();


for (const [name, path, w, h] of pages) {
  let url = path;
  if (name === 'pdp') {
    const p = await browser.newPage();
    await p.goto(base + '/category/womens-ethnic-wear', { waitUntil: 'load', timeout: 60000 });
    const href = await p.locator('a[href^="/product/"]').first().getAttribute('href');
    url = href;
    await p.close();
  }
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(base + url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: SHOTS + '/' + name + '.png', fullPage: false });
  console.log('shot ' + name + ' -> ' + url);
  await page.close();
}

await browser.close();
import { chromium } from '@playwright/test';

const SHOTS = process.argv[2];
const base = 'http://localhost:3000';

const pages = [
  ['home', '/', 1440, 2400],
  ['home-mobile', '/', 390, 2000],
  ['category', '/category/womens-ethnic-wear', 1440, 1800],
  ['pdp', null, 1440, 1800],
];

const browser = await chromium.launch();


for (const [name, path, w, h] of pages) {
  let url = path;
  if (name === 'pdp') {
    const p = await browser.newPage();
    await p.goto(base + '/category/womens-ethnic-wear', { waitUntil: 'load', timeout: 60000 });
    const href = await p.locator('a[href^="/product/"]').first().getAttribute('href');
    url = href;
    await p.close();
  }
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(base + url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: SHOTS + '/' + name + '.png', fullPage: false });
  console.log('shot ' + name + ' -> ' + url);
  await page.close();
}

await browser.close();
