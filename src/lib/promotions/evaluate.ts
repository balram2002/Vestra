import type { AppliedOffer, Promotion } from '@/domain/types';
import type { PaymentMethod } from '@/domain/enums';
import type { PricingPromotionInput } from '@/lib/pricing/calculate';
import { clampDiscount, percentOf, sumPaise } from '@/lib/money';

/**
 * Promotions.
 *
 * The automatic half of the discount system: no code to type, they simply
 * apply. Coupons are the other half, and the two behave differently on purpose.
 *
 * Three rules:
 *
 *  1. ONE PROMOTION PER LINE — the best one. Real marketplaces do not stack
 *     automatic offers, and letting them stack is how a 40%-off sale plus a
 *     festival offer plus a seller offer discounts an item to nothing. Each
 *     line is evaluated against every promotion and keeps the largest.
 *
 *  2. BANK OFFERS ARE MESSAGING UNTIL THE INSTRUMENT IS CHOSEN. "10% off with
 *     HDFC credit cards" is a promise about a payment method, so it is shown
 *     on the bag and only becomes money at the payment step. Applying it
 *     earlier would show a total the shopper cannot actually pay.
 *
 *  3. A FLASH SALE STOPS WHEN ITS STOCK RUNS OUT. Otherwise the whole point of
 *     it — scarcity — is a lie, and the seller funds an unbounded discount.
 */

export interface PromotionContextLine {
  refId: string;
  productId: string;
  sellerId: string;
  brandId: string;
  /** Full category ancestry, so a department-wide offer reaches a leaf. */
  categoryPath: string[];
  quantity: number;
  unitSellingPrice: number;
  lineSubtotal: number;
}

export interface PromotionContext {
  lines: PromotionContextLine[];
  /** Null until the shopper reaches the payment step. */
  paymentMethod: PaymentMethod | null;
  now: Date;
}

export interface PromotionResult {
  /** Ready for the pricing engine. */
  applied: PricingPromotionInput[];
  /** What to tell the shopper was taken off. */
  offers: AppliedOffer[];
  /**
   * Offers that exist but are not applied yet, with the reason — bank offers
   * awaiting a payment method, mostly. Rendered as "available offers".
   */
  available: Array<{ id: string; title: string; description: string; badge: string | null }>;
}

export function evaluatePromotions(
  promotions: Promotion[],
  context: PromotionContext,
): PromotionResult {
  const live = promotions.filter((promotion) => isLive(promotion, context.now));

  const applied: PricingPromotionInput[] = [];
  const offers: AppliedOffer[] = [];
  const available: PromotionResult['available'] = [];

  /** refId -> the winning promotion and what it takes off. */
  const best = new Map<string, { promotion: Promotion; discount: number }>();

  for (const promotion of live) {
    const eligible = context.lines.filter((line) => lineMatches(promotion, line));
    if (eligible.length === 0) continue;

    const eligibleValue = sumPaise(eligible.map((line) => line.lineSubtotal));
    if (eligibleValue < promotion.minOrderValue) continue;

    // Rule 2: a bank offer with no matching instrument is a message, not money.
    if (promotion.paymentMethods.length > 0) {
      const matches =
        context.paymentMethod !== null && promotion.paymentMethods.includes(context.paymentMethod);
      if (!matches) {
        available.push({
          id: promotion.id,
          title: promotion.title,
          description: promotion.description,
          badge: promotion.badgeText,
        });
        continue;
      }
    }

    // Rule 3: a flash sale that has sold its allocation is over.
    if (promotion.stockLimit !== null && promotion.stockSold >= promotion.stockLimit) {
      continue;
    }

    const perLine = discountFor(promotion, eligible);

    for (const [refId, discount] of perLine) {
      if (discount <= 0) continue;
      const current = best.get(refId);
      // Rule 1: the largest wins; ties break on the higher-priority promotion.
      if (
        !current ||
        discount > current.discount ||
        (discount === current.discount && promotion.priority > current.promotion.priority)
      ) {
        best.set(refId, { promotion, discount });
      }
    }
  }

  // Regroup the winners by promotion, which is how they are priced and shown.
  const byPromotion = new Map<string, { promotion: Promotion; lines: Record<string, number> }>();
  for (const [refId, winner] of best) {
    const entry = byPromotion.get(winner.promotion.id) ?? {
      promotion: winner.promotion,
      lines: {},
    };
    entry.lines[refId] = winner.discount;
    byPromotion.set(winner.promotion.id, entry);
  }

  for (const { promotion, lines } of byPromotion.values()) {
    const total = sumPaise(Object.values(lines));
    if (total <= 0) continue;

    applied.push({
      id: promotion.id,
      title: promotion.title,
      description: promotion.description,
      type: promotion.type,
      fundedBy: promotion.fundedBy,
      discountByRefId: lines,
    });

    offers.push({
      id: promotion.id,
      type: promotion.type,
      title: promotion.title,
      description: promotion.description,
      discount: total,
      fundedBy: promotion.fundedBy,
    });
  }

  offers.sort((a, b) => b.discount - a.discount);
  return { applied, offers, available };
}

