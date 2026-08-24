/**
 * Screenshot routes against a running server.
 *
 *     npm run start &
 *     node scripts/screenshot.mjs <out-dir> [--as <email>] [--width N] <route...>
 *
 * Exists because a storefront cannot be reviewed from a diff. Every visual
 * change in this project was checked against these before being committed —
 * the first pass shipped flat vector clipart on a cramped type scale, and only
 * a screenshot caught it.
 *
 * Captures full-page by default so a screen cannot hide its own bottom half.
 */

import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const outDir = argv.shift();

let as = null;
let width = 1440;
const routes = [];

while (argv.length) {
  const arg = argv.shift();
  if (arg === '--as') as = argv.shift();
  else if (arg === '--width') width = Number.parseInt(argv.shift(), 10);
  else routes.push(arg);
}

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 1200 } });

const problems = [];
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text().slice(0, 160));
});
page.on('pageerror', (error) => problems.push(`pageerror: ${String(error).slice(0, 160)}`));

if (as) {
  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  await page.fill('input[name="email"]', as);
  await page.fill('input[name="password"]', 'vestra123');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
}

for (const route of routes) {
  const before = problems.length;
  try {
    await page.goto(BASE + route, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(2600);

    const name =
      (width === 1440 ? '' : `${width}_`) +
      (route.replace(/[/?=&]/g, '_').replace(/^_/, '') || 'home');
    await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });

    const fresh = problems.slice(before);
    console.log(`  ${route}${fresh.length ? `   [${fresh.length} console errors]` : ''}`);
    for (const problem of fresh) console.log(`      ${problem}`);
  } catch (error) {
    console.log(`  ${route}   FAILED: ${error instanceof Error ? error.message.slice(0, 80) : error}`);
  }
}

await browser.close();
