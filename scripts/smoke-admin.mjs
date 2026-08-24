/**
 * Admin write-action smoke test.
 *
 *     npm run start &
 *     node scripts/smoke-admin.mjs
 *
 * Drives the console's mutations in a real browser and then checks the SIDE
 * EFFECTS, not just that a toast appeared: the listing actually changed status,
 * an audit entry was written, and the seller was notified. A button that fires
 * an action which quietly fails looks identical to one that works.
 */

import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MONGO = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const DB = process.env.MONGODB_DB ?? 'vestra';

const results = [];
function record(name, ok, detail = '') {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const mongo = new MongoClient(MONGO);
await mongo.connect();
const db = mongo.db(DB);

const auditBefore = await db.collection('auditLogs').countDocuments();
const pending = await db
  .collection('products')
  .findOne({ status: { $in: ['SUBMITTED', 'PENDING_REVIEW'] } });

if (!pending) {
  console.log('  SKIP  nothing in the review queue to approve');
  await mongo.close();
  process.exit(0);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  await page.fill('input[name="email"]', 'superadmin@vestra.test');
  await page.fill('input[name="password"]', 'vestra123');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(`${BASE}/admin/products?status=PENDING_REVIEW`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);

  const approve = page.getByRole('button', { name: 'Approve' }).first();
  const found = (await approve.count()) > 0;
  record('review queue offers an approve action', found);

  if (found) {
    await approve.click();
    await page.waitForTimeout(3000);

    // 1. The listing actually changed.
    const after = await db.collection('products').findOne({ status: 'PUBLISHED' }, { sort: { updatedAt: -1 } });
    const approved =
      after && Date.now() - Date.parse(after.updatedAt) < 60_000 && after.approvedByUserId;
    record('listing was published', Boolean(approved), after?.title?.slice(0, 40) ?? '');

    // 2. It was audited.
    const auditAfter = await db.collection('auditLogs').countDocuments();
    record('audit entry written', auditAfter > auditBefore, `${auditBefore} → ${auditAfter}`);

    const entry = await db.collection('auditLogs').findOne({}, { sort: { occurredAt: -1 } });
    record(
      'audit entry records the diff',
      Boolean(entry && entry.action === 'catalog.approve' && entry.changes?.length > 0),
      entry ? `${entry.action} by ${entry.actorName}` : 'none',
    );

    // 3. The seller was told.
    const notice = await db
      .collection('notifications')
      .findOne({ entityType: 'product' }, { sort: { createdAt: -1 } });
    record(
      'seller was notified',
      Boolean(notice && Date.now() - Date.parse(notice.createdAt) < 60_000),
      notice?.title?.slice(0, 46) ?? 'none',
    );
  }

  // The rejection path must demand a reason before it will fire.
  await page.goto(`${BASE}/admin/products?status=PENDING_REVIEW`, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  const reject = page.getByRole('button', { name: 'Reject' }).first();
  if ((await reject.count()) > 0) {
    await reject.click();
    await page.waitForTimeout(600);
    const confirm = page.getByRole('button', { name: 'Confirm' }).first();
    const disabled = await confirm.isDisabled();
    record('rejection requires a reason', disabled, disabled ? 'confirm disabled while empty' : 'confirm was enabled');
  }
} catch (error) {
  record('run completed', false, error instanceof Error ? error.message.slice(0, 90) : String(error));
} finally {
  await browser.close();
  await mongo.close();
}

console.log('');
const passed = results.filter(Boolean).length;
console.log(`  ${passed}/${results.length} checks passed`);
process.exitCode = passed === results.length ? 0 : 1;
