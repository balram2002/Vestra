import { describe, expect, it } from 'vitest';

import { toPaise } from '../money';
import { calculatePricing, discountPercent, refundableAmount, type PricingLineInput } from './calculate';

/**
 * The pricing engine decides what a customer is charged, what a seller is owed
 * and what a refund returns. Everything here is about arithmetic that must
 * reconcile to the paise — an allocation that loses a rupee is invisible on one
 * order and a reconciliation failure across a million.
 */

function line(overrides: Partial<PricingLineInput> = {}): PricingLineInput {
  return {
    refId: 'line-1',
    variantId: 'var-1',
    sellerId: 'seller-a',
    categoryId: 'cat-1',
    quantity: 1,
    unitMrp: toPaise(2000),
    unitSellingPrice: toPaise(1200),
    categoryTaxRatePercent: 12,
    ...overrides,
  };
}

describe('calculatePricing', () => {
  it('returns an empty breakdown for an empty bag', () => {
    const result = calculatePricing({ lines: [], shippingBySeller: {} });
    expect(result.payable).toBe(0);
    expect(result.lines).toHaveLength(0);
  });

  it('charges selling price plus shipping', () => {
    const result = calculatePricing({
      lines: [line()],
      shippingBySeller: { 'seller-a': toPaise(79) },
    });

    expect(result.subtotal).toBe(toPaise(1200));
    expect(result.mrpTotal).toBe(toPaise(2000));
    expect(result.listDiscount).toBe(toPaise(800));
    expect(result.shippingFee).toBe(toPaise(79));
    expect(result.payable).toBe(toPaise(1279));
  });

  it('waives shipping for a seller past their threshold', () => {
    const result = calculatePricing({
      lines: [line()],
      shippingBySeller: { 'seller-a': toPaise(79) },
      freeShippingSellers: ['seller-a'],
    });

    expect(result.shippingDiscount).toBe(toPaise(79));
    expect(result.payable).toBe(toPaise(1200));
  });

  /**
   * The central invariant: cart-level amounts must be spread across lines so
   * the parts sum exactly to the whole. A coupon of 100 across three lines
   * cannot allocate 33+33+33.
   */
  it('allocates a coupon across lines with no paise lost', () => {
    const result = calculatePricing({
      lines: [
        line({ refId: 'a', unitSellingPrice: toPaise(1000) }),
        line({ refId: 'b', unitSellingPrice: toPaise(1000) }),
        line({ refId: 'c', unitSellingPrice: toPaise(1000) }),
      ],
      shippingBySeller: { 'seller-a': 0 },
      coupon: {
        code: 'SAVE100',
        title: 'Flat 100 off',
        fundedBy: 'PLATFORM',
        discount: toPaise(100),
        eligibleRefIds: [],
        waivesShipping: false,
      },
    });

    const allocated = result.lines.reduce((sum, l) => sum + l.couponDiscount, 0);
    expect(allocated).toBe(toPaise(100));
    expect(result.couponDiscount).toBe(toPaise(100));
  });

  it('spreads an indivisible coupon without rounding it away', () => {
    // 10 paise across 3 lines: 4 + 3 + 3, never 3 + 3 + 3.
    const result = calculatePricing({
      lines: [
        line({ refId: 'a', unitSellingPrice: toPaise(100) }),
        line({ refId: 'b', unitSellingPrice: toPaise(100) }),
        line({ refId: 'c', unitSellingPrice: toPaise(100) }),
      ],
      shippingBySeller: { 'seller-a': 0 },
      coupon: {
        code: 'ODD',
        title: 'Odd',
        fundedBy: 'PLATFORM',
        discount: 10,
        eligibleRefIds: [],
        waivesShipping: false,
      },
    });

    expect(result.lines.reduce((sum, l) => sum + l.couponDiscount, 0)).toBe(10);
  });

  it('restricts a scoped coupon to its eligible lines', () => {
    const result = calculatePricing({
      lines: [
        line({ refId: 'eligible', unitSellingPrice: toPaise(1000) }),
        line({ refId: 'other', unitSellingPrice: toPaise(1000) }),
      ],
      shippingBySeller: { 'seller-a': 0 },
      coupon: {
        code: 'BRANDONLY',
        title: 'Brand only',
        fundedBy: 'SELLER',
        discount: toPaise(200),
        eligibleRefIds: ['eligible'],
        waivesShipping: false,
      },
    });

    const eligible = result.lines.find((l) => l.refId === 'eligible')!;
    const other = result.lines.find((l) => l.refId === 'other')!;
    expect(eligible.couponDiscount).toBe(toPaise(200));
    expect(other.couponDiscount).toBe(0);
  });

  it('never lets a discount drive a line below zero', () => {
    const result = calculatePricing({
      lines: [line({ unitSellingPrice: toPaise(100) })],
      shippingBySeller: { 'seller-a': 0 },
      coupon: {
        code: 'HUGE',
        title: 'Too generous',
        fundedBy: 'PLATFORM',
        discount: toPaise(5000),
        eligibleRefIds: [],
        waivesShipping: false,
      },
    });

    expect(result.payable).toBe(0);
    expect(result.couponDiscount).toBeLessThanOrEqual(toPaise(100));
  });

  /**
   * India taxes apparel on the PER-UNIT price: below 1,000 rupees it is 5%,
   * at or above it is 12%. Applying the slab to the line total instead would
   * over-tax two 600-rupee shirts.
   */
  it('applies the apparel GST slab per unit, not per line', () => {
    const cheap = calculatePricing({
      lines: [line({ quantity: 2, unitSellingPrice: toPaise(600), unitMrp: toPaise(600) })],
      shippingBySeller: { 'seller-a': 0 },
    });
    expect(cheap.lines[0].taxRatePercent).toBe(5);

    const dear = calculatePricing({
      lines: [line({ quantity: 1, unitSellingPrice: toPaise(1200), unitMrp: toPaise(1200) })],
      shippingBySeller: { 'seller-a': 0 },
    });
    expect(dear.lines[0].taxRatePercent).toBe(12);
  });

  it('extracts tax from the price rather than adding it on', () => {
    const result = calculatePricing({
      lines: [line({ unitSellingPrice: toPaise(1120), unitMrp: toPaise(1120) })],
      shippingBySeller: { 'seller-a': 0 },
    });

    // 1120 inclusive of 12% => 120 tax, 1000 taxable.
    expect(result.taxTotal).toBe(toPaise(120));
    expect(result.payable).toBe(toPaise(1120));
  });

  it('splits GST into CGST and SGST within a state, IGST across one', () => {
    const intra = calculatePricing({
      lines: [line({ unitSellingPrice: toPaise(1120), unitMrp: toPaise(1120) })],
      shippingBySeller: { 'seller-a': 0 },
      isInterState: false,
    });
    expect(intra.taxBreakup[0].igst).toBe(0);
    expect(intra.taxBreakup[0].cgst + intra.taxBreakup[0].sgst).toBe(intra.taxBreakup[0].total);

    const inter = calculatePricing({
      lines: [line({ unitSellingPrice: toPaise(1120), unitMrp: toPaise(1120) })],
      shippingBySeller: { 'seller-a': 0 },
      isInterState: true,
    });
    expect(inter.taxBreakup[0].cgst).toBe(0);
    expect(inter.taxBreakup[0].sgst).toBe(0);
    expect(inter.taxBreakup[0].igst).toBe(inter.taxBreakup[0].total);
  });

  it('splits shipping per seller and allocates each seller fee to their own lines', () => {
    const result = calculatePricing({
      lines: [
        line({ refId: 'a', sellerId: 'seller-a', unitSellingPrice: toPaise(1000) }),
        line({ refId: 'b', sellerId: 'seller-b', unitSellingPrice: toPaise(1000) }),
      ],
      shippingBySeller: { 'seller-a': toPaise(79), 'seller-b': toPaise(49) },
    });

    expect(result.shippingFee).toBe(toPaise(128));
    expect(result.lines.find((l) => l.refId === 'a')!.shippingFee).toBe(toPaise(79));
    expect(result.lines.find((l) => l.refId === 'b')!.shippingFee).toBe(toPaise(49));
  });

  it('caps store credit at what is actually owed', () => {
    const result = calculatePricing({
      lines: [line({ unitSellingPrice: toPaise(500), unitMrp: toPaise(500) })],
      shippingBySeller: { 'seller-a': 0 },
      creditRequested: toPaise(900),
    });

    expect(result.creditApplied).toBe(toPaise(500));
    expect(result.payable).toBe(0);
  });

  it('adds the COD fee to the payable amount', () => {
    const result = calculatePricing({
      lines: [line({ unitSellingPrice: toPaise(1000), unitMrp: toPaise(1000) })],
      shippingBySeller: { 'seller-a': 0 },
      codFee: toPaise(49),
    });
    expect(result.payable).toBe(toPaise(1049));
  });
});

