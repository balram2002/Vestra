/**
 * Role-based access smoke test.
 *
 *     npm run start &
 *     node scripts/smoke-rbac.mjs
 *
 * Checks that each role reaches what it should and is turned away from what it
 * should not. This is the check the brief's "auth, RBAC and role-based
 * redirects work correctly" line actually requires — a passing build proves
 * nothing about who can open which screen.
 *
 * "Blocked" means either a redirect away from the route or a rendered
 * unauthorized/forbidden boundary. Both are correct outcomes; silently serving
 * the page is not.
 */

import { chromium } from '@playwright/test';
import { readdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'vestra123';

/** Each case: who signs in, where they go, and whether they should get in. */
const CASES = [
  { who: 'anonymous', email: null, path: '/admin', allow: false },
  { who: 'anonymous', email: null, path: '/seller', allow: false },
  // Guests may look up an individual order, but the account order list is private.
  { who: 'anonymous', email: null, path: '/orders', allow: false },
  { who: 'anonymous', email: null, path: '/', allow: true },
  { who: 'anonymous', email: null, path: '/category/womens-ethnic-wear', allow: true },

  { who: 'customer', email: 'ananya.iyer@example.com', path: '/orders', allow: true },
  { who: 'customer', email: 'ananya.iyer@example.com', path: '/admin', allow: false },
  { who: 'customer', email: 'ananya.iyer@example.com', path: '/seller', allow: false },

  { who: 'seller', email: 'mora01@seller.vestra.test', path: '/seller', allow: true },
  { who: 'seller', email: 'mora01@seller.vestra.test', path: '/seller/earnings', allow: true },
  { who: 'seller', email: 'mora01@seller.vestra.test', path: '/admin', allow: false },

  { who: 'support', email: 'support@vestra.test', path: '/admin', allow: true },
  { who: 'support', email: 'support@vestra.test', path: '/admin/orders', allow: true },
  // Support has no finance permission, so the payment ledger must refuse.
  { who: 'support', email: 'support@vestra.test', path: '/admin/payments', allow: false },
  // Nor settings, which is SUPER_ADMIN only.
  { who: 'support', email: 'support@vestra.test', path: '/admin/settings', allow: false },

  { who: 'finance', email: 'finance@vestra.test', path: '/admin/payments', allow: true },
  { who: 'finance', email: 'finance@vestra.test', path: '/admin/settings', allow: false },

  { who: 'admin', email: 'admin@vestra.test', path: '/admin', allow: true },

  { who: 'superadmin', email: 'superadmin@vestra.test', path: '/admin/settings', allow: true },
  { who: 'superadmin', email: 'superadmin@vestra.test', path: '/admin/audit-logs', allow: true },
];

let failed = 0;
let passed = 0;

const browser = await chromium.launch();

/** Group by signed-in identity so each session is established once. */
const byWho = new Map();
for (const item of CASES) {
  byWho.set(item.who, [...(byWho.get(item.who) ?? []), item]);
}

for (const [who, cases] of byWho) {
  const context = await browser.newContext();
  const page = await context.newPage();

  if (cases[0].email) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="email"]', cases[0].email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname === '/login/verify' || !url.pathname.startsWith('/login'), { timeout: 30000 });
    if (new URL(page.url()).pathname === '/login/verify') {
      const files = (await readdir('.data/outbox')).filter((name) => name.includes('sign-in-code')).sort();
      const code = files.at(-1)?.match(/-(\d{6})-/)?.[1];
      if (!code) throw new Error('Administrator sign-in code missing from the local test outbox');
      await page.getByLabel('Sign-in code').fill(code);
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 });
    }
  }

  for (const item of cases) {
    let reached = false;
    let detail = '';

    try {
      const response = await page.goto(BASE + item.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(700);

      const landed = new URL(page.url()).pathname;
      const status = response?.status() ?? 0;
      const body = (await page.locator('body').innerText()).slice(0, 400);

      // Turned away = redirected elsewhere, or a refusal boundary rendered.
      const redirected = landed !== item.path;
      const refused =
        status === 401 ||
        status === 403 ||
        /sign in to continue|do not have access|not authorised|not authorized/i.test(body);

      reached = !redirected && !refused;
      detail = redirected ? `redirected to ${landed}` : refused ? 'refused' : `${status}`;
    } catch (error) {
      detail = error instanceof Error ? error.message.slice(0, 60) : 'error';
    }

    const ok = reached === item.allow;
    if (ok) passed += 1;
    else failed += 1;

    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${who.padEnd(11)} ${item.path.padEnd(24)} ` +
        `${item.allow ? 'may enter' : 'must be blocked'} — ${detail}`,
    );
  }

  await context.close();
}

await browser.close();

console.log('');
console.log(`  ${passed}/${passed + failed} access checks passed`);
process.exitCode = failed > 0 ? 1 : 0;
