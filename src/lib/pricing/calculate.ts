import type { AppliedOffer, PriceBreakdown, PriceLine, TaxLine } from '@/domain/types';
import { allocateProportionally, clampDiscount, percentageOf, sumPaise } from '@/lib/money';
import { aggregateTaxLines, resolveGstRate, taxForLine } from './tax';

/**
 * THE pricing engine.
 *
 * Nothing else in the codebase is allowed to decide what a customer pays. The
 * bag, checkout, order creation, invoices, refunds and seller settlement all
 * call this one function so that every number in the system is derived the same
 * way and reconciles to the paise.
 *
 * Order of operations matters and is fixed:
 *   1. line subtotal at selling price
 *   2. automatic promotions (seller-funded, then platform-funded)
 *   3. coupon, capped and allocated across eligible lines
 *   4. shipping, per seller, then allocated across that seller's lines
 *   5. COD / gift-wrap / packaging fees
 *   6. GST extracted from the post-discount, tax-inclusive line value
 *   7. store credit applied last, against the final payable
 *
 * Every cart-level amount is allocated down to line level with a
 * largest-remainder split so that a single-line refund can be computed exactly.
 */

export interface PricingLineInput {
  refId: string;
  variantId: string;
  sellerId: string;
  categoryId: string;
  quantity: number;
  unitMrp: number;
  unitSellingPrice: number;
  /** Category GST slab; the per-unit apparel rule is applied inside. */
  categoryTaxRatePercent: number;
}

export interface PricingPromotionInput {
  id: string;
  title: string;
  description: string;
  type: AppliedOffer['type'];
  fundedBy: 'PLATFORM' | 'SELLER';
  /** Discount already resolved to paise, per line ref. */
  discountByRefId: Record<string, number>;
}

export interface PricingCouponInput {
  code: string;
  title: string;
  fundedBy: 'PLATFORM' | 'SELLER';
  /** Total discount, already validated and capped by the coupon engine. */
  discount: number;
  /** Only these lines may absorb the coupon; empty means all lines. */
  eligibleRefIds: string[];
  /** Free-shipping coupons waive the fee instead of discounting goods. */
  waivesShipping: boolean;
}

export interface PricingInput {
  lines: PricingLineInput[];
  /** Shipping fee per seller id, before any waiver. */
  shippingBySeller: Record<string, number>;
  /** Sellers whose shipping is free because their threshold was met. */
  freeShippingSellers?: string[];
  promotions?: PricingPromotionInput[];
  coupon?: PricingCouponInput | null;
  codFee?: number;
  giftWrapFee?: number;
  packagingFee?: number;
  /** Store credit the shopper asked to use; capped at the payable amount. */
  creditRequested?: number;
  /** Decides CGST+SGST vs IGST on the invoice. */
  isInterState?: boolean;
}

