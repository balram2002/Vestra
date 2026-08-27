import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';

const BASE = 'http://localhost:3000';
const OUT = process.env.SHOT_DIR ?? '.';
const WIDTH = Number(process.env.W ?? 390);
const HEIGHT = Number(process.env.H ?? 900);
const FULL = process.env.FULL === '1';

const mongo = await MongoClient.connect('mongodb://127.0.0.1:27017');
const db = mongo.db('vestra');
const product = await db.collection('products').findOne({ status: 'PUBLISHED' });

const routes = (process.env.ROUTES ?? '/,/category/womens-ethnic-wear,PDP,/bag').split(',');

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 2,
});

// Sign in so the bag and account render with content.
await page.goto(`${BASE}/login`, { waitUntil: 'load' });
await page.fill('input[name="email"]', 'ananya.iyer@example.com');
await page.fill('input[name="password"]', 'vestra123');
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);

for (const route of routes) {
  const path = route === 'PDP' ? `/product/${product.slug}` : route;
  const name = (route === 'PDP' ? 'pdp' : route.replace(/\W+/g, '-') || 'home').replace(/^-|-$/g, '');

  await page.goto(BASE + path, { waitUntil: 'load' });
  // Let images and streamed islands settle.
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/${WIDTH}-${name}.png`, fullPage: FULL });
  console.log('captured', `${WIDTH}-${name}.png`, path);
}

await browser.close();
await mongo.close();
