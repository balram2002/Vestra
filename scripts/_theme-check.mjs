import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const OUT = process.env.SHOT_DIR ?? '.';

const browser = await chromium.launch();

for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  });

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  const applied = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    canvas: getComputedStyle(document.documentElement).getPropertyValue('--surface-canvas').trim(),
    body: getComputedStyle(document.body).backgroundColor,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
  }));

  console.log(`system=${scheme}`, JSON.stringify(applied));
  await page.screenshot({ path: `${OUT}/theme-system-${scheme}.png` });
  await page.close();
}

/* Explicit choice must beat the system preference. */
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
});
await page.addInitScript(() => localStorage.setItem('vestra-theme', 'dark'));
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(2000);

const forced = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
console.log('system=light stored=dark ->', forced);
await page.screenshot({ path: `${OUT}/theme-forced-dark.png` });

await browser.close();
