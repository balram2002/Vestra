'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { COUPON_CODE_PATTERN, couponTerms } from '@/domain/coupon-rules';
import { PAYMENT_METHODS } from '@/domain/enums';
import type { Coupon } from '@/domain/types';
import { formatMoney } from '@/lib/format';
import { entityId } from '@/lib/ids';
import { toPaise } from '@/lib/money';

import { requirePermission } from '../auth/session';
import { collections, toDoc, toEntity } from '../db/collections';
import * as audit from '../services/audit';
import { invalidate } from '../services/cache-invalidation';
import { tags } from '../services/cache-tags';
import { couponTargetOptions, ruleInput } from '../services/coupons-admin';

/**
 * Creating and editing coupons.
 *
 * ONE SAVE for create and edit, because the rules are the same and two paths
 * are two chances for them to drift. What differs on edit is guarded here:
 *
 *   - the CODE is fixed once anyone has used it. Shoppers have it on a poster
 *     or in a message; renaming it breaks every copy in the wild.
 *   - redemptions already made keep the discount they got. Orders freeze their
 *     own pricing, so editing the value changes only what happens next.
 *
 * Money arrives in rupees from the form and is stored in paise, converted
 * once, here, at the boundary.
 */

export interface CouponResult {
  ok: boolean;
  error?: string;
  field?: string;
  id?: string;
}

const fail = (field: string, error: string): CouponResult => ({ ok: false, error, field });

const schema = z.object({
  id: z.string().nullable(),
  code: z.string().trim().min(1, 'Give it a code.'),
  title: z.string().trim().min(4, 'Give it a title of at least 4 characters.').max(80),
  description: z.string().trim().max(240),
  type: z.enum(['PERCENTAGE', 'FIXED', 'FREE_SHIPPING']),
  /** Percent for PERCENTAGE, rupees for FIXED, ignored for FREE_SHIPPING. */
  value: z.number().min(0),
  /** Rupees. Only meaningful for a percentage, where it caps the discount. */
  maxDiscount: z.number().min(0).nullable(),
  minCartValue: z.number().min(0).max(1_000_000),
  audience: z.enum(['ALL', 'NEW_CUSTOMER', 'EXISTING_CUSTOMER']),
  scope: z.enum(['PLATFORM', 'CATEGORY', 'BRAND', 'SELLER']),
  targets: z.array(z.string().min(1)).max(200),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).max(PAYMENT_METHODS.length),
  totalUsageLimit: z.number().int().min(1, 'At least 1, or leave it blank.').max(10_000_000).nullable(),
  perUserLimit: z.number().int().min(1, 'At least once per customer.').max(100),
  startsAt: z.string(),
  endsAt: z.string(),
  visible: z.boolean(),
  stackableWithOffers: z.boolean(),
  fundedBy: z.enum(['PLATFORM', 'SELLER']),
});

export type CouponInput = z.infer<typeof schema>;

