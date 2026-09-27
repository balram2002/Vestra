import { PAYMENT_METHOD_LABEL, type PaymentMethod, type PromotionType, type PromotionValueKind } from './enums';
import type { BuyXGetYRule } from './types';

/**
 * A promotion, said in words -- and how it collides with others.
 *
 * `valueKind` decides whether `value` is a percentage or paise. Never the
 * type: FLASH_SALE, BANK_OFFER and SELLER_OFFER name a campaign and say
 * nothing about the number (see AGENTS.md). Every sentence here reads the
 * kind, never guesses it.
 */

export const PROMOTION_TYPE_LABEL: Record<PromotionType, string> = {
  PERCENT_DISCOUNT: 'Percentage sale',
  FLAT_DISCOUNT: 'Flat discount',
  FLASH_SALE: 'Flash sale',
  CATEGORY_OFFER: 'Category offer',
  FESTIVAL_CAMPAIGN: 'Festival campaign',
  BANK_OFFER: 'Bank offer',
  SELLER_OFFER: 'Store offer',
  BUY_X_GET_Y: 'Buy X, get Y',
};

export interface PromotionRuleInput {
  type: PromotionType;
  valueKind: PromotionValueKind;
  /** Percent when PERCENT, paise when AMOUNT. */
  value: number;
  maxDiscount: number | null;
  minOrderValue: number;
  buyXGetY: BuyXGetYRule | null;
  paymentMethods: PaymentMethod[];
  bankName: string | null;
  /** Display names of everything it is limited to; empty means everything. */
  targetNames: string[];
  stockLimit: number | null;
}

type Money = (paise: number) => string;

export function promotionHeadline(rule: PromotionRuleInput, money: Money): string {
  if (rule.type === 'BUY_X_GET_Y' && rule.buyXGetY) {
    const { buyQuantity, getQuantity, discountPercent } = rule.buyXGetY;
    return discountPercent >= 100
      ? `Buy ${buyQuantity}, get ${getQuantity} free`
      : `Buy ${buyQuantity}, get ${getQuantity} at ${discountPercent}% off`;
  }
  if (rule.valueKind === 'PERCENT') {
    return `${rule.value}% off${rule.maxDiscount ? `, up to ${money(rule.maxDiscount)}` : ''}`;
  }
  return `${money(rule.value)} off`;
}

export function describePromotion(rule: PromotionRuleInput, money: Money): string {
  const parts = [promotionHeadline(rule, money)];
  if (rule.targetNames.length > 0) {
    const names = rule.targetNames.length <= 2
      ? rule.targetNames.join(' and ')
      : `${rule.targetNames.slice(0, 2).join(', ')} and ${rule.targetNames.length - 2} more`;
    parts.push(`on ${names}`);
  } else {
    parts.push('on everything');
  }
  if (rule.minOrderValue > 0) parts.push(`when those items total ${money(rule.minOrderValue)}+`);
  if (rule.paymentMethods.length > 0) {
    const methods = rule.paymentMethods.map((method) => PAYMENT_METHOD_LABEL[method]).join(' or ');
    parts.push(rule.bankName ? `with ${rule.bankName} ${methods}` : `with ${methods}`);
  }
  if (rule.stockLimit !== null) parts.push(`first ${rule.stockLimit.toLocaleString('en-IN')} units`);
  return parts.join(' · ');
}

/* --------------------------------------------------------------- overlaps */

export interface OverlapCandidate {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  priority: number;
  valueKind: PromotionValueKind;
  value: number;
  type: PromotionType;
  categoryIds: string[];
  brandIds: string[];
  sellerIds: string[];
  productIds: string[];
  paymentMethods: PaymentMethod[];
}

export interface Overlap {
  other: { id: string; title: string };
  /** Why they collide, in words: "both cover everything", "both include Nike". */
  reason: string;
  /** Who wins where both apply, as far as can be said without a real bag. */
  outcome: string;
}

function targeted(candidate: OverlapCandidate): boolean {
  return (
    candidate.categoryIds.length + candidate.brandIds.length + candidate.sellerIds.length + candidate.productIds.length > 0
  );
}

function shared(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((value) => set.has(value));
}

/**
 * Does `b` run at the same time as `a`, on at least some of the same items?
 *
 * Conservative on purpose: a category and a brand may well meet in real
 * products, but that cannot be known from the two lists alone, so only a
 * shared list entry -- or either one covering everything -- counts. A payment
 * restriction on only one side still overlaps; on both sides it overlaps only
 * if a method is shared.
 */
export function findOverlap(
  a: OverlapCandidate,
  b: OverlapCandidate,
  names: (id: string) => string,
): Overlap | null {
  if (a.id === b.id) return null;
  if (Date.parse(a.startsAt) > Date.parse(b.endsAt) || Date.parse(b.startsAt) > Date.parse(a.endsAt)) return null;
  if (a.paymentMethods.length > 0 && b.paymentMethods.length > 0 && shared(a.paymentMethods, b.paymentMethods).length === 0) {
    return null;
  }

  let reason: string | null = null;
  if (!targeted(a) && !targeted(b)) reason = 'Both cover everything in the shop.';
  else if (!targeted(a)) reason = `This covers everything, including all of “${b.title}”.`;
  else if (!targeted(b)) reason = `“${b.title}” covers everything, including all of this.`;
  else {
    const common = [
      ...shared(a.categoryIds, b.categoryIds),
      ...shared(a.brandIds, b.brandIds),
      ...shared(a.sellerIds, b.sellerIds),
      ...shared(a.productIds, b.productIds),
    ];
    if (common.length > 0) {
      reason = `Both include ${common.slice(0, 2).map(names).join(' and ')}${common.length > 2 ? ` and ${common.length - 2} more` : ''}.`;
    }
  }
  if (!reason) return null;

  return { other: { id: b.id, title: b.title }, reason, outcome: whoWins(a, b) };
}

function whoWins(a: OverlapCandidate, b: OverlapCandidate): string {
  const rule = 'Where both apply, each item gets whichever takes more off';
  if (a.type !== 'BUY_X_GET_Y' && b.type !== 'BUY_X_GET_Y' && a.valueKind === b.valueKind) {
    if (a.value > b.value) return `${rule}: usually this one (it is larger).`;
    if (b.value > a.value) return `${rule}: usually “${b.title}” (it is larger).`;
    if (a.priority !== b.priority) {
      return `${rule}. They are equal, so the higher priority wins: ${a.priority > b.priority ? 'this one' : `“${b.title}”`}.`;
    }
    return `${rule}. They are equal with equal priority, so which applies is not defined — give one a higher priority.`;
  }
  return `${rule}; on a tie the higher priority wins (${a.priority} here, ${b.priority} there).`;
}

export function paymentSummary(methods: PaymentMethod[], bankName: string | null): string | null {
  if (methods.length === 0) return null;
  const list = methods.map((method) => PAYMENT_METHOD_LABEL[method]).join(' or ');
  return bankName ? `${bankName} · ${list}` : list;
}
