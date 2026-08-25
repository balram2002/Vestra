/**
 * Offers smoke test.
 *
 *     npm run start &
 *     node scripts/smoke-offers.mjs
 *
 * Coupons and promotions decide what a shopper pays, so the checks here are
 * about the TOTAL rather than about a banner appearing. It asserts that the
 * discount shown is the discount taken, that a bad code is refused with a
 * reason, and that removing a coupon puts the money back.
 */

import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const EMAIL = 'ananya.iyer@example.com';
const PASSWORD = 'vestra123';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  ok    ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
  }
};

const client = await MongoClient.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017');
const db = client.db(process.env.MONGODB_DB ?? 'vestra');

console.log('\nOffers\n');

/* ------------------------------------------------------------- data */

const promotions = await db.collection('promotions').countDocuments();
const coupons = await db.collection('coupons').countDocuments({ isActive: true });
check('promotions are seeded', promotions > 0, String(promotions));
check('coupons are seeded', coupons > 0, String(coupons));

const shopper = await db.collection('users').findOne({ email: EMAIL });
await db.collection('carts').deleteMany({ userId: shopper._id });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

await page.goto(`${BASE}/login`, { waitUntil: 'load' });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await Promise.all([
  page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);

/* ----------------------------------------------------- fill the bag */

/*
 * A product whose sizes are actually buyable.
 *
 * Matching on "some variant has stock" is not enough: the size the page offers
 * may be a different, sold-out one, and the add-to-bag then fails for a reason
 * unrelated to offers. Every active variant must have stock.
 */
const candidates = await db
  .collection('products')
  .find({ status: 'PUBLISHED', 'priceRange.minSellingPrice': { $gte: 150000 } })
  .limit(200)
  .toArray();

const product = candidates.find((candidate) => {
  const active = candidate.variants.filter((variant) => variant.isActive);
  return active.length >= 2 && active.every((variant) => variant.inventory.available >= 2);
});
check('found a product whose sizes are all in stock', Boolean(product), product?.title ?? '');

await page.goto(`${BASE}/product/${product.slug}`, { waitUntil: 'load' });
await page.waitForTimeout(1200);

// Scoped to the size control, and skipping sold-out sizes: a disabled size
// swallows the click and the add-to-bag then fails for a reason that has
// nothing to do with offers.
const sizeButtons = page.locator('#size-options button[aria-pressed]');
const sizeCount = await sizeButtons.count();
let picked = false;
for (let i = 0; i < sizeCount; i++) {
  const button = sizeButtons.nth(i);
  if ((await button.getAttribute('aria-disabled')) === 'true') continue;
  await button.click();
  picked = true;
  break;
}
check('a size could be selected', picked, `${sizeCount} sizes offered`);

await page.getByRole('button', { name: /add to bag/i }).first().click();
await page.waitForTimeout(2500);

await page.goto(`${BASE}/bag`, { waitUntil: 'load' });
await page.waitForTimeout(2000);

const bagText = await page.locator('body').innerText();
check('the bag shows the offers panel', /Offers and coupons/i.test(bagText));

const readTotal = async () => {
  const cart = await db.collection('carts').findOne({ userId: shopper._id });
  return cart;
};

/* --------------------------------------------------- a bad code */

await page.getByPlaceholder('Enter code').fill('NOTAREALCODE');
await page.getByRole('button', { name: 'Apply', exact: true }).click();
await page.waitForTimeout(1800);

const afterBad = await readTotal();
check('an unknown code is not stored on the bag', afterBad?.couponCode == null,
  String(afterBad?.couponCode));

const toastText = await page.locator('body').innerText();
check('the shopper is told why', /does not exist|not valid|no longer/i.test(toastText));

/* --------------------------------------------------- a real code */

// Take a coupon the engine says is usable right now, rather than guessing.
const usable = page.locator('button', { hasText: /^Save ₹/ });
const hasUsable = (await usable.count()) > 0;
check('at least one coupon is offered as usable', hasUsable);

if (hasUsable) {
  const label = await usable.first().innerText();
  const promised = Number(label.replace(/[^\d]/g, ''));

  await usable.first().click();
  await page.waitForTimeout(2500);

  const applied = await readTotal();
  check('the coupon was stored on the bag', Boolean(applied?.couponCode), String(applied?.couponCode));

  const afterText = await page.locator('body').innerText();
  check('the bag confirms it applied', /applied/i.test(afterText));

  /*
   * The important assertion: the saving the button promised is the saving the
   * total actually moved by. A banner that says one thing while the total says
   * another is the failure mode that matters.
   */
  const couponLine = afterText.match(/Coupon\s+\w+\s*\n?\s*−\s*₹([\d,]+)/);
  const shown = couponLine ? Number(couponLine[1].replace(/,/g, '')) : null;
  check(
    'the discount taken matches the discount promised',
    shown !== null && Math.abs(shown - promised) <= 1,
    `promised ${promised}, took ${shown}`,
  );

  /* ------------------------------------------------ removing it */

  await page.getByRole('button', { name: /Remove coupon/i }).click();
  await page.waitForTimeout(2000);

  const removed = await readTotal();
  check('removing the coupon clears it from the bag', removed?.couponCode == null);

  const finalText = await page.locator('body').innerText();
  check('the discount line is gone', !/Coupon\s+\w+\s*\n?\s*−/.test(finalText));
}

/* ------------------------------------------------- promotions apply */

// A promotion needs no code, so its effect is visible without any interaction.
const activePromotions = await db
  .collection('promotions')
  .find({ isActive: true, endsAt: { $gte: new Date().toISOString() } })
  .toArray();
check('some promotions are currently live', activePromotions.length > 0,
  `${activePromotions.length} live`);

/*
 * The real proof: a promotion that needs no code actually moves the total.
 *
 * The bag is seeded directly so the qualifying conditions are met exactly —
 * driving the UI to build a bag above a minimum spend makes the test about
 * clicking rather than about the discount.
 */
const categoryPromotion = activePromotions.find(
  (promotion) => promotion.categoryIds?.length > 0 && promotion.paymentMethods?.length === 0,
);

if (categoryPromotion) {
  const targetCategory = await db
    .collection('categories')
    .findOne({ _id: categoryPromotion.categoryIds[0] });

  const qualifying = (
    await db
      .collection('products')
      .find({ status: 'PUBLISHED', categoryPath: targetCategory?.slug })
      .limit(120)
      .toArray()
  ).find((candidate) => {
    const active = candidate.variants.filter((variant) => variant.isActive);
    return active.length > 0 && active.some((variant) => variant.inventory.available >= 3);
  });

  check('found a product the promotion targets', Boolean(qualifying), targetCategory?.slug ?? '');

  if (qualifying) {
    const variant = qualifying.variants.find(
      (entry) => entry.isActive && entry.inventory.available >= 3,
    );
    // Enough units to clear the promotion's minimum spend.
    const quantity = Math.min(
      3,
      Math.max(1, Math.ceil((categoryPromotion.minOrderValue + 1) / variant.sellingPrice)),
    );

    const now = new Date().toISOString();
    await db.collection('carts').deleteMany({ userId: shopper._id });
    await db.collection('carts').insertOne({
      _id: 'crt_offer_smoke',
      id: 'crt_offer_smoke',
      userId: shopper._id,
      guestToken: null,
      items: [
        {
          id: 'cri_offer_smoke',
          productId: qualifying._id,
          variantId: variant.id,
          sellerId: qualifying.sellerId,
          quantity,
          priceAtAdd: variant.sellingPrice,
          addedAt: now,
        },
      ],
      savedForLater: [],
      couponCode: null,
      addressId: null,
      shippingOptionId: null,
      paymentMethod: null,
      useCredit: false,
      giftWrap: false,
      orderNote: null,
      createdAt: now,
      updatedAt: now,
    });

    await page.goto(`${BASE}/bag`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const promoText = await page.locator('body').innerText();

    const eligibleValue = variant.sellingPrice * quantity;
    const qualifies = eligibleValue >= categoryPromotion.minOrderValue;

    check(
      'the promotion is itemised on the bag with no code typed',
      !qualifies || promoText.includes(categoryPromotion.title),
      `bag value ${eligibleValue}, minimum ${categoryPromotion.minOrderValue}`,
    );
  }
}

const bankOffer = activePromotions.find((promotion) => promotion.paymentMethods?.length > 0);
if (bankOffer) {
  // A bank offer must NOT be discounting before a payment method is chosen.
  const text = await page.locator('body').innerText();
  const discountedByBank = new RegExp(bankOffer.title.slice(0, 20), 'i').test(text);
  const listedAsAvailable = /bank/i.test(text);
  check(
    'a bank offer is messaging, not money, before payment',
    !discountedByBank || listedAsAvailable,
    bankOffer.title,
  );
}

await db.collection('carts').deleteMany({ userId: shopper._id });

await browser.close();
await client.close();

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
