import type { Coupon, CouponOffer } from '@/domain/types';
import type { PaymentMethod } from '@/domain/enums';
import { clampDiscount, percentOf, sumPaise } from '@/lib/money';

/**
 * Coupon evaluation.
 *
 * A coupon is only ever applied by the server, and only through this module.
 * `evaluate` answers three questions at once, because the UI needs all three:
 *   - would this coupon apply right now?
 *   - if not, why not, in words a shopper understands?
 *   - how much more would they have to add for it to apply?
 */

export interface CouponContextLine {
  refId: string;
  productId: string;
  sellerId: string;
  brandId: string;
  /** Full category ancestry so a "Women's ethnic" coupon matches a kurta. */
  categoryPath: string[];
  quantity: number;
  unitSellingPrice: number;
  lineSubtotal: number;
}

export interface CouponContext {
  lines: CouponContextLine[];
  userId: string | null;
  /** The shopper has never had a delivered order. */
  isNewCustomer: boolean;
  /** How many times this user has already redeemed this coupon. */
  userRedemptionCount: number;
  paymentMethod: PaymentMethod | null;
  /** Segment keys the shopper belongs to, for targeted campaigns. */
  segments: string[];
  now: Date;
}

export interface CouponEvaluation {
  applicable: boolean;
  discount: number;
  /** Line refs the discount may be spread across. */
  eligibleRefIds: string[];
  waivesShipping: boolean;
  reason: string | null;
  /** Extra cart value needed to satisfy `minCartValue`. */
  amountToUnlock: number | null;
}

export function evaluateCoupon(coupon: Coupon, context: CouponContext): CouponEvaluation {
  const deny = (reason: string, amountToUnlock: number | null = null): CouponEvaluation => ({
    applicable: false,
    discount: 0,
    eligibleRefIds: [],
    waivesShipping: false,
    reason,
    amountToUnlock,
  });

  /* -- lifecycle -------------------------------------------------------- */

  if (!coupon.isActive) return deny('This coupon is no longer active.');

  const now = context.now.getTime();
  if (now < new Date(coupon.startsAt).getTime()) {
    return deny('This coupon is not active yet.');
  }
  if (now > new Date(coupon.endsAt).getTime()) {
    return deny('This coupon has expired.');
  }

  /* -- usage limits ----------------------------------------------------- */

  if (coupon.totalUsageLimit !== null && coupon.usedCount >= coupon.totalUsageLimit) {
    return deny('This coupon has been fully claimed.');
  }
  if (context.userRedemptionCount >= coupon.perUserLimit) {
    return deny(
      coupon.perUserLimit === 1
        ? 'You have already used this coupon.'
        : `You have used this coupon ${coupon.perUserLimit} times already.`,
    );
  }

  /* -- audience --------------------------------------------------------- */

  if (coupon.audience === 'NEW_CUSTOMER' && !context.isNewCustomer) {
    return deny('This offer is only for first-time Vestra shoppers.');
  }
  if (coupon.audience === 'EXISTING_CUSTOMER' && context.isNewCustomer) {
    return deny('This offer is only for returning shoppers.');
  }
  if (coupon.audience === 'SEGMENT') {
    if (!coupon.segmentKey || !context.segments.includes(coupon.segmentKey)) {
      return deny('This offer is not available on your account.');
    }
  }

  /* -- payment method --------------------------------------------------- */

  if (coupon.paymentMethods.length > 0) {
    if (!context.paymentMethod) {
      // Not a denial: the shopper simply has not chosen a method yet.
      return deny(
        `Applies with ${coupon.paymentMethods.map(readablePaymentMethod).join(' or ')}. Choose it at payment.`,
      );
    }
    if (!coupon.paymentMethods.includes(context.paymentMethod)) {
      return deny(
        `Only valid with ${coupon.paymentMethods.map(readablePaymentMethod).join(' or ')}.`,
      );
    }
  }

  /* -- which lines qualify ---------------------------------------------- */

  const eligibleLines = context.lines.filter((line) => lineMatchesScope(coupon, line));
  if (eligibleLines.length === 0) {
    return deny(scopeDenialMessage(coupon));
  }

  const eligibleSubtotal = sumPaise(eligibleLines.map((line) => line.lineSubtotal));

  /* -- minimum spend ----------------------------------------------------- */
  // Measured against the qualifying items only, not the whole bag, so a
  // "Rs 500 off ethnic wear above Rs 2,499" coupon cannot be unlocked by shoes.

  if (eligibleSubtotal < coupon.minCartValue) {
    return deny(
      `Add items worth ${formatShortfall(coupon.minCartValue - eligibleSubtotal)} more to use this.`,
      coupon.minCartValue - eligibleSubtotal,
    );
  }

  /* -- discount ---------------------------------------------------------- */

  const eligibleRefIds = eligibleLines.map((line) => line.refId);

  if (coupon.type === 'FREE_SHIPPING') {
    return { applicable: true, discount: 0, eligibleRefIds, waivesShipping: true, reason: null, amountToUnlock: null };
  }

  let discount = 0;

  if (coupon.type === 'PERCENTAGE') {
    discount = percentOf(eligibleSubtotal, coupon.value);
    if (coupon.maxDiscount !== null) discount = Math.min(discount, coupon.maxDiscount);
  } else if (coupon.type === 'FIXED') {
    discount = coupon.value;
  } else if (coupon.type === 'BUY_X_GET_Y' && coupon.buyXGetY) {
    discount = buyXGetYDiscount(eligibleLines, coupon.buyXGetY);
    if (discount === 0) {
      return deny(
        `Add ${coupon.buyXGetY.buyQuantity} qualifying items to unlock this offer.`,
      );
    }
  }

  discount = clampDiscount(discount, eligibleSubtotal);

  if (discount <= 0) {
    return deny('This coupon does not reduce your total right now.');
  }

  return { applicable: true, discount, eligibleRefIds, waivesShipping: false, reason: null, amountToUnlock: null };
}