export function calculatePricing(input: PricingInput): PriceBreakdown {
  const {
    lines,
    shippingBySeller,
    freeShippingSellers = [],
    promotions = [],
    coupon = null,
    codFee = 0,
    giftWrapFee = 0,
    packagingFee = 0,
    creditRequested = 0,
    isInterState = false,
  } = input;

  if (lines.length === 0) return emptyBreakdown();

  /* -- 1. line subtotals ------------------------------------------------- */

  const draft = lines.map((line) => {
    const lineMrp = line.unitMrp * line.quantity;
    const lineSubtotal = line.unitSellingPrice * line.quantity;
    return {
      input: line,
      lineMrp,
      lineSubtotal,
      sellerDiscount: 0,
      platformDiscount: 0,
      couponDiscount: 0,
      shippingFee: 0,
      shippingDiscount: 0,
      packagingFee: 0,
    };
  });

  const byRefId = new Map(draft.map((line) => [line.input.refId, line]));

  /* -- 2. automatic promotions ------------------------------------------ */

  for (const promotion of promotions) {
    for (const [refId, rawDiscount] of Object.entries(promotion.discountByRefId)) {
      const line = byRefId.get(refId);
      if (!line || rawDiscount <= 0) continue;
      // A promotion can never take a line below zero, however they combine.
      const remaining = line.lineSubtotal - line.sellerDiscount - line.platformDiscount;
      const discount = clampDiscount(rawDiscount, remaining);
      if (promotion.fundedBy === 'SELLER') line.sellerDiscount += discount;
      else line.platformDiscount += discount;
    }
  }

  /* -- 3. coupon --------------------------------------------------------- */

  let couponDiscountApplied = 0;
  if (coupon && coupon.discount > 0 && !coupon.waivesShipping) {
    const eligible =
      coupon.eligibleRefIds.length > 0
        ? draft.filter((line) => coupon.eligibleRefIds.includes(line.input.refId))
        : draft;

    // Weight by what is actually still chargeable on each line, so a coupon
    // never over-allocates onto an already fully-discounted item.
    const weights = eligible.map((line) =>
      Math.max(0, line.lineSubtotal - line.sellerDiscount - line.platformDiscount),
    );
    const chargeable = sumPaise(weights);
    const capped = clampDiscount(coupon.discount, chargeable);
    const allocation = allocateProportionally(capped, weights);

    eligible.forEach((line, index) => {
      line.couponDiscount = allocation[index];
    });
    couponDiscountApplied = capped;
  }

  /* -- 4. shipping ------------------------------------------------------- */

  const sellerIds = [...new Set(lines.map((line) => line.sellerId))];
  let shippingFeeTotal = 0;
  let shippingDiscountTotal = 0;

  for (const sellerId of sellerIds) {
    const sellerLines = draft.filter((line) => line.input.sellerId === sellerId);
    const baseFee = shippingBySeller[sellerId] ?? 0;
    const waived =
      freeShippingSellers.includes(sellerId) || (coupon?.waivesShipping ?? false) ? baseFee : 0;

    shippingFeeTotal += baseFee;
    shippingDiscountTotal += waived;

    // Spread the seller's shipping across their lines by value, so returning
    // one of three items refunds a defensible third of the delivery charge.
    const weights = sellerLines.map((line) => line.lineSubtotal);
    const feeAllocation = allocateProportionally(baseFee, weights);
    const waiverAllocation = allocateProportionally(waived, weights);
    sellerLines.forEach((line, index) => {
      line.shippingFee = feeAllocation[index];
      line.shippingDiscount = waiverAllocation[index];
    });
  }

  if (coupon?.waivesShipping) {
    couponDiscountApplied = shippingDiscountTotal;
  }

  /* -- 5. flat fees ------------------------------------------------------ */

  const packagingAllocation = allocateProportionally(
    packagingFee,
    draft.map((line) => line.lineSubtotal),
  );
  draft.forEach((line, index) => {
    line.packagingFee = packagingAllocation[index];
  });

  /* -- 6. tax ------------------------------------------------------------ */

  const priceLines: PriceLine[] = draft.map((line) => {
    const goodsValue =
      line.lineSubtotal - line.sellerDiscount - line.platformDiscount - line.couponDiscount;
    const shippingCharged = line.shippingFee - line.shippingDiscount;
    // GST applies to the goods value and to the delivery charge alike.
    const taxableInclusive = goodsValue + shippingCharged + line.packagingFee;

    const ratePercent = resolveGstRate(
      line.input.categoryTaxRatePercent,
      line.input.unitSellingPrice,
    );
    const tax = taxForLine(taxableInclusive, ratePercent, isInterState);

    return {
      refId: line.input.refId,
      variantId: line.input.variantId,
      sellerId: line.input.sellerId,
      quantity: line.input.quantity,
      unitMrp: line.input.unitMrp,
      unitSellingPrice: line.input.unitSellingPrice,
      lineMrp: line.lineMrp,
      lineSubtotal: line.lineSubtotal,
      sellerDiscount: line.sellerDiscount,
      platformDiscount: line.platformDiscount,
      couponDiscount: line.couponDiscount,
      shippingFee: line.shippingFee,
      shippingDiscount: line.shippingDiscount,
      packagingFee: line.packagingFee,
      taxRatePercent: ratePercent,
      taxAmount: tax.total,
      lineTotal: taxableInclusive,
      _tax: tax,
    } as PriceLine & { _tax: TaxLine };
  });

  const taxBreakup = aggregateTaxLines(
    priceLines.map((line) => (line as PriceLine & { _tax: TaxLine })._tax),
  );
  priceLines.forEach((line) => {
    delete (line as PriceLine & { _tax?: TaxLine })._tax;
  });

  /* -- 7. totals and credit --------------------------------------------- */

  const mrpTotal = sumPaise(draft.map((line) => line.lineMrp));
  const subtotal = sumPaise(draft.map((line) => line.lineSubtotal));
  const sellerDiscount = sumPaise(draft.map((line) => line.sellerDiscount));
  const platformDiscount = sumPaise(draft.map((line) => line.platformDiscount));
  const couponDiscount = coupon?.waivesShipping
    ? 0
    : sumPaise(draft.map((line) => line.couponDiscount));
  const taxTotal = sumPaise(taxBreakup.map((line) => line.total));

  const beforeCredit =
    subtotal -
    sellerDiscount -
    platformDiscount -
    couponDiscount +
    (shippingFeeTotal - shippingDiscountTotal) +
    packagingFee +
    giftWrapFee +
    codFee;

  const creditApplied = clampDiscount(creditRequested, Math.max(0, beforeCredit));
  const payable = Math.max(0, beforeCredit - creditApplied);

  const totalSavings = mrpTotal - payable;

  return {
    mrpTotal,
    subtotal,
    listDiscount: mrpTotal - subtotal,
    sellerDiscount,
    platformDiscount,
    couponDiscount: coupon?.waivesShipping ? couponDiscountApplied : couponDiscount,
    couponCode: coupon?.code ?? null,
    shippingFee: shippingFeeTotal,
    shippingDiscount: shippingDiscountTotal,
    codFee,
    packagingFee,
    giftWrapFee,
    taxTotal,
    taxBreakup,
    creditApplied,
    payable,
    totalSavings: Math.max(0, totalSavings),
    savingsPercent: mrpTotal > 0 ? percentageOf(Math.max(0, totalSavings), mrpTotal) : 0,
    lines: priceLines,
  };
}