export async function saveCoupon(input: CouponInput): Promise<CouponResult> {
  const actor = await requirePermission('coupon:write');

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? 'Check the form.', field: issue?.path[0]?.toString() };
  }
  const data = parsed.data;

  // The bag uppercases what a shopper types, so the stored code is upper too.
  const code = data.code.toUpperCase().replace(/\s+/g, '');
  if (!COUPON_CODE_PATTERN.test(code)) return fail('code', 'Codes are 4 to 20 letters or digits, with no spaces.');

  if (data.type === 'PERCENTAGE' && (data.value < 1 || data.value > 90)) {
    return fail('value', 'A percentage coupon takes between 1% and 90% off.');
  }
  if (data.type === 'FIXED') {
    if (data.value < 1) return fail('value', 'Enter the amount to take off.');
    if (data.minCartValue <= data.value) {
      return fail('minCartValue', 'Set a minimum above the discount, or an order could come out free.');
    }
  }
  if (data.scope !== 'PLATFORM' && data.targets.length === 0) {
    return fail('targets', 'Pick at least one, or make it apply to everything.');
  }

  const starts = Date.parse(data.startsAt);
  const ends = Date.parse(data.endsAt);
  if (Number.isNaN(starts)) return fail('startsAt', 'Pick a start date.');
  if (Number.isNaN(ends)) return fail('endsAt', 'Pick an end date.');
  if (ends <= starts) return fail('endsAt', 'The end must be after the start.');
  if (ends <= Date.now()) return fail('endsAt', 'That end date has already passed.');

  const coupons = await collections.coupons();
  const existing = data.id ? toEntity(await coupons.findOne({ _id: data.id })) : null;
  if (data.id && !existing) return { ok: false, error: 'That coupon no longer exists.' };

  if (existing && existing.usedCount > 0 && existing.code !== code) {
    return fail('code', `${existing.code} has been used ${existing.usedCount} times, so its code can no longer change.`);
  }
  const clash = await coupons.findOne({ code, _id: { $ne: existing?.id ?? '' } });
  if (clash) return fail('code', `${code} is already taken.`);

  const targets = await couponTargetOptions();
  const pick = (scope: CouponInput['scope']) => (data.scope === scope ? data.targets : []);
  const valid = {
    CATEGORY: new Set(targets.categories.map((option) => option.value)),
    BRAND: new Set(targets.brands.map((option) => option.value)),
    SELLER: new Set(targets.sellers.map((option) => option.value)),
  };
  if (data.scope !== 'PLATFORM' && data.targets.some((target) => !valid[data.scope as keyof typeof valid].has(target))) {
    return fail('targets', 'One of those no longer exists. Pick again.');
  }

  const maxDiscount = data.type === 'PERCENTAGE' && data.maxDiscount ? toPaise(data.maxDiscount) : null;
  const minCartValue = toPaise(data.minCartValue);
  const value = data.type === 'PERCENTAGE' ? Math.round(data.value) : data.type === 'FIXED' ? toPaise(data.value) : 0;
  const now = new Date().toISOString();

  const rules: Omit<Coupon, 'id' | 'usedCount' | 'createdByUserId' | 'createdAt' | 'isActive' | 'termsAndConditions'> = {
    code,
    title: data.title,
    description: data.description || data.title,
    type: data.type,
    scope: data.scope,
    value,
    maxDiscount,
    minCartValue,
    categoryIds: pick('CATEGORY'),
    brandIds: pick('BRAND'),
    sellerIds: pick('SELLER'),
    productIds: [],
    excludedProductIds: existing?.excludedProductIds ?? [],
    audience: data.audience,
    segmentKey: null,
    paymentMethods: data.paymentMethods,
    totalUsageLimit: data.totalUsageLimit,
    perUserLimit: data.perUserLimit,
    startsAt: new Date(starts).toISOString(),
    endsAt: new Date(ends).toISOString(),
    stackableWithOffers: data.stackableWithOffers,
    fundedBy: data.fundedBy,
    visible: data.visible,
    archivedAt: existing?.archivedAt ?? null,
    updatedAt: now,
    buyXGetY: null,
  };

  const names = data.targets.map(
    (target) =>
      [...targets.categories, ...targets.brands, ...targets.sellers]
        .find((option) => option.value === target)
        ?.label.replace(/^(— )+/, '') ?? target,
  );
  const termsAndConditions = couponTerms(
    ruleInput({ ...(rules as Coupon), usedCount: 0 }, names),
    formatMoney,
  );

  let id = existing?.id;
  try {
    if (existing) {
      await coupons.updateOne({ _id: existing.id }, { $set: { ...rules, termsAndConditions } });
    } else {
      id = entityId('cpn');
      const coupon: Coupon = {
        ...rules,
        id,
        usedCount: 0,
        isActive: true,
        termsAndConditions,
        createdByUserId: actor.id,
        createdAt: now,
      };
      await coupons.insertOne(toDoc(coupon));
    }
  } catch (error) {
    // The unique index is the real guard; the lookup above only makes the
    // common case readable. Two admins racing for one code land here.
    if ((error as { code?: number }).code === 11000) return fail('code', `${code} is already taken.`);
    throw error;
  }

  invalidate([tags.coupons]);
  await audit.record({
    actor,
    action: existing ? 'coupon.update' : 'coupon.create',
    entityType: 'coupon',
    entityId: id!,
    entityLabel: code,
    changes: existing
      ? audit.diff(existing, rules, ['title', 'type', 'value', 'maxDiscount', 'minCartValue', 'scope', 'audience', 'startsAt', 'endsAt', 'totalUsageLimit', 'perUserLimit'])
      : [],
    severity: 'NOTICE',
  });

  revalidatePath('/admin/coupons');
  revalidatePath('/admin/marketing');
  if (id) revalidatePath(`/admin/coupons/${id}`);
  return { ok: true, id };
}

/**
 * Archive: out of the list and switched off, but kept -- orders and
 * redemptions refer to it, and its numbers are still worth reading.
 */
export async function setCouponArchived(input: { couponId: string; archived: boolean }): Promise<CouponResult> {
  const actor = await requirePermission('coupon:write');
  const coupons = await collections.coupons();
  const coupon = toEntity(await coupons.findOne({ _id: input.couponId }));
  if (!coupon) return { ok: false, error: 'Coupon not found.' };

  const now = new Date().toISOString();
  // Restoring does not switch it back on: coming back from the archive is a
  // separate decision from going live again.
  const patch = input.archived
    ? { archivedAt: now, isActive: false, updatedAt: now }
    : { archivedAt: null, updatedAt: now };
  await coupons.updateOne({ _id: coupon.id }, { $set: patch });
  invalidate([tags.coupons]);

  await audit.record({
    actor,
    action: input.archived ? 'coupon.archive' : 'coupon.restore',
    entityType: 'coupon',
    entityId: coupon.id,
    entityLabel: coupon.code,
    severity: 'NOTICE',
  });

  revalidatePath('/admin/coupons');
  revalidatePath(`/admin/coupons/${coupon.id}`);
  return { ok: true, id: coupon.id };
}