/**
 * Buy-X-get-Y: expand qualifying lines into individual units, sort by price,
 * and discount the cheapest (or most expensive) unit in each complete group.
 */
function buyXGetYDiscount(
  lines: CouponContextLine[],
  rule: NonNullable<Coupon['buyXGetY']>,
): number {
  const units: number[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.quantity; i++) units.push(line.unitSellingPrice);
  }
  const groupSize = rule.buyQuantity + rule.getQuantity;
  if (units.length < groupSize) return 0;

  units.sort((a, b) => (rule.applyTo === 'CHEAPEST' ? a - b : b - a));

  const groups = Math.floor(units.length / groupSize);
  const freeUnitCount = groups * rule.getQuantity;
  const discounted = units.slice(0, freeUnitCount);
  return sumPaise(discounted.map((price) => percentOf(price, rule.discountPercent)));
}

function lineMatchesScope(coupon: Coupon, line: CouponContextLine): boolean {
  if (coupon.excludedProductIds.includes(line.productId)) return false;

  switch (coupon.scope) {
    case 'PLATFORM':
      return true;
    case 'CATEGORY':
      return coupon.categoryIds.some((id) => line.categoryPath.includes(id));
    case 'BRAND':
      return coupon.brandIds.includes(line.brandId);
    case 'SELLER':
      return coupon.sellerIds.includes(line.sellerId);
    case 'PRODUCT':
      return coupon.productIds.includes(line.productId);
    default:
      return false;
  }
}

function scopeDenialMessage(coupon: Coupon): string {
  switch (coupon.scope) {
    case 'CATEGORY':
      return 'None of the items in your bag are in the eligible categories.';
    case 'BRAND':
      return 'This coupon only applies to selected brands.';
    case 'SELLER':
      return 'This coupon only applies to items from a specific seller.';
    case 'PRODUCT':
      return 'This coupon only applies to selected products.';
    default:
      return 'This coupon does not apply to the items in your bag.';
  }
}

function readablePaymentMethod(method: PaymentMethod): string {
  const labels: Record<PaymentMethod, string> = {
    CARD: 'cards',
    UPI: 'UPI',
    NETBANKING: 'net banking',
    WALLET: 'wallets',
    COD: 'cash on delivery',
    VESTRA_CREDIT: 'Vestra Credit',
  };
  return labels[method];
}

function formatShortfall(paise: number): string {
  return `₹${Math.ceil(paise / 100).toLocaleString('en-IN')}`;
}

/**
 * Render the coupon drawer: every visible coupon with its live outcome, best
 * saving first, then the ones that are close to unlocking.
 */
export function buildCouponOffers(coupons: Coupon[], context: CouponContext): CouponOffer[] {
  return coupons
    .filter((coupon) => coupon.visible && coupon.isActive)
    .map((coupon) => {
      const evaluation = evaluateCoupon(coupon, context);
      return {
        code: coupon.code,
        title: coupon.title,
        description: coupon.description,
        potentialDiscount: evaluation.discount,
        applicable: evaluation.applicable,
        reason: evaluation.reason,
        amountToUnlock: evaluation.amountToUnlock,
        endsAt: coupon.endsAt,
        termsAndConditions: coupon.termsAndConditions,
      };
    })
    .sort((a, b) => {
      if (a.applicable !== b.applicable) return a.applicable ? -1 : 1;
      if (a.applicable) return b.potentialDiscount - a.potentialDiscount;
      // Among unusable coupons, surface the nearest to unlocking first.
      return (a.amountToUnlock ?? Number.MAX_SAFE_INTEGER) - (b.amountToUnlock ?? Number.MAX_SAFE_INTEGER);
    });
}

/** Auto-apply helper: the single best coupon for this bag, or null. */
export function bestCoupon(coupons: Coupon[], context: CouponContext): { coupon: Coupon; evaluation: CouponEvaluation } | null {
  let best: { coupon: Coupon; evaluation: CouponEvaluation } | null = null;
  for (const coupon of coupons) {
    const evaluation = evaluateCoupon(coupon, context);
    if (!evaluation.applicable) continue;
    if (!best || evaluation.discount > best.evaluation.discount) best = { coupon, evaluation };
  }
  return best;
}
