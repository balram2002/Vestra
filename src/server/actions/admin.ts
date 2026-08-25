'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { PRODUCT_STATUS_META, SELLER_STATUS_META } from '@/domain/enums';

import { requirePermission } from '../auth/session';
import {
  getSettlement,
  holdSettlement,
  markSettlementPaid,
  runSettlement,
} from '../services/settlements';
import { collections, toEntity } from '../db/collections';
import * as audit from '../services/audit';
import { notifyQuietly } from '../services/notifications';

/**
 * Admin write actions.
 *
 * Three rules every action here follows, and the reason each exists:
 *
 *  1. PERMISSION FIRST, from the session. `requirePermission` runs before any
 *     read, so an unauthorised caller never even learns whether the record
 *     exists.
 *  2. EVERY MUTATION IS AUDITED, with the field-level diff. These are exactly
 *     the actions someone will later need to answer for — who approved this
 *     listing, who suspended this store — and an unlogged approval is
 *     indistinguishable from one that never happened.
 *  3. THE AFFECTED PARTY IS TOLD. A seller whose listing was rejected finds out
 *     from a notification, not by noticing it missing.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/* --------------------------------------------------------------- catalogue */

const reviewSchema = z.object({
  productId: z.string().min(1),
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().max(400).optional(),
});

export async function reviewProduct(input: {
  productId: string;
  decision: 'APPROVE' | 'REJECT';
  reason?: string;
}): Promise<ActionResult> {
  const actor = await requirePermission('catalog:approve');

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That is not a valid decision.' };

  if (parsed.data.decision === 'REJECT' && (parsed.data.reason ?? '').trim().length < 8) {
    // The seller reads this. "Rejected" with no reason is an unactionable
    // message that becomes a support ticket.
    return { ok: false, error: 'Give the seller a reason they can act on.' };
  }

  const products = await collections.products();
  const product = toEntity(await products.findOne({ _id: parsed.data.productId }));
  if (!product) return { ok: false, error: 'Product not found.' };

  if (!['SUBMITTED', 'PENDING_REVIEW'].includes(product.status)) {
    return {
      ok: false,
      error: `This listing is ${PRODUCT_STATUS_META[product.status].label.toLowerCase()}, not awaiting review.`,
    };
  }

  const iso = new Date().toISOString();
  const approved = parsed.data.decision === 'APPROVE';

  const patch = approved
    ? {
        status: 'PUBLISHED' as const,
        approvedAt: iso,
        approvedByUserId: actor.id,
        publishedAt: iso,
        rejectionReason: null,
        updatedAt: iso,
      }
    : {
        status: 'REJECTED' as const,
        rejectionReason: parsed.data.reason!.trim(),
        updatedAt: iso,
      };

  await products.updateOne({ _id: product.id }, { $set: patch });

  await audit.record({
    actor,
    action: approved ? 'catalog.approve' : 'catalog.reject',
    entityType: 'product',
    entityId: product.id,
    entityLabel: product.title,
    changes: audit.diff(product, patch, ['status', 'rejectionReason']),
    note: parsed.data.reason ?? null,
    severity: approved ? 'INFO' : 'NOTICE',
  });

  // The seller owner, not the seller record, is who receives this.
  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: product.sellerId }));
  if (seller) {
    notifyQuietly({
      userId: seller.ownerUserId,
      category: 'CATALOG',
      title: approved ? `"${product.title}" is live` : `"${product.title}" was not approved`,
      body: approved
        ? 'Your listing passed review and is now visible to shoppers.'
        : parsed.data.reason!.trim(),
      href: '/seller/products',
      entityType: 'product',
      entityId: product.id,
    });
  }

  revalidatePath('/admin/products');
  revalidatePath('/seller/products');
  return { ok: true };
}

/* ----------------------------------------------------------------- sellers */

const sellerStatusSchema = z.object({
  sellerId: z.string().min(1),
  status: z.enum(['ACTIVE', 'ON_HOLD', 'SUSPENDED', 'APPROVED', 'REJECTED']),
  reason: z.string().max(400).optional(),
});

/**
 * Change a store's standing.
 *
 * Suspension is the most consequential action in the console — it takes a
 * business offline — so it requires a reason, is logged as CRITICAL, and needs
 * `seller:suspend` rather than the broader `seller:write`.
 */
