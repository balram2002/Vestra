/** Authentication boundary checks not covered by email and two-step suites. */
import { chromium, expect as baseExpect } from '@playwright/test';
import { MongoClient } from 'mongodb';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const DB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB ?? 'vestra_enhancement_test_20260915';
const expect = baseExpect.configure({ timeout: 30000 });
const client = await new MongoClient(DB_URI).connect();
const db = client.db(DB_NAME);
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(30000);

async function login(email, password, next = '') {
  await page.goto(`${BASE}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

try {
  await page.goto(`${BASE}/account/profile`, { waitUntil: 'domcontentloaded' });
  expect(new URL(page.url()).pathname).toBe('/login');
  expect(new URL(page.url()).searchParams.get('next')).toBe('/account/profile');

  await login('ananya.iyer@example.com', 'wrong-password');
  await expect(page.getByText('That email and password do not match.')).toBeVisible();
  const knownMessage = await page.locator('p[role="alert"]').innerText();
  await login('not-an-account@example.com', 'wrong-password');
  await expect(page.getByText('That email and password do not match.')).toBeVisible();
  expect(await page.locator('p[role="alert"]').innerText()).toBe(knownMessage);

  const seeded = await db.collection('users').findOne({ email: 'ananya.iyer@example.com' });
  await db.collection('users').updateOne({ _id: seeded._id }, { $set: { status: 'SUSPENDED' } });
  await login('ananya.iyer@example.com', 'vestra123');
  await expect(page.getByText(/account has been suspended/i)).toBeVisible();
  await db.collection('users').updateOne({ _id: seeded._id }, { $set: { status: 'ACTIVE' } });

  await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
  await page.locator('[name="fullName"]').fill('A');
  await page.locator('[name="email"]').fill('not-an-email');
  await page.locator('[name="password"]').fill('password123');
  await page.locator('[name="phone"]').fill('123');
  await page.getByRole('button', { name: 'Create account' }).click();
  expect(await page.locator('[name="email"]').evaluate((input) => input.validationMessage.length > 0)).toBe(true);
  await page.locator('[name="email"]').fill('invalid-fields@example.test');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter your name')).toBeVisible();
  await expect(page.getByText('Choose a less common password')).toBeVisible();
  await expect(page.getByText('Enter a 10-digit Indian mobile number')).toBeVisible();
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.locator('[name="password"]')).toHaveAttribute('type', 'text');

  await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
  await page.locator('[name="fullName"]').fill('Existing Shopper');
  await page.locator('[name="email"]').fill('ananya.iyer@example.com');
  await page.locator('[name="password"]').fill('Copper-Kettle-River-27');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('An account with this email already exists.')).toBeVisible();

  await login('ananya.iyer@example.com', 'vestra123', 'https://attacker.example/steal');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  expect(new URL(page.url()).origin).toBe(new URL(BASE).origin);

  await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).pathname === '/register') {
    await page.waitForURL((url) => url.pathname !== '/register');
  }
  await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
  await Promise.all([
    page.waitForURL(`${BASE}/`),
    page.getByRole('button', { name: /sign out/i }).click(),
  ]);
  expect((await context.cookies()).some((cookie) => cookie.name === 'vestra_session')).toBe(false);
  await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
  expect(new URL(page.url()).pathname).toBe('/login');

  await context.addCookies([{ name: 'vestra_session_hint', value: '1', url: BASE, httpOnly: true }]);
  await page.goto(`${BASE}/account/profile`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('dialog', { name: 'Your session has expired' })).toBeVisible();
  await context.clearCookies();

  await page.goto(`${BASE}/api/auth/google`, { waitUntil: 'domcontentloaded' });
  expect(new URL(page.url()).pathname).toBe('/login');
  expect(new URL(page.url()).searchParams.get('error')).toBe('google-unavailable');
  await page.goto(`${BASE}/api/auth/google/callback?state=fake&code=fake`, { waitUntil: 'domcontentloaded' });
  expect(new URL(page.url()).searchParams.get('error')).toBe('google-failed');

  console.log('PASS protected redirects, indistinguishable failures, suspended account, validation, duplicate signup, redirect safety, signed-in redirect, sign-out and Google failure paths');
} finally {
  await db.collection('users').updateOne({ email: 'ananya.iyer@example.com' }, { $set: { status: 'ACTIVE', 'twoFactor.enabled': false } });
  await browser.close();
  await client.close();
}