describe('discountPercent', () => {
  it('rounds down so the claim never overstates the saving', () => {
    // 1999 off 2999 is 33.34%; advertising 34% would be a lie.
    expect(discountPercent(toPaise(2999), toPaise(1999))).toBe(33);
  });

  it('returns zero when there is no discount', () => {
    expect(discountPercent(toPaise(1000), toPaise(1000))).toBe(0);
    expect(discountPercent(toPaise(1000), toPaise(1200))).toBe(0);
    expect(discountPercent(0, 0)).toBe(0);
  });
});

describe('refundableAmount', () => {
  const priced = calculatePricing({
    lines: [line({ quantity: 3, unitSellingPrice: toPaise(1000), unitMrp: toPaise(1000) })],
    shippingBySeller: { 'seller-a': toPaise(90) },
    coupon: {
      code: 'C300',
      title: '300 off',
      fundedBy: 'PLATFORM',
      discount: toPaise(300),
      eligibleRefIds: [],
      waivesShipping: false,
    },
  });

  it('refunds a proportional share of the line, coupon included', () => {
    // 3000 goods less a 300 coupon = 2700; one of three units is 900.
    expect(refundableAmount(priced.lines[0], 1, { includeShipping: false })).toBe(toPaise(900));
  });

  it('only returns shipping when the whole parcel goes back', () => {
    const partial = refundableAmount(priced.lines[0], 1, { includeShipping: false });
    const whole = refundableAmount(priced.lines[0], 3, { includeShipping: true });
    expect(whole - partial).toBe(toPaise(2700) - toPaise(900) + toPaise(90));
  });

  it('never refunds more than the line contributed', () => {
    const over = refundableAmount(priced.lines[0], 99, { includeShipping: false });
    expect(over).toBe(toPaise(2700));
  });
});
