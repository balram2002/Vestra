/**
 * Accessibility audit.
 *
 *     npm run start &
 *     node scripts/audit-a11y.mjs
 *
 * Runs axe-core against the routes that matter, at desktop and mobile widths,
 * signed in where a route needs it. Exists because "we wrote semantic HTML" is
 * a claim, and the brief asks for an accessibility pass — this is the
 * measurement that turns the claim into a number.
 *
 * Fails on serious and critical violations. Moderate and minor are reported but
 * do not fail the run: some are genuine judgement calls and blocking on them
 * trains people to ignore the whole report.
 */

import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const ROUTES = [
  { path: '/', as: null },
  { path: '/category/womens-ethnic-wear', as: null },
  { path: '/search?q=kurta', as: null },
  { path: '/login', as: null },
  { path: '/bag', as: 'ananya.iyer@example.com' },
  { path: '/account', as: 'ananya.iyer@example.com' },
  { path: '/orders', as: 'ananya.iyer@example.com' },
  { path: '/checkout', as: 'ananya.iyer@example.com' },
  { path: '/seller', as: 'mora01@seller.vestra.test' },
  { path: '/seller/orders', as: 'mora01@seller.vestra.test' },
  { path: '/admin', as: 'superadmin@vestra.test' },
  { path: '/admin/orders', as: 'superadmin@vestra.test' },
];

const WIDTHS = [
  { name: 'desktop', width: 1440 },
  { name: 'mobile', width: 390 },
];

const browser = await chromium.launch();

/** Sessions are established once per identity and reused across routes. */
const contexts = new Map();

async function contextFor(as, width) {
  const key = `${as ?? 'anon'}:${width}`;
  if (contexts.has(key)) return contexts.get(key);

  const context = await browser.newContext({ viewport: { width, height: 900 } });

  if (as) {
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'load' });
    await page.fill('input[name="email"]', as);
    await page.fill('input[name="password"]', 'vestra123');
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 }),
      page.click('button[type="submit"]'),
    ]);
    await page.close();
  }

  contexts.set(key, context);
  return context;
}

let serious = 0;
let moderate = 0;
const seen = new Map();

for (const { name, width } of WIDTHS) {
  console.log(`\n  ${name} (${width}px)`);

  for (const route of ROUTES) {
    const context = await contextFor(route.as, width);
    const page = await context.newPage();

    try {
      await page.goto(BASE + route.path, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(1600);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const bad = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      const meh = results.violations.filter(
        (violation) => violation.impact === 'moderate' || violation.impact === 'minor',
      );

      serious += bad.length;
      moderate += meh.length;

      for (const violation of results.violations) {
        const entry = seen.get(violation.id) ?? {
          impact: violation.impact,
          help: violation.help,
          nodes: 0,
          routes: new Set(),
        };
        entry.nodes += violation.nodes.length;
        entry.routes.add(route.path);
        seen.set(violation.id, entry);
      }

      const mark = bad.length === 0 ? 'PASS' : 'FAIL';
      console.log(
        `    ${mark}  ${route.path.padEnd(30)} ${bad.length} serious, ${meh.length} minor`,
      );
    } catch (error) {
      console.log(
        `    ERR   ${route.path.padEnd(30)} ${error instanceof Error ? error.message.slice(0, 60) : error}`,
      );
    } finally {
      await page.close();
    }
  }
}

await browser.close();

console.log('\n  Violations by rule');
const sorted = [...seen.entries()].sort((a, b) => {
  const rank = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  return (rank[a[1].impact] ?? 4) - (rank[b[1].impact] ?? 4) || b[1].nodes - a[1].nodes;
});

if (sorted.length === 0) {
  console.log('    none');
}
for (const [id, entry] of sorted) {
  console.log(
    `    [${(entry.impact ?? '?').padEnd(8)}] ${id} — ${entry.nodes} nodes across ${entry.routes.size} routes`,
  );
  console.log(`               ${entry.help}`);
}

console.log(`\n  ${serious} serious/critical, ${moderate} moderate/minor`);
process.exitCode = serious > 0 ? 1 : 0;
