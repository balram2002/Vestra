import { describe, expect, it } from 'vitest';

import type { Promotion } from '@/domain/types';
import { toPaise } from '../money';
import { evaluatePromotions, type PromotionContextLine } from './evaluate';

/**
 * Promotions decide money without anybody typing a code, which makes their
 * failure mode quiet: a stacking bug discounts an order to nothing and nobody
 * notices until the settlement. These tests pin the three rules that prevent
 * that — one offer per line, bank offers gated on the instrument, and flash
 * sales that actually end.
 */

const NOW = new Date('2026-06-15T10:00:00.000Z');

function promotion(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: 'prm_1',
    slug: 'test',
    title: 'Test offer',
    subtitle: null,
    description: 'A test offer',
    type: 'PERCENT_DISCOUNT',
    value: 10,
    maxDiscount: null,
    minOrderValue: 0,
    categoryIds: [],
    brandIds: [],
    sellerIds: [],
    productIds: [],
    paymentMethods: [],
    bankName: null,
    startsAt: '2026-06-01T00:00:00.000Z',
    endsAt: '2026-07-01T00:00:00.000Z',
    isActive: true,
    priority: 10,
    fundedBy: 'PLATFORM',
    bannerUrl: null,
    badgeText: null,
    buyXGetY: null,
    stockLimit: null,
    stockSold: 0,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function line(overrides: Partial<PromotionContextLine> = {}): PromotionContextLine {
  return {
    refId: 'line-1',
    productId: 'prd_1',
    sellerId: 'sel_1',
    brandId: 'brd_1',
    categoryPath: ['women', 'ethnic-wear', 'kurtas'],
    quantity: 1,
    unitSellingPrice: toPaise(1000),
    lineSubtotal: toPaise(1000),
    ...overrides,
  };
}

const context = (lines: PromotionContextLine[], paymentMethod: null | 'CARD' | 'UPI' = null) => ({
  lines,
  paymentMethod,
  now: NOW,
});

describe('lifecycle', () => {
  it('ignores an inactive promotion', () => {
    const result = evaluatePromotions([promotion({ isActive: false })], context([line()]));
    expect(result.applied).toHaveLength(0);
  });

  it('ignores one that has not started or has ended', () => {
    const future = promotion({ startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-09-01T00:00:00.000Z' });
    const past = promotion({ startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-02-01T00:00:00.000Z' });
    expect(evaluatePromotions([future], context([line()])).applied).toHaveLength(0);
    expect(evaluatePromotions([past], context([line()])).applied).toHaveLength(0);
  });

  it('respects a minimum order value on the eligible lines only', () => {
    const offer = promotion({ minOrderValue: toPaise(5000) });
    expect(evaluatePromotions([offer], context([line()])).applied).toHaveLength(0);

    const bigger = line({ lineSubtotal: toPaise(6000), unitSellingPrice: toPaise(6000) });
    expect(evaluatePromotions([offer], context([bigger])).applied).toHaveLength(1);
  });
});

describe('targeting', () => {
  it('applies to everything when nothing is targeted', () => {
    const result = evaluatePromotions([promotion()], context([line()]));
    expect(result.offers[0].discount).toBe(toPaise(100));
  });

  it('matches a category anywhere in the ancestry', () => {
    const offer = promotion({ categoryIds: ['women'] });
    expect(evaluatePromotions([offer], context([line()])).applied).toHaveLength(1);

    const other = line({ categoryPath: ['men', 'topwear'] });
    expect(evaluatePromotions([offer], context([other])).applied).toHaveLength(0);
  });

  it('treats multiple target lists as OR, not AND', () => {
    // A promotion naming both a brand and a seller reaches a line matching
    // either — narrowing to the intersection would silently exclude most of it.
    const offer = promotion({ brandIds: ['brd_other'], sellerIds: ['sel_1'] });
    expect(evaluatePromotions([offer], context([line()])).applied).toHaveLength(1);
  });
});

describe('one promotion per line', () => {
  it('keeps the largest discount rather than stacking', () => {
    const small = promotion({ id: 'prm_small', value: 10 });
    const large = promotion({ id: 'prm_large', value: 25 });

    const result = evaluatePromotions([small, large], context([line()]));

    // 25% of 1000 = 250, not 350.
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].id).toBe('prm_large');
    expect(result.offers[0].discount).toBe(toPaise(250));
  });

  it('breaks a tie on priority', () => {
    const low = promotion({ id: 'prm_low', value: 10, priority: 1 });
    const high = promotion({ id: 'prm_high', value: 10, priority: 99 });
    const result = evaluatePromotions([low, high], context([line()]));
    expect(result.offers[0].id).toBe('prm_high');
  });

  it('lets different promotions win on different lines', () => {
    const ethnic = promotion({ id: 'prm_ethnic', value: 30, categoryIds: ['women'] });
    const everything = promotion({ id: 'prm_all', value: 10 });

    const result = evaluatePromotions(
      [ethnic, everything],
      context([line(), line({ refId: 'line-2', categoryPath: ['men', 'topwear'] })]),
    );

    expect(result.offers.map((offer) => offer.id).sort()).toEqual(['prm_all', 'prm_ethnic']);
  });

  it('never discounts a line below its own value', () => {
    const huge = promotion({ value: 500 });
    const result = evaluatePromotions([huge], context([line()]));
    expect(result.offers[0].discount).toBeLessThanOrEqual(toPaise(1000));
  });
});

describe('caps', () => {
  it('applies the cap across the promotion, not per line', () => {
    const capped = promotion({ value: 50, maxDiscount: toPaise(300) });
    const result = evaluatePromotions(
      [capped],
      context([line(), line({ refId: 'line-2' })]),
    );
    // 50% of 2000 is 1000, capped to 300 across both lines.
    expect(result.offers[0].discount).toBe(toPaise(300));
  });
});

describe('bank offers', () => {
  const bank = promotion({ type: 'BANK_OFFER', value: 10, paymentMethods: ['CARD'] });

  it('is messaging only until a payment method is chosen', () => {
    const result = evaluatePromotions([bank], context([line()], null));
    expect(result.applied).toHaveLength(0);
    expect(result.available).toHaveLength(1);
    expect(result.available[0].title).toBe('Test offer');
  });

  it('does not apply on a non-matching method', () => {
    const result = evaluatePromotions([bank], context([line()], 'UPI'));
    expect(result.applied).toHaveLength(0);
    expect(result.available).toHaveLength(1);
  });

  it('becomes money once the matching instrument is selected', () => {
    const result = evaluatePromotions([bank], context([line()], 'CARD'));
    expect(result.applied).toHaveLength(1);
    expect(result.offers[0].discount).toBe(toPaise(100));
  });
});

describe('flash sales', () => {
  it('stops once the allocation is gone', () => {
    const soldOut = promotion({ type: 'FLASH_SALE', stockLimit: 100, stockSold: 100 });
    expect(evaluatePromotions([soldOut], context([line()])).applied).toHaveLength(0);

    const running = promotion({ type: 'FLASH_SALE', stockLimit: 100, stockSold: 99 });
    expect(evaluatePromotions([running], context([line()])).applied).toHaveLength(1);
  });
});

describe('flat discounts', () => {
  it('spreads across lines by value and never exceeds the total', () => {
    const flat = promotion({ type: 'FLAT_DISCOUNT', value: toPaise(300) });
    const result = evaluatePromotions(
      [flat],
      context([line(), line({ refId: 'line-2', lineSubtotal: toPaise(3000) })]),
    );
    expect(result.offers[0].discount).toBe(toPaise(300));
  });

  it('caps at the bag value when the flat amount exceeds it', () => {
    const flat = promotion({ type: 'FLAT_DISCOUNT', value: toPaise(9000) });
    const result = evaluatePromotions([flat], context([line()]));
    expect(result.offers[0].discount).toBeLessThanOrEqual(toPaise(1000));
  });
});

describe('buy X get Y', () => {
  const bxgy = promotion({
    type: 'BUY_X_GET_Y',
    value: 0,
    buyXGetY: { buyQuantity: 2, getQuantity: 1, applyTo: 'CHEAPEST', discountPercent: 100 },
  });

  it('does nothing below the group size', () => {
    const result = evaluatePromotions([bxgy], context([line({ quantity: 2, lineSubtotal: toPaise(2000) })]));
    expect(result.applied).toHaveLength(0);
  });

  it('discounts the cheapest unit once the group is complete', () => {
    const result = evaluatePromotions(
      [bxgy],
      context([
        line({ refId: 'a', quantity: 2, unitSellingPrice: toPaise(1000), lineSubtotal: toPaise(2000) }),
        line({ refId: 'b', quantity: 1, unitSellingPrice: toPaise(400), lineSubtotal: toPaise(400) }),
      ]),
    );
    // Three units; the cheapest (400) becomes free.
    expect(result.offers[0].discount).toBe(toPaise(400));
  });

  it('scales with the number of complete groups', () => {
    const result = evaluatePromotions(
      [bxgy],
      context([line({ quantity: 6, unitSellingPrice: toPaise(500), lineSubtotal: toPaise(3000) })]),
    );
    // Six units, two complete groups of three, two free units at 500.
    expect(result.offers[0].discount).toBe(toPaise(1000));
  });
});