export function emptyBreakdown(): PriceBreakdown {
  return {
    mrpTotal: 0,
    subtotal: 0,
    listDiscount: 0,
    sellerDiscount: 0,
    platformDiscount: 0,
    couponDiscount: 0,
    couponCode: null,
    shippingFee: 0,
    shippingDiscount: 0,
    codFee: 0,
    packagingFee: 0,
    giftWrapFee: 0,
    taxTotal: 0,
    taxBreakup: [],
    creditApplied: 0,
    payable: 0,
    totalSavings: 0,
    savingsPercent: 0,
    lines: [],
  };
}

/**
 * Discount percentage shown on product cards and the PDP.
 * Rounded DOWN so the marketing claim is never larger than the real saving.
 */
export function discountPercent(mrp: number, sellingPrice: number): number {
  if (mrp <= 0 || sellingPrice >= mrp) return 0;
  return Math.floor(((mrp - sellingPrice) / mrp) * 100);
}

/**
 * The amount refundable for a partial return: the exact share of the order that
 * these units carried, including their allocated coupon and shipping.
 * Shipping is only refunded when the whole seller order goes back.
 */
export function refundableAmount(
  line: PriceLine,
  quantityReturned: number,
  options: { includeShipping: boolean },
): number {
  if (line.quantity <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, quantityReturned / line.quantity));
  const goods =
    line.lineSubtotal - line.sellerDiscount - line.platformDiscount - line.couponDiscount;
  const shipping = options.includeShipping ? line.shippingFee - line.shippingDiscount : 0;
  return Math.round(goods * ratio) + shipping;
}
