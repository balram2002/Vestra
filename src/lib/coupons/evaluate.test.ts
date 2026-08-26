import { describe, expect, it } from 'vitest';

import type { Coupon } from '@/domain/types';

import {
  bestCoupon,
  buildCouponOffers,
  evaluateCoupon,
  type CouponContext,
  type CouponContextLine,
} from './evaluate';

/**
 * Coupon evaluation.
 *
 * This engine decides how much money comes off a real order, and it is the
 * only place that decision is made. Everything here is a pure function over
 * plain data, so the branches that matter — the denial reasons a shopper reads,
 * the minimum measured against qualifying items only, the clamp that stops a
 * fixed discount exceeding the goods — are cheap to pin down exactly.
 *
 * The assertions are deliberately on the NUMBERS and the WORDS rather than on
 * `applicable` alone. A coupon that applies for the wrong reason, or refuses
 * with a message that sends the shopper to add the wrong thing, is a bug that
 * an `expect(result.applicable).toBe(false)` would sail straight past.
 */

const RUPEE = 100;

function line(overrides: Partial<CouponContextLine> = {}): CouponContextLine {
  const quantity = overrides.quantity ?? 1;
  const unitSellingPrice = overrides.unitSellingPrice ?? 1000 * RUPEE;
  return {
    refId: 'line-1',
    productId: 'prd_1',
    sellerId: 'sel_1',
    brandId: 'brd_1',
    categoryPath: ['womens', 'womens-ethnic-wear', 'kurtas'],
    quantity,
    unitSellingPrice,
    lineSubtotal: unitSellingPrice * quantity,
    ...overrides,
  };
}

function context(overrides: Partial<CouponContext> = {}): CouponContext {
  return {
    lines: [line()],
    userId: 'usr_1',
    isNewCustomer: false,
    userRedemptionCount: 0,
    paymentMethod: null,
    segments: [],
    shippingTotal: 0,
    now: new Date('2026-06-15T10:00:00.000Z'),
    ...overrides,
  };
}

function coupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    id: 'cpn_1',
    code: 'SAVE10',
    title: '10% off',
    description: 'Ten per cent off your order',
    type: 'PERCENTAGE',
    scope: 'PLATFORM',
    value: 10,
    maxDiscount: null,
    minCartValue: 0,
    categoryIds: [],
    brandIds: [],
    sellerIds: [],
    productIds: [],
    excludedProductIds: [],
    audience: 'ALL',
    segmentKey: null,
    paymentMethods: [],
    totalUsageLimit: null,
    perUserLimit: 1,
    usedCount: 0,
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2026-12-31T23:59:59.000Z',
    isActive: true,
    stackableWithOffers: false,
    fundedBy: 'PLATFORM',
    visible: true,
    termsAndConditions: [],
    createdByUserId: 'usr_admin',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    buyXGetY: null,
    ...overrides,
  };
}

/* ---------------------------------------------------------------- lifecycle */