export async function setSellerStatus(input: {
  sellerId: string;
  status: 'ACTIVE' | 'ON_HOLD' | 'SUSPENDED' | 'APPROVED' | 'REJECTED';
  reason?: string;
}): Promise<ActionResult> {
  const parsed = sellerStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That is not a valid status.' };

  const restricting = parsed.data.status === 'SUSPENDED' || parsed.data.status === 'ON_HOLD';
  const actor = await requirePermission(restricting ? 'seller:suspend' : 'seller:approve');

  if (restricting && (parsed.data.reason ?? '').trim().length < 8) {
    return { ok: false, error: 'Suspending a store requires a reason.' };
  }

  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: parsed.data.sellerId }));
  if (!seller) return { ok: false, error: 'Store not found.' };
  if (seller.status === parsed.data.status) {
    return { ok: false, error: 'That store is already in this state.' };
  }

  const iso = new Date().toISOString();
  const patch = {
    status: parsed.data.status,
    updatedAt: iso,
    ...(parsed.data.status === 'APPROVED' || parsed.data.status === 'ACTIVE'
      ? { approvedAt: seller.approvedAt ?? iso }
      : {}),
  };

  await sellers.updateOne({ _id: seller.id }, { $set: patch });

  await audit.record({
    actor,
    action: `seller.${parsed.data.status.toLowerCase()}`,
    entityType: 'seller',
    entityId: seller.id,
    entityLabel: seller.displayName,
    changes: audit.diff(seller, patch, ['status']),
    note: parsed.data.reason ?? null,
    severity: restricting ? 'CRITICAL' : 'NOTICE',
  });

  notifyQuietly({
    userId: seller.ownerUserId,
    category: 'ACCOUNT',
    title: `Your store is now ${SELLER_STATUS_META[parsed.data.status].label.toLowerCase()}`,
    body: parsed.data.reason?.trim() || SELLER_STATUS_META[parsed.data.status].description,
    href: '/seller/settings',
    entityType: 'seller',
    entityId: seller.id,
  });

  revalidatePath('/admin/sellers');
  return { ok: true };
}

/* ------------------------------------------------------------------- users */

