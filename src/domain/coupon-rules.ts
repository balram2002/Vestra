import { PAYMENT_METHOD_LABEL, type AudienceType, type CouponScope, type CouponType, type PaymentMethod } from './enums';

/**
 * A coupon, said in words.
 *
 * The list, the editor's live preview and the small print in the bag all
 * describe the SAME rules, so they are written from the rules here rather than
 * typed three times. A threshold that reads ₹1,499 in the admin list and
 * ₹999 in the bag is the kind of mistake this module exists to make
 * impossible.
 *
 * Money is integer paise throughout; formatting is passed in so this module
 * stays free of locale code and runs anywhere.
 */

export const COUPON_CODE_PATTERN = /^[A-Z0-9]{4,20}$/;

export interface CouponRuleInput {
  type: CouponType;
  /** Percent for PERCENTAGE, paise for FIXED. */
  value: number;
  maxDiscount: number | null;
  minCartValue: number;
  audience: AudienceType;
  scope: CouponScope;
  /** Display names of the scope's targets, in the order chosen. */
  targetNames: string[];
  paymentMethods: PaymentMethod[];
  totalUsageLimit: number | null;
  perUserLimit: number;
}

type Money = (paise: number) => string;

export const COUPON_TYPE_LABEL: Record<CouponType, string> = {
  PERCENTAGE: 'Percent off',
  FIXED: 'Amount off',
  FREE_SHIPPING: 'Free delivery',
  BUY_X_GET_Y: 'Buy X get Y',
};

export const COUPON_SCOPE_LABEL: Record<CouponScope, string> = {
  PLATFORM: 'Everything',
  CATEGORY: 'Categories',
  BRAND: 'Brands',
  SELLER: 'Stores',
  PRODUCT: 'Products',
};

export const AUDIENCE_LABEL: Record<AudienceType, string> = {
  ALL: 'Everyone',
  NEW_CUSTOMER: 'First order only',
  EXISTING_CUSTOMER: 'Returning customers',
  SEGMENT: 'A customer segment',
};

/** The headline: "20% off, up to ₹300". */
export function couponHeadline(rule: Pick<CouponRuleInput, 'type' | 'value' | 'maxDiscount'>, money: Money): string {
  switch (rule.type) {
    case 'PERCENTAGE':
      return `${rule.value}% off${rule.maxDiscount ? `, up to ${money(rule.maxDiscount)}` : ''}`;
    case 'FIXED':
      return `${money(rule.value)} off`;
    case 'FREE_SHIPPING':
      return 'Free delivery';
    case 'BUY_X_GET_Y':
      return 'Buy more, get more';
  }
}

function list(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/** Where it applies, or null when it applies to everything. */
export function couponWhere(rule: Pick<CouponRuleInput, 'scope' | 'targetNames'>): string | null {
  if (rule.scope === 'PLATFORM' || rule.targetNames.length === 0) return null;
  const noun = { CATEGORY: 'in', BRAND: 'from', SELLER: 'from', PRODUCT: 'on' }[rule.scope];
  return `${noun} ${list(rule.targetNames)}`;
}

/** One sentence for the admin list: "20% off, up to ₹300 · orders above ₹1,499 · first order only". */
export function describeCoupon(rule: CouponRuleInput, money: Money): string {
  const parts = [couponHeadline(rule, money)];
  const where = couponWhere(rule);
  if (where) parts.push(where);
  if (rule.minCartValue > 0) parts.push(`orders above ${money(rule.minCartValue)}`);
  if (rule.audience !== 'ALL') parts.push(AUDIENCE_LABEL[rule.audience].toLowerCase());
  if (rule.paymentMethods.length > 0) {
    parts.push(`with ${rule.paymentMethods.map((method) => PAYMENT_METHOD_LABEL[method]).join(' or ')}`);
  }
  return parts.join(' · ');
}

/** The small print, written from the rules so it can never disagree with them. */
export function couponTerms(rule: CouponRuleInput, money: Money): string[] {
  const terms: string[] = [];
  if (rule.audience === 'NEW_CUSTOMER') terms.push('Valid on your first order only.');
  if (rule.audience === 'EXISTING_CUSTOMER') terms.push('Valid for customers who have ordered before.');
  const where = couponWhere(rule);
  if (where) terms.push(`Applies only to items ${where}.`);
  if (rule.minCartValue > 0) {
    terms.push(`Minimum order value ${money(rule.minCartValue)} after other discounts.`);
  }
  if (rule.type === 'PERCENTAGE' && rule.maxDiscount) terms.push(`Maximum discount ${money(rule.maxDiscount)}.`);
  if (rule.paymentMethods.length > 0) {
    terms.push(`Only when paying with ${rule.paymentMethods.map((method) => PAYMENT_METHOD_LABEL[method]).join(' or ')}.`);
  }
  terms.push(
    rule.perUserLimit === 1 ? 'One use per account.' : `Up to ${rule.perUserLimit} uses per account.`,
  );
  terms.push('Cannot be combined with another coupon.');
  return terms;
}

/**
 * What an example bag saves, for the preview: the discount this coupon would
 * give on `cart` paise of eligible items. Mirrors the evaluator's arithmetic
 * for the common kinds; the evaluator remains the authority at checkout.
 */
export function exampleSaving(rule: Pick<CouponRuleInput, 'type' | 'value' | 'maxDiscount' | 'minCartValue'>, cart: number): number | null {
  if (cart < rule.minCartValue) return null;
  switch (rule.type) {
    case 'PERCENTAGE': {
      const raw = Math.round((cart * rule.value) / 100);
      return rule.maxDiscount ? Math.min(raw, rule.maxDiscount) : raw;
    }
    case 'FIXED':
      return Math.min(rule.value, cart);
    default:
      return null;
  }
}

/** A readable, unambiguous code: no 0/O or 1/I to misread off a poster. */
export function suggestCode(seed: string, random: () => number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const stem = seed.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'VESTRA';
  let tail = '';
  for (let index = 0; index < 4; index += 1) tail += alphabet[Math.floor(random() * alphabet.length)];
  return `${stem}${tail}`.slice(0, 20);
}