describe('lifecycle', () => {
  it('refuses a deactivated coupon', () => {
    const result = evaluateCoupon(coupon({ isActive: false }), context());
    expect(result.applicable).toBe(false);
    expect(result.reason).toBe('This coupon is no longer active.');
    expect(result.discount).toBe(0);
  });

  it('refuses a coupon whose window has not opened', () => {
    const result = evaluateCoupon(
      coupon({ startsAt: '2026-07-01T00:00:00.000Z' }),
      context({ now: new Date('2026-06-15T10:00:00.000Z') }),
    );
    expect(result.reason).toBe('This coupon is not active yet.');
  });

  it('refuses a coupon whose window has closed', () => {
    const result = evaluateCoupon(
      coupon({ endsAt: '2026-06-01T00:00:00.000Z' }),
      context({ now: new Date('2026-06-15T10:00:00.000Z') }),
    );
    expect(result.reason).toBe('This coupon has expired.');
  });

  /*
   * The boundaries are inclusive at both ends. A campaign advertised as running
   * "until the 30th" that stops working at 23:59:58 generates support tickets.
   */
  it('accepts the exact first and last instant of the window', () => {
    const promo = coupon({
      startsAt: '2026-06-01T00:00:00.000Z',
      endsAt: '2026-06-30T23:59:59.000Z',
    });

    expect(
      evaluateCoupon(promo, context({ now: new Date('2026-06-01T00:00:00.000Z') })).applicable,
    ).toBe(true);
    expect(
      evaluateCoupon(promo, context({ now: new Date('2026-06-30T23:59:59.000Z') })).applicable,
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------- usage */

describe('usage limits', () => {
  it('refuses once the global allocation is exhausted', () => {
    const result = evaluateCoupon(
      coupon({ totalUsageLimit: 500, usedCount: 500 }),
      context(),
    );
    expect(result.reason).toBe('This coupon has been fully claimed.');
  });

  it('treats a null total limit as unlimited', () => {
    const result = evaluateCoupon(
      coupon({ totalUsageLimit: null, usedCount: 9_999_999 }),
      context(),
    );
    expect(result.applicable).toBe(true);
  });

  /*
   * Two phrasings, because "you have used this coupon 1 times already" is the
   * kind of copy that makes a storefront look unfinished.
   */
  it('phrases a single-use limit differently from a multi-use one', () => {
    expect(
      evaluateCoupon(coupon({ perUserLimit: 1 }), context({ userRedemptionCount: 1 })).reason,
    ).toBe('You have already used this coupon.');

    expect(
      evaluateCoupon(coupon({ perUserLimit: 3 }), context({ userRedemptionCount: 3 })).reason,
    ).toBe('You have used this coupon 3 times already.');
  });

  it('allows a redemption below the per-user limit', () => {
    const result = evaluateCoupon(
      coupon({ perUserLimit: 3 }),
      context({ userRedemptionCount: 2 }),
    );
    expect(result.applicable).toBe(true);
  });
});

/* ----------------------------------------------------------------- audience */

describe('audience', () => {
  it('holds a first-order coupon back from a returning shopper', () => {
    const result = evaluateCoupon(
      coupon({ audience: 'NEW_CUSTOMER' }),
      context({ isNewCustomer: false }),
    );
    expect(result.reason).toBe('This offer is only for first-time Vestra shoppers.');
  });

  it('holds a win-back coupon back from a first-time shopper', () => {
    const result = evaluateCoupon(
      coupon({ audience: 'EXISTING_CUSTOMER' }),
      context({ isNewCustomer: true }),
    );
    expect(result.reason).toBe('This offer is only for returning shoppers.');
  });

  it('requires membership of the targeted segment', () => {
    const targeted = coupon({ audience: 'SEGMENT', segmentKey: 'high-value' });

    expect(evaluateCoupon(targeted, context({ segments: ['lapsed'] })).applicable).toBe(false);
    expect(evaluateCoupon(targeted, context({ segments: ['high-value'] })).applicable).toBe(true);
  });

  /*
   * A segment coupon with no key set is a misconfiguration. It must fail
   * CLOSED — an audience of "everyone" is the opposite of what was intended,
   * and would be discovered only from the discount line on the invoice.
   */
  it('refuses a segment coupon with no segment configured', () => {
    const result = evaluateCoupon(
      coupon({ audience: 'SEGMENT', segmentKey: null }),
      context({ segments: ['high-value'] }),
    );
    expect(result.applicable).toBe(false);
  });
});

/* ----------------------------------------------------------- payment method */

describe('payment method', () => {
  /*
   * Before a method is chosen this is guidance, not a refusal — the shopper has
   * done nothing wrong yet, and the message tells them how to get the discount.
   */
  it('explains how to qualify when no method has been chosen', () => {
    const result = evaluateCoupon(
      coupon({ paymentMethods: ['UPI'] }),
      context({ paymentMethod: null }),
    );
    expect(result.applicable).toBe(false);
    expect(result.reason).toBe('Applies with UPI. Choose it at payment.');
  });

  it('refuses outright once a non-qualifying method is chosen', () => {
    const result = evaluateCoupon(
      coupon({ paymentMethods: ['CARD', 'UPI'] }),
      context({ paymentMethod: 'COD' }),
    );
    expect(result.reason).toBe('Only valid with cards or UPI.');
  });

  it('applies when the chosen method qualifies', () => {
    const result = evaluateCoupon(
      coupon({ paymentMethods: ['UPI'] }),
      context({ paymentMethod: 'UPI' }),
    );
    expect(result.applicable).toBe(true);
  });
});

/* -------------------------------------------------------------------- scope */

describe('scope', () => {
  it('matches a category coupon anywhere in the ancestry, not just the leaf', () => {
    const result = evaluateCoupon(
      coupon({ scope: 'CATEGORY', categoryIds: ['womens-ethnic-wear'] }),
      context({ lines: [line({ categoryPath: ['womens', 'womens-ethnic-wear', 'kurtas'] })] }),
    );
    expect(result.applicable).toBe(true);
  });

  it('names the right thing when nothing in the bag qualifies', () => {
    expect(
      evaluateCoupon(coupon({ scope: 'BRAND', brandIds: ['brd_other'] }), context()).reason,
    ).toBe('This coupon only applies to selected brands.');

    expect(
      evaluateCoupon(coupon({ scope: 'SELLER', sellerIds: ['sel_other'] }), context()).reason,
    ).toBe('This coupon only applies to items from a specific seller.');

    expect(
      evaluateCoupon(coupon({ scope: 'PRODUCT', productIds: ['prd_other'] }), context()).reason,
    ).toBe('This coupon only applies to selected products.');
  });

  /*
   * An exclusion has to beat the scope that would otherwise include it —
   * "20% off everything except clearance" is the whole point of the field.
   */
  it('lets an exclusion override a matching scope', () => {
    const result = evaluateCoupon(
      coupon({ scope: 'PLATFORM', excludedProductIds: ['prd_1'] }),
      context({ lines: [line({ productId: 'prd_1' })] }),
    );
    expect(result.applicable).toBe(false);
  });

  it('discounts only the qualifying lines and reports which they were', () => {
    const result = evaluateCoupon(
      coupon({ scope: 'BRAND', brandIds: ['brd_1'], type: 'PERCENTAGE', value: 10 }),
      context({
        lines: [
          line({ refId: 'a', brandId: 'brd_1', unitSellingPrice: 2000 * RUPEE }),
          line({ refId: 'b', brandId: 'brd_2', unitSellingPrice: 5000 * RUPEE }),
        ],
      }),
    );

    expect(result.eligibleRefIds).toEqual(['a']);
    // 10% of the qualifying line only — never of the whole bag.
    expect(result.discount).toBe(200 * RUPEE);
  });
});

/* ------------------------------------------------------------ minimum spend */

describe('minimum spend', () => {
  /*
   * The load-bearing rule: the minimum is measured against the QUALIFYING
   * items, not the bag. Otherwise a pair of shoes unlocks a coupon written for
   * ethnic wear, which is a discount the merchandising team never agreed to.
   */
  it('measures the minimum against qualifying items only', () => {
    const result = evaluateCoupon(
      coupon({ scope: 'BRAND', brandIds: ['brd_1'], minCartValue: 2500 * RUPEE }),
      context({
        lines: [
          line({ refId: 'a', brandId: 'brd_1', unitSellingPrice: 1000 * RUPEE }),
          line({ refId: 'b', brandId: 'brd_2', unitSellingPrice: 9000 * RUPEE }),
        ],
      }),
    );

    expect(result.applicable).toBe(false);
    expect(result.amountToUnlock).toBe(1500 * RUPEE);
  });

  it('rounds the shortfall UP to the rupee in the message', () => {
    const result = evaluateCoupon(
      coupon({ minCartValue: 1000 * RUPEE + 50 }),
      context({ lines: [line({ unitSellingPrice: 1000 * RUPEE })] }),
    );

    // 50 paise short. Telling a shopper to add "₹0" more would be absurd, and
    // rounding down would leave them still short after they complied.
    expect(result.amountToUnlock).toBe(50);
    expect(result.reason).toBe('Add items worth ₹1 more to use this.');
  });

  it('applies when the qualifying subtotal exactly meets the minimum', () => {
    const result = evaluateCoupon(
      coupon({ minCartValue: 1000 * RUPEE }),
      context({ lines: [line({ unitSellingPrice: 1000 * RUPEE })] }),
    );
    expect(result.applicable).toBe(true);
  });
});

/* ----------------------------------------------------------------- discount */

describe('discount arithmetic', () => {
  it('caps a percentage discount at maxDiscount', () => {
    const result = evaluateCoupon(
      coupon({ type: 'PERCENTAGE', value: 50, maxDiscount: 1000 * RUPEE }),
      context({ lines: [line({ unitSellingPrice: 10_000 * RUPEE })] }),
    );
    // 50% would be ₹5,000; the cap holds it to ₹1,000.
    expect(result.discount).toBe(1000 * RUPEE);
  });

  /*
   * A ₹500 fixed coupon on ₹300 of goods must take ₹300, not ₹500. Without the
   * clamp the order total goes negative and the shopper is owed money for
   * shopping.
   */
  it('never discounts more than the qualifying goods are worth', () => {
    const result = evaluateCoupon(
      coupon({ type: 'FIXED', value: 500 * RUPEE }),
      context({ lines: [line({ unitSellingPrice: 300 * RUPEE })] }),
    );
    expect(result.discount).toBe(300 * RUPEE);
  });

  it('refuses a coupon that would take nothing off', () => {
    const result = evaluateCoupon(
      coupon({ type: 'FIXED', value: 0 }),
      context(),
    );
    expect(result.applicable).toBe(false);
    expect(result.reason).toBe('This coupon does not reduce your total right now.');
  });
});

/* ----------------------------------------------------------- free shipping */

describe('free shipping', () => {
  it('waives exactly the delivery being charged', () => {
    const result = evaluateCoupon(
      coupon({ type: 'FREE_SHIPPING' }),
      context({ shippingTotal: 79 * RUPEE }),
    );

    expect(result.applicable).toBe(true);
    expect(result.waivesShipping).toBe(true);
    expect(result.discount).toBe(79 * RUPEE);
  });

  /*
   * "Save ₹0" reads as a broken discount rather than as the good news that
   * delivery was already free.
   */
  it('refuses when delivery is already free, and says so as good news', () => {
    const result = evaluateCoupon(
      coupon({ type: 'FREE_SHIPPING' }),
      context({ shippingTotal: 0 }),
    );
    expect(result.reason).toBe('Your order already ships free.');
  });

  it('does not set waivesShipping on an ordinary coupon', () => {
    expect(evaluateCoupon(coupon({ type: 'PERCENTAGE', value: 10 }), context()).waivesShipping).toBe(
      false,
    );
  });
});

/* ------------------------------------------------------------- buy X get Y */

describe('buy X get Y', () => {
  const bxgy = (overrides: Partial<NonNullable<Coupon['buyXGetY']>> = {}) =>
    coupon({
      type: 'BUY_X_GET_Y',
      buyXGetY: { buyQuantity: 2, getQuantity: 1, applyTo: 'CHEAPEST', discountPercent: 100, ...overrides },
    });

  it('counts UNITS across lines, not lines', () => {
    // Two lines, one unit each, plus a third unit — three units, one group.
    const result = evaluateCoupon(
      bxgy(),
      context({
        lines: [
          line({ refId: 'a', unitSellingPrice: 1000 * RUPEE, quantity: 2 }),
          line({ refId: 'b', unitSellingPrice: 500 * RUPEE, quantity: 1 }),
        ],
      }),
    );

    // Cheapest of the three units is ₹500, free outright.
    expect(result.discount).toBe(500 * RUPEE);
  });

  it('refuses, with instructions, below one complete group', () => {
    const result = evaluateCoupon(
      bxgy(),
      context({ lines: [line({ quantity: 2 })] }),
    );
    expect(result.applicable).toBe(false);
    expect(result.reason).toBe('Add 2 qualifying items to unlock this offer.');
  });

  it('discounts one free unit per COMPLETE group and ignores the remainder', () => {
    // Seven units of ₹1,000: two complete groups of three, one unit spare.
    const result = evaluateCoupon(
      bxgy(),
      context({ lines: [line({ unitSellingPrice: 1000 * RUPEE, quantity: 7 })] }),
    );
    expect(result.discount).toBe(2000 * RUPEE);
  });

  it('honours MOST_EXPENSIVE when that is the advertised rule', () => {
    const result = evaluateCoupon(
      bxgy({ applyTo: 'MOST_EXPENSIVE' }),
      context({
        lines: [
          line({ refId: 'a', unitSellingPrice: 3000 * RUPEE, quantity: 1 }),
          line({ refId: 'b', unitSellingPrice: 1000 * RUPEE, quantity: 2 }),
        ],
      }),
    );
    expect(result.discount).toBe(3000 * RUPEE);
  });

  it('supports a partial discount on the free unit', () => {
    const result = evaluateCoupon(
      bxgy({ discountPercent: 50 }),
      context({ lines: [line({ unitSellingPrice: 1000 * RUPEE, quantity: 3 })] }),
    );
    expect(result.discount).toBe(500 * RUPEE);
  });
});

/* ------------------------------------------------------------- the drawer */

describe('buildCouponOffers', () => {
  it('hides coupons that are not meant to be browsed', () => {
    const offers = buildCouponOffers(
      [
        coupon({ code: 'PUBLIC', visible: true }),
        coupon({ code: 'SECRET', visible: false }),
        coupon({ code: 'DEAD', visible: true, isActive: false }),
      ],
      context(),
    );

    expect(offers.map((offer) => offer.code)).toEqual(['PUBLIC']);
  });

  /*
   * Usable first by saving, then the ones nearest to unlocking. A shopper
   * scanning the drawer should find the money at the top and the achievable
   * next step immediately below it.
   */
  it('orders by saving, then by how close an unusable coupon is', () => {
    const offers = buildCouponOffers(
      [
        coupon({ code: 'SMALL', type: 'FIXED', value: 100 * RUPEE }),
        coupon({ code: 'FAR', minCartValue: 50_000 * RUPEE }),
        coupon({ code: 'BIG', type: 'FIXED', value: 400 * RUPEE }),
        coupon({ code: 'NEAR', minCartValue: 1100 * RUPEE }),
      ],
      context({ lines: [line({ unitSellingPrice: 1000 * RUPEE })] }),
    );

    expect(offers.map((offer) => offer.code)).toEqual(['BIG', 'SMALL', 'NEAR', 'FAR']);
  });

  it('carries the reason and shortfall through for the unusable ones', () => {
    const [offer] = buildCouponOffers(
      [coupon({ code: 'NEAR', minCartValue: 1500 * RUPEE })],
      context({ lines: [line({ unitSellingPrice: 1000 * RUPEE })] }),
    );

    expect(offer.applicable).toBe(false);
    expect(offer.amountToUnlock).toBe(500 * RUPEE);
    expect(offer.potentialDiscount).toBe(0);
  });
});

/* -------------------------------------------------------------- auto-apply */

describe('bestCoupon', () => {
  it('picks the largest saving, not the first match', () => {
    const best = bestCoupon(
      [
        coupon({ code: 'FIRST', type: 'FIXED', value: 100 * RUPEE }),
        coupon({ code: 'BEST', type: 'FIXED', value: 300 * RUPEE }),
        coupon({ code: 'MIDDLE', type: 'FIXED', value: 200 * RUPEE }),
      ],
      context(),
    );

    expect(best?.coupon.code).toBe('BEST');
    expect(best?.evaluation.discount).toBe(300 * RUPEE);
  });

  it('ignores coupons that do not apply', () => {
    const best = bestCoupon(
      [
        coupon({ code: 'HUGE', type: 'FIXED', value: 5000 * RUPEE, minCartValue: 90_000 * RUPEE }),
        coupon({ code: 'REAL', type: 'FIXED', value: 100 * RUPEE }),
      ],
      context(),
    );

    expect(best?.coupon.code).toBe('REAL');
  });

  it('returns null when nothing applies', () => {
    expect(bestCoupon([coupon({ isActive: false })], context())).toBeNull();
  });

  /*
   * A hidden coupon is still redeemable by anyone who knows the code, but it
   * must never be handed out automatically — that is what `visible: false` is
   * for, and auto-apply reads the same list the drawer does.
   */
  it('considers a hidden coupon when it is passed one', () => {
    const best = bestCoupon([coupon({ code: 'SECRET', visible: false, type: 'FIXED', value: 100 * RUPEE })], context());
    expect(best?.coupon.code).toBe('SECRET');
  });
});
