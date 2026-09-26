'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { PAYMENT_METHODS } from '@/domain/enums';
import type { Promotion } from '@/domain/types';
import { entityId } from '@/lib/ids';
import { toPaise } from '@/lib/money';
import { slugify } from '@/lib/slug';

import { requirePermission } from '../auth/session';
import { collections, toDoc, toEntity } from '../db/collections';
import * as audit from '../services/audit';
import { invalidate } from '../services/cache-invalidation';
import { tags } from '../services/cache-tags';
import { couponTargetOptions } from '../services/coupons-admin';

/**
 * Creating and editing automatic offers.
 *
 * A NEW PROMOTION IS SAVED PAUSED. It needs no code, so the moment it is on
 * it changes what every matching shopper pays on their next page view; a
 * typo in the value would reprice the shop. It is saved, checked in the list
 * and the calendar, and switched on with the audited toggle.
 *
 * `valueKind` says what `value` means -- percent or rupees -- and is always
 * explicit. Where the type DOES imply one (a percentage sale, a flat
 * discount), the two must agree.
 */

export interface PromotionResult {
  ok: boolean;
  error?: string;
  field?: string;
  id?: string;
}

const fail = (field: string, error: string): PromotionResult => ({ ok: false, error, field });

const schema = z.object({
  id: z.string().nullable(),
  title: z.string().trim().min(4, 'Give it a title of at least 4 characters.').max(80),
  description: z.string().trim().min(8, 'Say what the offer is in a sentence.').max(240),
  badgeText: z.string().trim().max(24),
  type: z.enum([
    'PERCENT_DISCOUNT',
    'FLAT_DISCOUNT',
    'FLASH_SALE',
    'CATEGORY_OFFER',
    'FESTIVAL_CAMPAIGN',
    'BANK_OFFER',
    'SELLER_OFFER',
    'BUY_X_GET_Y',
  ]),
  valueKind: z.enum(['PERCENT', 'AMOUNT']),
  /** Percent, or rupees when valueKind is AMOUNT. Ignored for buy X get Y. */
  value: z.number().min(0),
  /** Rupees. Caps a percentage; ignored for an amount. */
  maxDiscount: z.number().min(0).nullable(),
  minOrderValue: z.number().min(0).max(1_000_000),
  buyQuantity: z.number().int().min(1).max(10),
  getQuantity: z.number().int().min(1).max(10),
  bxgyPercent: z.number().int().min(1).max(100),
  applyTo: z.enum(['CHEAPEST', 'MOST_EXPENSIVE']),
  categoryIds: z.array(z.string().min(1)).max(200),
  brandIds: z.array(z.string().min(1)).max(200),
  sellerIds: z.array(z.string().min(1)).max(200),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).max(PAYMENT_METHODS.length),
  bankName: z.string().trim().max(40),
  priority: z.number().int().min(0).max(100),
  /** Units at the promo price; null means unlimited. Flash sales only. */
  stockLimit: z.number().int().min(1, 'At least 1, or leave it blank.').max(1_000_000).nullable(),
  fundedBy: z.enum(['PLATFORM', 'SELLER']),
  startsAt: z.string(),
  endsAt: z.string(),
});

export type PromotionInput = z.infer<typeof schema>;

