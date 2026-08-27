import { chromium } from '@playwright/test';

/**
 * Look at every console and account surface in dark mode.
 *
 * Dark mode was unreachable until now, so nothing outside the storefront has
 * ever been SEEN in it. This signs in as each role and captures the screens
 * that were never designed against a dark canvas.
 */

const BASE = 'http://localhost:3000';
const OUT = process.env.SHOT_DIR ?? '.';

const TARGETS = [
  { as: 'ananya.iyer@example.com', path: '/bag', name: 'bag' },
  { as: 'ananya.iyer@example.com', path: '/account', name: 'account' },
  { as: 'mora01@seller.vestra.test', path: '/seller', name: 'seller' },
  { as: 'superadmin@vestra.test', path: '/admin', name: 'admin' },
];

const browser = await chromium.launch();

for (const target of TARGETS) {
  const context = await browser.newContext({
    viewport: { width: Number(process.env.W ?? 1280), height: 900 },
    colorScheme: 'dark',
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  await page.fill('input[name="email"]', target.as);
  await page.fill('input[name="password"]', 'vestra123');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(BASE + target.path, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/dark-${target.name}.png` });
  console.log('captured', target.name, page.url());

  await context.close();
}

await browser.close();
