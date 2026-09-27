import { describe, expect, it } from 'vitest';

import { describePromotion, findOverlap, promotionHeadline, type OverlapCandidate, type PromotionRuleInput } from './promotion-rules';

const money = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

const rule: PromotionRuleInput = {
  type: 'SELLER_OFFER',
  valueKind: 'AMOUNT',
  value: 30000,
  maxDiscount: null,
  minOrderValue: 199900,
  buyXGetY: null,
  paymentMethods: [],
  bankName: null,
  targetNames: ['Saanjh Atelier'],
  stockLimit: null,
};

describe('promotion wording', () => {
  it('reads the value by its kind, never by the type', () => {
    // A store offer with an AMOUNT is rupees -- read as a percentage it once
    // gave whole orders away (AGENTS.md).
    expect(promotionHeadline(rule, money)).toBe('₹300 off');
    expect(promotionHeadline({ ...rule, valueKind: 'PERCENT', value: 15 }, money)).toBe('15% off');
  });

  it('describes buy X get Y from its own rule', () => {
    const bxgy = { ...rule, type: 'BUY_X_GET_Y' as const, buyXGetY: { buyQuantity: 2, getQuantity: 1, discountPercent: 100, applyTo: 'CHEAPEST' as const } };
    expect(promotionHeadline(bxgy, money)).toBe('Buy 2, get 1 free');
    expect(promotionHeadline({ ...bxgy, buyXGetY: { ...bxgy.buyXGetY, discountPercent: 50 } }, money)).toBe('Buy 2, get 1 at 50% off');
  });

  it('says where, the minimum and the payment method', () => {
    expect(
      describePromotion({ ...rule, paymentMethods: ['CARD'], bankName: 'HDFC Bank' }, money),
    ).toBe('₹300 off · on Saanjh Atelier · when those items total ₹1,999+ · with HDFC Bank Credit / Debit card');
  });
});

const base: OverlapCandidate = {
  id: 'a',
  title: 'A',
  startsAt: '2026-10-01T00:00:00.000Z',
  endsAt: '2026-10-10T00:00:00.000Z',
  priority: 10,
  valueKind: 'PERCENT',
  value: 20,
  type: 'PERCENT_DISCOUNT',
  categoryIds: [],
  brandIds: [],
  sellerIds: [],
  productIds: [],
  paymentMethods: [],
};
const name = (id: string) => id.toUpperCase();

describe('overlaps', () => {
  it('ignores offers that never run at the same time', () => {
    const later = { ...base, id: 'b', startsAt: '2026-10-11T00:00:00.000Z', endsAt: '2026-10-20T00:00:00.000Z' };
    expect(findOverlap(base, later, name)).toBeNull();
  });

  it('flags two shop-wide offers, and says the larger usually wins', () => {
    const other = { ...base, id: 'b', title: 'B', value: 30 };
    const overlap = findOverlap(base, other, name);
    expect(overlap?.reason).toBe('Both cover everything in the shop.');
    expect(overlap?.outcome).toMatch(/usually “B”/);
  });

  it('needs a shared target when both are targeted', () => {
    const a = { ...base, brandIds: ['nike'] };
    expect(findOverlap(a, { ...base, id: 'b', brandIds: ['puma'] }, name)).toBeNull();
    expect(findOverlap(a, { ...base, id: 'b', brandIds: ['nike', 'puma'] }, name)?.reason).toBe('Both include NIKE.');
  });

  it('does not collide across different payment methods', () => {
    const upi = { ...base, paymentMethods: ['UPI' as const] };
    expect(findOverlap(upi, { ...base, id: 'b', paymentMethods: ['CARD'] }, name)).toBeNull();
  });

  it('falls back to priority on an equal discount, and warns when that is equal too', () => {
    expect(findOverlap(base, { ...base, id: 'b', title: 'B', priority: 50 }, name)?.outcome).toMatch(/higher priority wins: “B”/);
    expect(findOverlap(base, { ...base, id: 'b', title: 'B' }, name)?.outcome).toMatch(/not defined/);
  });
});