export async function savePromotion(input: PromotionInput): Promise<PromotionResult> {
  const actor = await requirePermission('promotion:write');

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? 'Check the form.', field: issue?.path[0]?.toString() };
  }
  const data = parsed.data;
  const bxgy = data.type === 'BUY_X_GET_Y';

  if (!bxgy) {
    if (data.type === 'PERCENT_DISCOUNT' && data.valueKind !== 'PERCENT') {
      return fail('value', 'A percentage sale must take a percentage off.');
    }
    if (data.type === 'FLAT_DISCOUNT' && data.valueKind !== 'AMOUNT') {
      return fail('value', 'A flat discount must take an amount off.');
    }
    if (data.valueKind === 'PERCENT' && (data.value < 1 || data.value > 80)) {
      return fail('value', 'An automatic offer takes between 1% and 80% off.');
    }
    if (data.valueKind === 'AMOUNT') {
      if (data.value < 1) return fail('value', 'Enter the amount to take off.');
      if (data.minOrderValue <= data.value) {
        return fail('minOrderValue', 'Set a minimum above the discount, or a cheap item could come out free.');
      }
    }
  }
  if (data.type === 'CATEGORY_OFFER' && data.categoryIds.length === 0) {
    return fail('categoryIds', 'A category offer needs at least one category.');
  }
  if (data.type === 'SELLER_OFFER' && data.sellerIds.length === 0) {
    return fail('sellerIds', 'A store offer needs at least one store.');
  }
  if (data.type === 'BANK_OFFER') {
    if (data.paymentMethods.length === 0) return fail('paymentMethods', 'A bank offer needs a way to pay.');
    if (!data.bankName) return fail('bankName', 'Name the bank, so the offer can say which cards.');
  }

  const starts = Date.parse(data.startsAt);
  const ends = Date.parse(data.endsAt);
  if (Number.isNaN(starts)) return fail('startsAt', 'Pick a start date.');
  if (Number.isNaN(ends)) return fail('endsAt', 'Pick an end date.');
  if (ends <= starts) return fail('endsAt', 'The end must be after the start.');
  if (ends <= Date.now()) return fail('endsAt', 'That end date has already passed.');

  const targets = await couponTargetOptions();
  const known = (values: string[], options: Array<{ value: string }>) => {
    const valid = new Set(options.map((option) => option.value));
    return values.every((value) => valid.has(value));
  };
  if (!known(data.categoryIds, targets.categories)) return fail('categoryIds', 'One of those categories no longer exists.');
  if (!known(data.brandIds, targets.brands)) return fail('brandIds', 'One of those brands no longer exists.');
  if (!known(data.sellerIds, targets.sellers)) return fail('sellerIds', 'One of those stores is no longer trading.');

  const promotions = await collections.promotions();
  const existing = data.id ? toEntity(await promotions.findOne({ _id: data.id })) : null;
  if (data.id && !existing) return { ok: false, error: 'That promotion no longer exists.' };

  const now = new Date().toISOString();
  const fields: Omit<Promotion, 'id' | 'slug' | 'isActive' | 'stockSold' | 'createdAt'> = {
    title: data.title,
    subtitle: existing?.subtitle ?? null,
    description: data.description,
    type: data.type,
    valueKind: bxgy ? 'PERCENT' : data.valueKind,
    value: bxgy ? 0 : data.valueKind === 'PERCENT' ? Math.round(data.value) : toPaise(data.value),
    maxDiscount: !bxgy && data.valueKind === 'PERCENT' && data.maxDiscount ? toPaise(data.maxDiscount) : null,
    minOrderValue: toPaise(data.minOrderValue),
    categoryIds: data.categoryIds,
    brandIds: data.brandIds,
    sellerIds: data.sellerIds,
    productIds: existing?.productIds ?? [],
    paymentMethods: data.paymentMethods,
    bankName: data.type === 'BANK_OFFER' ? data.bankName : null,
    startsAt: new Date(starts).toISOString(),
    endsAt: new Date(ends).toISOString(),
    priority: data.priority,
    fundedBy: data.fundedBy,
    bannerUrl: existing?.bannerUrl ?? null,
    badgeText: data.badgeText || null,
    buyXGetY: bxgy
      ? {
          buyQuantity: data.buyQuantity,
          getQuantity: data.getQuantity,
          discountPercent: data.bxgyPercent,
          applyTo: data.applyTo,
        }
      : null,
    stockLimit: data.type === 'FLASH_SALE' ? data.stockLimit : null,
    archivedAt: existing?.archivedAt ?? null,
    updatedAt: now,
  };

  let id = existing?.id;
  if (existing) {
    await promotions.updateOne({ _id: existing.id }, { $set: fields });
  } else {
    id = entityId('prm');
    let slug = slugify(data.title) || id.toLowerCase();
    if (await promotions.findOne({ slug })) slug = `${slug}-${id.slice(-6).toLowerCase()}`;
    const promotion: Promotion = { ...fields, id, slug, isActive: false, stockSold: 0, createdAt: now };
    await promotions.insertOne(toDoc(promotion));
  }

  invalidate([tags.promotions]);
  await audit.record({
    actor,
    action: existing ? 'promotion.update' : 'promotion.create',
    entityType: 'promotion',
    entityId: id!,
    entityLabel: data.title,
    changes: existing
      ? audit.diff(existing, fields, ['title', 'type', 'valueKind', 'value', 'maxDiscount', 'minOrderValue', 'priority', 'startsAt', 'endsAt', 'stockLimit'])
      : [],
    // Editing an offer that is already live changes prices for shoppers now.
    severity: existing?.isActive ? 'CRITICAL' : 'NOTICE',
  });

  revalidatePath('/admin/promotions');
  revalidatePath('/admin/marketing');
  if (id) revalidatePath(`/admin/promotions/${id}`);
  return { ok: true, id };
}

export async function setPromotionArchived(input: { promotionId: string; archived: boolean }): Promise<PromotionResult> {
  const actor = await requirePermission('promotion:write');
  const promotions = await collections.promotions();
  const promotion = toEntity(await promotions.findOne({ _id: input.promotionId }));
  if (!promotion) return { ok: false, error: 'Promotion not found.' };

  const now = new Date().toISOString();
  const patch = input.archived
    ? { archivedAt: now, isActive: false, updatedAt: now }
    : { archivedAt: null, updatedAt: now };
  await promotions.updateOne({ _id: promotion.id }, { $set: patch });
  invalidate([tags.promotions]);

  await audit.record({
    actor,
    action: input.archived ? 'promotion.archive' : 'promotion.restore',
    entityType: 'promotion',
    entityId: promotion.id,
    entityLabel: promotion.title,
    severity: 'NOTICE',
  });

  revalidatePath('/admin/promotions');
  revalidatePath(`/admin/promotions/${promotion.id}`);
  return { ok: true, id: promotion.id };
}
