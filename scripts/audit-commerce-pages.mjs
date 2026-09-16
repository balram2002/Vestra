import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';

const base = process.env.BASE_URL ?? 'http://localhost:3001';
const dbName = process.env.MONGODB_DB;
if (!dbName?.includes('test') || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
  throw new Error('Choose a local test server and database.');
}
const mongo = await new MongoClient(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017').connect();
const db = mongo.db(dbName);
const seller = await db.collection('sellers').findOne({ status: 'ACTIVE' });
const product = await db.collection('products').findOne({ sellerId: seller.id, status: 'PUBLISHED' });
const browser = await chromium.launch();
let failed = false;
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    for (const route of [`/store/${seller.slug}`, `/product/${product.slug}`, `/demo/${product.slug}`, '/category/womens-ethnic-wear']) {
      await page.goto(base + route, { waitUntil: 'networkidle' });
      const result = await new AxeBuilder({ page }).analyze();
      const violations = result.violations.filter((item) => ['serious', 'critical'].includes(item.impact));
      console.log(width, route, violations.map((item) => `${item.id}: ${item.nodes.length}`).join(', ') || 'PASS');
      if (violations.length) failed = true;
    }
    await context.close();
  }
} finally {
  await browser.close();
  await mongo.close();
}
if (failed) process.exitCode = 1;
