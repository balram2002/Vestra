import { chromium, expect as baseExpect } from '@playwright/test';
import { readdir } from 'node:fs/promises';
import { MongoClient } from 'mongodb';
const expect = baseExpect.configure({ timeout: 30000 });

// Run only against the isolated test server, whose SMTP transport is disabled.
const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const DB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB ?? 'vestra_enhancement_test_20260915';
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(25000);
const signin = async () => {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('[name="email"]').fill('ananya.iyer@example.com');
  await page.locator('[name="password"]').fill('vestra123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
};
const latestCode = async (suffix) => {
  const files = (await readdir('.data/outbox')).filter((name) => name.includes(suffix)).sort();
  const code = files.at(-1)?.match(/-(\d{6})-/)?.[1];
  if (!code) throw new Error('No local test code found');
  return code;
};
try {
  const dbClient = await new MongoClient(DB_URI).connect();
  const db = dbClient.db(DB_NAME);
  const user = await db.collection('users').findOne({ email: 'ananya.iyer@example.com' });
  await db.collection('users').updateOne({ _id: user._id }, { $set: { 'twoFactor.enabled': false } });
  await db.collection('authChallenges').deleteMany({ userId: user._id });
  // This script only targets the isolated test database. Clear earlier smoke
  // runs so the test validates the flow rather than a previous run's budget.
  await db.collection('rateLimits').deleteMany({ _id: { $regex: '^2fa:' } });
  await dbClient.close();
  await signin();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90000 });
  await page.goto(BASE + '/account/profile', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const fullName = page.locator('input[name="fullName"]');
  const originalName = await fullName.inputValue();
  await fullName.fill('Ananya Enhancement Test');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.getByText('Details saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(fullName).toHaveValue('Ananya Enhancement Test');
  await fullName.fill(originalName);
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  const settings = page.locator('[data-two-factor]');
  if (await settings.getAttribute('data-two-factor') === 'on') throw new Error('Expected fresh test user with two-factor disabled');
  await settings.getByRole('button', { name: 'Turn on', exact: true }).click();
  await expect(settings.getByLabel('Code from the email')).toBeVisible();
  await settings.getByLabel('Code from the email').fill(await latestCode('turns-on-two-step'));
  await expect(settings).toHaveAttribute('data-two-factor', 'on');
  await context.clearCookies();
  await signin();
  await page.waitForURL('**/login/verify', { timeout: 90000 });
  expect((await context.cookies()).some((cookie) => cookie.name === 'vestra_session')).toBe(false);
  const code = await latestCode('sign-in-code');
  await page.getByLabel('Sign-in code').fill(code === '000000' ? '111111' : '000000');
  await expect(page.getByText(/That code is not right/)).toBeVisible();
  expect((await context.cookies()).some((cookie) => cookie.name === 'vestra_session')).toBe(false);
  await page.getByLabel('Sign-in code').fill(code);
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90000 });
  expect((await context.cookies()).some((cookie) => cookie.name === 'vestra_session')).toBe(true);
  await page.goto(BASE + '/account/profile', { waitUntil: 'domcontentloaded' });
  await settings.getByRole('button', { name: 'Turn off', exact: true }).click();
  await expect(settings.getByLabel('Code from the email')).toBeVisible();
  await settings.getByLabel('Code from the email').fill(await latestCode('turns-off-two-step'));
  await expect(settings).toHaveAttribute('data-two-factor', 'off');
  console.log('PASS profile persistence, email two-factor enable, wrong-code denial, session gate, correct-code sign-in and disable');
} finally {
  const cleanup = await new MongoClient(DB_URI).connect();
  const users = cleanup.db(DB_NAME).collection('users');
  const user = await users.findOne({ email: 'ananya.iyer@example.com' });
  if (user) await users.updateOne({ _id: user._id }, { $set: { 'twoFactor.enabled': false, 'twoFactor.enabledAt': null } });
  await cleanup.close();
  await browser.close();
}
