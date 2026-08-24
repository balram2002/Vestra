import { chromium } from '@playwright/test';

const SHOTS = process.argv[2];
const EMAIL = process.argv[3] ?? 'mora01@seller.vestra.test';
const ROUTES = process.argv.slice(4);
const BASE = 'http://localhost:3000';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

await page.goto(BASE + '/login', { waitUntil: 'load' });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', 'vestra123');
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);

for (const route of ROUTES) {
  await page.goto(BASE + route, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(2500);
  const name = route.replace(/\//g, '_').replace(/^_/, '') || 'root';
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  console.log('shot ' + route);
}

await browser.close();