/* --------------------------------------------------------------- matching */

function isLive(promotion: Promotion, now: Date): boolean {
  if (!promotion.isActive) return false;
  const at = now.getTime();
  return at >= Date.parse(promotion.startsAt) && at <= Date.parse(promotion.endsAt);
}

/**
 * A promotion with no targeting at all applies to everything. Anything listed
 * NARROWS it, and the lists are OR-ed: a promotion naming both a brand and a
 * category matches a line in either.
 */
function lineMatches(promotion: Promotion, line: PromotionContextLine): boolean {
  const targeted =
    promotion.categoryIds.length > 0 ||
    promotion.brandIds.length > 0 ||
    promotion.sellerIds.length > 0 ||
    promotion.productIds.length > 0;

  if (!targeted) return true;

  if (promotion.productIds.includes(line.productId)) return true;
  if (promotion.brandIds.includes(line.brandId)) return true;
  if (promotion.sellerIds.includes(line.sellerId)) return true;
  if (promotion.categoryIds.some((id) => line.categoryPath.includes(id))) return true;

  return false;
}

/* -------------------------------------------------------------- discounts */

function discountFor(
  promotion: Promotion,
  lines: PromotionContextLine[],
): Map<string, number> {
  const result = new Map<string, number>();

  switch (promotion.type) {
    case 'PERCENT_DISCOUNT':
    case 'FLASH_SALE':
    case 'CATEGORY_OFFER':
    case 'SELLER_OFFER':
    case 'FESTIVAL_CAMPAIGN':
    case 'BANK_OFFER': {
      // A cap applies to the whole promotion, not to each line, so it is
      // apportioned by value once the raw discounts are known.
      const raw = lines.map((line) => ({
        refId: line.refId,
        amount: percentOf(line.lineSubtotal, promotion.value),
      }));
      const total = sumPaise(raw.map((entry) => entry.amount));
      const capped =
        promotion.maxDiscount !== null ? Math.min(total, promotion.maxDiscount) : total;
      const ratio = total > 0 ? capped / total : 0;

      for (const entry of raw) {
        result.set(entry.refId, Math.round(entry.amount * ratio));
      }
      break;
    }

    case 'FLAT_DISCOUNT': {
      // Spread by value so a flat 500 off never exceeds any one line.
      const total = sumPaise(lines.map((line) => line.lineSubtotal));
      if (total <= 0) break;
      const amount = clampDiscount(promotion.value, total);
      for (const line of lines) {
        result.set(line.refId, Math.round((amount * line.lineSubtotal) / total));
      }
      break;
    }

    case 'BUY_X_GET_Y': {
      const rule = promotion.buyXGetY;
      if (!rule) break;

      // Expand to units, because the offer is about units and not lines.
      const units: Array<{ refId: string; price: number }> = [];
      for (const line of lines) {
        for (let i = 0; i < line.quantity; i++) {
          units.push({ refId: line.refId, price: line.unitSellingPrice });
        }
      }

      const groupSize = rule.buyQuantity + rule.getQuantity;
      if (units.length < groupSize) break;

      units.sort((a, b) =>
        rule.applyTo === 'CHEAPEST' ? a.price - b.price : b.price - a.price,
      );

      const freeCount = Math.floor(units.length / groupSize) * rule.getQuantity;
      for (const unit of units.slice(0, freeCount)) {
        const discount = percentOf(unit.price, rule.discountPercent);
        result.set(unit.refId, (result.get(unit.refId) ?? 0) + discount);
      }
      break;
    }

    default:
      break;
  }

  // Nothing may take a line below zero, whatever the arithmetic said.
  for (const line of lines) {
    const discount = result.get(line.refId);
    if (discount === undefined) continue;
    result.set(line.refId, clampDiscount(discount, line.lineSubtotal));
  }

  return result;
}

/**
 * Promotions worth showing on a product page, whether or not they would apply
 * to the current bag. This is the "offers" block on a PDP.
 */
export function promotionsForProduct(
  promotions: Promotion[],
  product: { id: string; sellerId: string; brandId: string; categoryPath: string[] },
  now: Date,
): Promotion[] {
  return promotions
    .filter((promotion) => isLive(promotion, now))
    .filter((promotion) =>
      lineMatches(promotion, {
        refId: product.id,
        productId: product.id,
        sellerId: product.sellerId,
        brandId: product.brandId,
        categoryPath: product.categoryPath,
        quantity: 1,
        unitSellingPrice: 0,
        lineSubtotal: 0,
      }),
    )
    .sort((a, b) => b.priority - a.priority);
}
