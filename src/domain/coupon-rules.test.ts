import { describe, expect, it } from 'vitest';

import {
  COUPON_CODE_PATTERN,
  couponHeadline,
  couponTerms,
  couponWhere,
  describeCoupon,
  exampleSaving,
  suggestCode,
  type CouponRuleInput,
} from './coupon-rules';

const money = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

const base: CouponRuleInput = {
  type: 'PERCENTAGE',
  value: 20,
  maxDiscount: 30000,
  minCartValue: 149900,
  audience: 'ALL',
  scope: 'PLATFORM',
  targetNames: [],
  paymentMethods: [],
  totalUsageLimit: null,
  perUserLimit: 1,
};

describe('coupon headline', () => {
  it('states a capped percentage', () => {
    expect(couponHeadline(base, money)).toBe('20% off, up to ₹300');
  });
  it('states a flat amount in rupees', () => {
    expect(couponHeadline({ ...base, type: 'FIXED', value: 25000, maxDiscount: null }, money)).toBe('₹250 off');
  });
});

describe('describing a coupon', () => {
  it('reads as one sentence of its rules', () => {
    expect(
      describeCoupon({ ...base, audience: 'NEW_CUSTOMER', paymentMethods: ['UPI'] }, money),
    ).toBe('20% off, up to ₹300 · orders above ₹1,499 · first order only · with UPI');
  });

  it('names a scope, shortening long lists', () => {
    expect(couponWhere({ scope: 'BRAND', targetNames: ['Nike'] })).toBe('from Nike');
    expect(couponWhere({ scope: 'CATEGORY', targetNames: ['Kurtas', 'Sarees', 'Lehengas', 'Dupattas'] })).toBe(
      'in Kurtas, Sarees and 2 more',
    );
    expect(couponWhere({ scope: 'PLATFORM', targetNames: [] })).toBeNull();
  });
});

describe('coupon terms', () => {
  it('always states the per-account limit and no stacking', () => {
    const terms = couponTerms(base, money);
    expect(terms).toContain('One use per account.');
    expect(terms).toContain('Cannot be combined with another coupon.');
    expect(terms).toContain('Minimum order value ₹1,499 after other discounts.');
  });

  it('mentions the cap only for a percentage', () => {
    expect(couponTerms({ ...base, type: 'FIXED', value: 10000 }, money).join(' ')).not.toMatch(/Maximum discount/);
  });
});

describe('example saving', () => {
  it('caps a percentage at the maximum', () => {
    expect(exampleSaving(base, 500000)).toBe(30000);
  });
  it('is nothing below the minimum order', () => {
    expect(exampleSaving(base, 100000)).toBeNull();
  });
  it('never exceeds the bag for a flat amount', () => {
    expect(exampleSaving({ ...base, type: 'FIXED', value: 50000, minCartValue: 0 }, 20000)).toBe(20000);
  });
});

describe('suggested codes', () => {
  it('are valid codes built from the title', () => {
    const code = suggestCode('Summer sale', () => 0.5);
    expect(code.startsWith('SUMMER')).toBe(true);
    expect(COUPON_CODE_PATTERN.test(code)).toBe(true);
  });
  it('avoid characters that are easy to misread', () => {
    for (let run = 0; run < 50; run += 1) {
      const tail = suggestCode('', Math.random).slice(-4);
      expect(tail).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    }
  });
});