export async function setUserStatus(input: {
  userId: string;
  status: 'ACTIVE' | 'SUSPENDED';
  reason?: string;
}): Promise<ActionResult> {
  const actor = await requirePermission('user:suspend');

  const schema = z.object({
    userId: z.string().min(1),
    status: z.enum(['ACTIVE', 'SUSPENDED']),
    reason: z.string().max(400).optional(),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That is not a valid status.' };

  // Suspending yourself locks you out of the console that would undo it.
  if (parsed.data.userId === actor.id) {
    return { ok: false, error: 'You cannot change your own account status.' };
  }

  const users = await collections.users();
  const user = toEntity(await users.findOne({ _id: parsed.data.userId }));
  if (!user) return { ok: false, error: 'User not found.' };

  const patch = { status: parsed.data.status, updatedAt: new Date().toISOString() };
  await users.updateOne({ _id: user.id }, { $set: patch });

  await audit.record({
    actor,
    action: `user.${parsed.data.status.toLowerCase()}`,
    entityType: 'user',
    entityId: user.id,
    entityLabel: user.fullName,
    changes: audit.diff(user, patch, ['status']),
    note: parsed.data.reason ?? null,
    severity: parsed.data.status === 'SUSPENDED' ? 'CRITICAL' : 'NOTICE',
  });

  revalidatePath('/admin/users');
  return { ok: true };
}

/* ----------------------------------------------------------------- coupons */

export async function setCouponActive(input: {
  couponId: string;
  isActive: boolean;
}): Promise<ActionResult> {
  const actor = await requirePermission('coupon:write');

  const coupons = await collections.coupons();
  const coupon = toEntity(await coupons.findOne({ _id: input.couponId }));
  if (!coupon) return { ok: false, error: 'Coupon not found.' };

  const patch = { isActive: input.isActive, updatedAt: new Date().toISOString() };
  await coupons.updateOne({ _id: coupon.id }, { $set: patch });

  await audit.record({
    actor,
    action: input.isActive ? 'coupon.enable' : 'coupon.disable',
    entityType: 'coupon',
    entityId: coupon.id,
    entityLabel: coupon.code,
    changes: audit.diff(coupon, patch, ['isActive']),
    severity: 'NOTICE',
  });

  revalidatePath('/admin/coupons');
  return { ok: true };
}

/* -------------------------------------------------------------- homepage */

export async function setSectionActive(input: {
  sectionId: string;
  isActive: boolean;
}): Promise<ActionResult> {
  const actor = await requirePermission('cms:write');

  const sections = await collections.homeSections();
  const section = toEntity(await sections.findOne({ _id: input.sectionId }));
  if (!section) return { ok: false, error: 'Section not found.' };

  const patch = {
    isActive: input.isActive,
    updatedAt: new Date().toISOString(),
    updatedByUserId: actor.id,
  };
  await sections.updateOne({ _id: section.id }, { $set: patch });

  await audit.record({
    actor,
    action: input.isActive ? 'cms.section.show' : 'cms.section.hide',
    entityType: 'homeSection',
    entityId: section.id,
    entityLabel: section.title ?? section.kind,
    changes: audit.diff(section, patch, ['isActive']),
  });

  // The homepage caches its sections, so the change has to invalidate it or the
  // shop keeps rendering the old composition.
  revalidatePath('/admin/cms');
  revalidatePath('/');
  return { ok: true };
}

/* ------------------------------------------------------------- settlements */

/**
 * Run a payout for one seller.
 *
 * Gated on `finance:payout` rather than a general admin permission: this moves
 * money, and the roles that approve listings are not the roles that pay for
 * them. The run itself is idempotent — it claims the seller orders it settles,
 * so a double click produces an empty second run rather than a double payment.
 */
export async function runSellerSettlement(input: { sellerId: string }): Promise<ActionResult> {
  const actor = await requirePermission('finance:payout');

  const result = await runSettlement(input.sellerId);
  if (!result.ok) return { ok: false, error: result.error };

  const settlement = result.settlementId ? await getSettlement(result.settlementId) : null;

  await audit.record({
    actor,
    action: 'settlement.run',
    entityType: 'settlement',
    entityId: result.settlementId ?? input.sellerId,
    entityLabel: settlement?.settlementNumber ?? input.sellerId,
    changes: [
      { field: 'orderCount', before: null, after: result.orderCount ?? 0 },
      { field: 'netPayable', before: null, after: result.netPayable ?? 0 },
    ],
    severity: 'NOTICE',
  });

  revalidatePath('/admin/settlements');
  revalidatePath('/seller/settlements');
  return { ok: true };
}

/**
 * Record that the bank transfer went out.
 *
 * The UTR is required because it is what a seller quotes when the money has
 * not arrived; "marked paid" with no reference is unverifiable.
 */
export async function markSettlementTransferred(input: {
  settlementId: string;
  utr: string;
}): Promise<ActionResult> {
  const actor = await requirePermission('finance:payout');

  const before = await getSettlement(input.settlementId);
  if (!before) return { ok: false, error: 'Settlement not found.' };

  const result = await markSettlementPaid(input.settlementId, input.utr);
  if (!result.ok) return { ok: false, error: result.error };

  await audit.record({
    actor,
    action: 'settlement.paid',
    entityType: 'settlement',
    entityId: before.id,
    entityLabel: before.settlementNumber,
    changes: [
      { field: 'status', before: before.status, after: 'PAID' },
      { field: 'utr', before: before.utr, after: input.utr.trim() },
    ],
    severity: 'NOTICE',
  });

  revalidatePath('/admin/settlements');
  revalidatePath('/seller/settlements');
  return { ok: true };
}

export async function holdSettlementPayout(input: {
  settlementId: string;
  reason: string;
}): Promise<ActionResult> {
  const actor = await requirePermission('finance:payout');

  const before = await getSettlement(input.settlementId);
  if (!before) return { ok: false, error: 'Settlement not found.' };

  const result = await holdSettlement(input.settlementId, input.reason);
  if (!result.ok) return { ok: false, error: result.error };

  await audit.record({
    actor,
    action: 'settlement.hold',
    entityType: 'settlement',
    entityId: before.id,
    entityLabel: before.settlementNumber,
    changes: [{ field: 'status', before: before.status, after: 'ON_HOLD' }],
    note: input.reason,
    severity: 'WARNING',
  });

  revalidatePath('/admin/settlements');
  revalidatePath('/seller/settlements');
  return { ok: true };
}
