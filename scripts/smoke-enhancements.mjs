import { chromium, expect as baseExpect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const expect = baseExpect.configure({ timeout: 30000 });
const browser = await chromium.launch();
const errors = [];
const output = '.shots/enhancements';
const editedCategoryTitle = `Women — curated ${Date.now().toString(36).slice(-5)}`;
await mkdir(output, { recursive: true });
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await desktop.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.setDefaultTimeout(20000);
const visit = async (path) => { await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 90000 }); };
const login = async (email) => {
  await visit('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill('vestra123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90000 });
};
try {
  await visit('/');
  const hero = page.locator('[data-slide] a[aria-roledescription="slide"]');
  await expect(hero.first()).toBeVisible();
  const initial = await page.locator('[data-slide][aria-hidden="false"]').getAttribute('style');
  await page.waitForTimeout(4000);
  const after = await page.locator('[data-slide][aria-hidden="false"]').getAttribute('style');
  // The current slide element changes while the pointer remains over the hero.
  const currentLabel = await page.locator('[data-slide][aria-hidden="false"] a').getAttribute('aria-label');
  console.log('desktop hero:', initial, after, currentLabel);
  await expect.poll(() => page.locator('[data-slide][aria-hidden="false"] a').getAttribute('aria-label'), { timeout: 20000 }).not.toMatch(/^1 of/);
  const box = await hero.first().boundingBox();
  expect(box.height).toBeLessThan(650);
  await page.screenshot({ path: `${output}/desktop-home.png` });
  await page.getByRole('button', { name: /Search products|^Search$/ }).first().click();
  await page.getByLabel('Search products, brands, categories and stores').fill('women');
  await expect(page.locator('a[href^="/category/"]').filter({ hasText: /Women/i }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Close search' }).click();
  console.log('PASS desktop autoplay, hero height, category search');

  await visit('/reels');
  const feed = page.getByRole('region', { name: /Shopping reels/ });
  await expect(feed).toBeVisible();
  await expect(feed).toHaveAttribute('data-reel-ready', 'true');
  await feed.focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => feed.evaluate((el) => Math.round(el.scrollTop))).toBe(900);
  await page.getByRole('button', { name: 'Previous reel' }).click();
  await expect.poll(() => feed.evaluate((el) => Math.round(el.scrollTop))).toBe(0);
  await page.mouse.move(700, 400); await page.mouse.wheel(0, 350);
  await expect.poll(() => feed.evaluate((el) => Math.round(el.scrollTop))).toBe(900);
  await page.screenshot({ path: `${output}/desktop-reels.png` });
  console.log('PASS spring reels keyboard, arrows and wheel');

  await login('superadmin@vestra.test');
  await visit('/admin/categories-page');
  const adopt = page.getByRole('button', { name: 'Customise shop page' });
  if (await adopt.count()) await adopt.click();
  await expect(page.getByRole('heading', { name: 'Sections', exact: true })).toBeVisible();
  const firstEdit = page.locator('a[href^="/admin/cms/sections/"]').first();
  await firstEdit.click();
  await page.getByLabel('Heading', { exact: true }).fill(editedCategoryTitle);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Save and publish', exact: true }).click();
  await expect(page.getByText('Saved, and live on the shop', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${output}/desktop-section-editor.png` });
  await visit('/categories');
  await expect(page.getByRole('heading', { name: editedCategoryTitle })).toBeVisible();
  await page.screenshot({ path: `${output}/desktop-categories.png` });
  await visit('/admin/cms');
  await expect(page.getByText(editedCategoryTitle, { exact: true })).toHaveCount(0);
  console.log('PASS category editor publish, storefront invalidation and page isolation');

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', (error) => errors.push(error.message));
  await mobile.goto(BASE + '/register', { waitUntil: 'domcontentloaded' });
  await mobile.waitForTimeout(2000);
  await mobile.locator('input[name="password"]').fill('copper kettle river autumn');
  await expect(mobile.getByRole('meter')).toHaveAttribute('aria-valuenow', '4');
  await mobile.getByRole('button', { name: 'Show password' }).click();
  await expect(mobile.locator('input[name="password"]')).toHaveAttribute('type', 'text');
  await mobile.screenshot({ path: `${output}/mobile-register.png` });
  await mobile.goto(BASE + '/categories', { waitUntil: 'domcontentloaded' });
  await mobile.waitForTimeout(3000);
  const imageInfo = await mobile.locator('main img').evaluateAll((images) => images.slice(0, 6).map((img) => ({ complete: img.complete, width: img.naturalWidth, position: getComputedStyle(img.parentElement).position })));
  console.log('category image loading:', imageInfo);
  await mobile.screenshot({ path: `${output}/mobile-categories.png` });
  const cdp = await mobileContext.newCDPSession(mobile);
  async function swipe(x1, y1, x2, y2) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
    for (let step = 1; step <= 6; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * step / 6, y: y1 + (y2 - y1) * step / 6 }] });
      await mobile.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await swipe(5, 270, 190, 270);
  await expect(mobile.getByRole('button', { name: 'Close menu' })).toBeVisible();
  await swipe(250, 270, 40, 270);
  await expect(mobile.getByRole('button', { name: 'Close menu' })).toHaveCount(0);
  await mobile.goto(BASE + '/reels', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await expect(mobile.getByRole('region', { name: /Shopping reels/ })).toBeVisible();
  await expect(mobile.getByRole('region', { name: /Shopping reels/ })).toHaveAttribute('data-reel-ready', 'true');
  await swipe(190, 650, 190, 210);
  await expect.poll(() => mobile.getByRole('region', { name: /Shopping reels/ }).evaluate((el) => Math.round(el.scrollTop))).toBe(844);
  console.log('PASS mobile strength meter, visibility toggle, drawer gestures and reel swipe');
  await mobileContext.close();
  expect(errors).toEqual([]);
} finally {
  await browser.close();
}
