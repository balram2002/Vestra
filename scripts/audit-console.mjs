/**
 * Console layout audit.
 *
 *     npm run start &
 *     node scripts/audit-console.mjs
 *
 * Signs in as a seller and as an admin, visits every console route at four
 * widths, and reports the things that make a console look broken without
 * throwing an error anywhere:
 *
 *   - HORIZONTAL OVERFLOW of the document — a page wider than the viewport
 *     scrolls sideways, which on a phone is the difference between usable and
 *     not;
 *   - OVERFLOWING ELEMENTS — the worst offenders by how far they stick out,
 *     because a document-level check only says THAT something overflows, not
 *     WHAT;
 *   - a HEADER whose content is wider than the header;
 *   - uncaught page errors and failed responses.
 *
 * Exists because "the header is overflowing" is a claim about pixels, and a
 * claim about pixels is settled by measuring them — at every width, on every
 * page, for both roles — rather than by fixing the one screen somebody happened
 * to look at.
 *
 * Exits 1 if anything overflows, so it can gate a build.
 */

import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'vestra123';

const WIDTHS = [1440, 1024, 768, 390];

const ROLES = [
  {
    email: 'mora01@seller.vestra.test',
    routes: [
      '/seller',
      '/seller/orders',
      '/seller/shipments',
      '/seller/returns',
      '/seller/products',
      '/seller/products/new',
      '/seller/inventory',
      '/seller/earnings',
      '/seller/settlements',
      '/seller/analytics',
      '/seller/settings',
    ],
  },
  {
    email: 'superadmin@vestra.test',
    routes: [
      '/admin',
      '/admin/orders',
      '/admin/products',
      '/admin/reviews',
      '/admin/sellers',
      '/admin/users',
      '/admin/categories',
      '/admin/brands',
      '/admin/coupons',
      '/admin/promotions',
      '/admin/returns',
      '/admin/payments',
      '/admin/settlements',
      '/admin/support',
      '/admin/cms',
      '/admin/pages',
      '/admin/analytics',
      '/admin/audit-logs',
      '/admin/settings',
    ],
  },
];

const browser = await chromium.launch();
let failures = 0;
const summary = [];

for (const role of ROLES) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', role.email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);

  console.log(`\n  ${role.email}`);

  for (const route of role.routes) {
    const errors = [];
    const onError = (error) => errors.push(error.message);
    page.on('pageerror', onError);

    const findings = [];
    let status = 0;

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      status = response?.status() ?? 0;
      await page.waitForTimeout(700);

      const result = await page.evaluate((viewport) => {
        const doc = document.documentElement;
        const docOverflow = doc.scrollWidth - doc.clientWidth;

        // The worst offenders, by how far their right edge passes the viewport.
        const offenders = [];
        for (const el of document.querySelectorAll('body *')) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const over = Math.round(rect.right - viewport);
          if (over > 1) {
            // Skip anything clipped by an overflow-hidden/auto ancestor: it is
            // not actually visible past the edge.
            let clipped = false;
            let node = el.parentElement;
            while (node && node !== document.body) {
              const style = getComputedStyle(node);
              if (/(hidden|auto|scroll|clip)/.test(style.overflowX)) {
                const box = node.getBoundingClientRect();
                if (box.right <= viewport + 1) {
                  clipped = true;
                  break;
                }
              }
              node = node.parentElement;
            }
            if (!clipped) {
              offenders.push({
                over,
                tag: el.tagName.toLowerCase(),
                cls: (el.className?.toString() ?? '').slice(0, 70),
                text: (el.textContent ?? '').trim().slice(0, 30),
              });
            }
          }
        }
        offenders.sort((a, b) => b.over - a.over);

        const header = document.querySelector('main')?.previousElementSibling
          ?? document.querySelector('header');
        const headerOverflow = header ? header.scrollWidth - header.clientWidth : 0;

        /*
         * VERTICAL spill out of the header.
         *
         * The first version of this audit only measured horizontal overflow and
         * reported every route clean while the seller header's content sat 6px
         * below the header itself — a stacked live switch and store name in a
         * 62px bar. A fixed-height bar fails DOWNWARD, not sideways, so this
         * measures the lowest descendant against the header's own bottom edge.
         */
        let headerSpill = 0;
        if (header) {
          const bottom = header.getBoundingClientRect().bottom;
          for (const el of header.querySelectorAll('*')) {
            const box = el.getBoundingClientRect();
            if (box.height === 0) continue;
            headerSpill = Math.max(headerSpill, Math.round(box.bottom - bottom));
          }
        }

        return { docOverflow, headerOverflow, headerSpill, offenders: offenders.slice(0, 3) };
      }, width);

      if (result.docOverflow > 1 || result.headerOverflow > 1 || result.headerSpill > 1) {
        findings.push({ width, ...result });
      }
    }

    page.off('pageerror', onError);

    const bad = findings.length > 0 || errors.length > 0 || status >= 400;
    if (bad) failures += 1;

    const label = `${route}`.padEnd(28);
    if (!bad) {
      console.log(`    PASS  ${label} ${status}`);
    } else {
      console.log(`    FAIL  ${label} ${status}${errors.length ? `  ${errors.length} page error(s)` : ''}`);
      for (const finding of findings) {
        console.log(
          `            ${finding.width}px  doc +${finding.docOverflow}px  header +${finding.headerOverflow}px  spill +${finding.headerSpill}px`,
        );
        for (const offender of finding.offenders) {
          console.log(
            `              +${offender.over}px <${offender.tag}> "${offender.text}"  ${offender.cls}`,
          );
        }
      }
      for (const error of errors.slice(0, 2)) console.log(`            error: ${error.slice(0, 140)}`);
    }

    summary.push({ route, bad });
  }

  await context.close();
}

await browser.close();

console.log(`\n  ${failures} of ${summary.length} routes have problems.\n`);
process.exitCode = failures > 0 ? 1 : 0;
