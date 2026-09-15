'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { PRODUCT_STATUS_META, SELLER_STATUS_META } from '@/domain/enums';
import type { Banner, Brand, Category, Coupon, Promotion } from '@/domain/types';
import { formatMoney } from '@/lib/format';
import { entityId } from '@/lib/ids';
import { toPaise } from '@/lib/money';
import { slugify } from '@/lib/slug';

import { requirePermission } from '../auth/session';
import { issueManualRefund } from '../services/returns';
import {
  getSettlement,
  holdSettlement,
  markSettlementPaid,
  runSettlement,
} from '../services/settlements';
import { collections, toDoc, toEntities, toEntity } from '../db/collections';
import * as audit from '../services/audit';
import { invalidate } from '../services/cache-invalidation';
import { productTags, tags } from '../services/cache-tags';
import { notifyQuietly } from '../services/notifications';
import { MEDIA_VERSION } from '../seed/media';

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
  /** The form field the error belongs to, so a form can show it under that input. */
  field?: string;
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

  /*
   * Approval is what puts a listing in front of shoppers. Leaving it to a
   * cache to expire on its own clock means a seller is told they are live and
   * then cannot find themselves in the shop.
   */
  invalidate(productTags(product.id, 'status'));

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
  const rejecting = parsed.data.status === 'REJECTED';
  const actor = await requirePermission(restricting ? 'seller:suspend' : 'seller:approve');
  const reason = (parsed.data.reason ?? '').trim();

  if (restricting && reason.length < 8) {
    return { ok: false, error: 'Suspending a store requires a reason.' };
  }
  // The applicant reads this, and it is what tells them what to correct.
  if (rejecting && reason.length < 8) {
    return { ok: false, error: 'Say what the applicant needs to change. They will read it.' };
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

  const approving = parsed.data.status === 'ACTIVE' || parsed.data.status === 'APPROVED';
  await sellers.updateOne(
    { _id: seller.id },
    {
      $set: {
        ...patch,
        // The reason a rejected applicant sees on their status screen.
        ...(rejecting ? { 'kyc.rejectionReason': reason } : {}),
        ...(approving ? { 'kyc.rejectionReason': null } : {}),
      },
    },
  );

  /*
   * A suspended store's products stop being sellable, so the listings that
   * carry them have to be rebuilt, not just the store's own page.
   */
  invalidate([tags.seller(seller.slug), tags.sellerList, tags.productList]);

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

  const message = sellerStatusMessage(parsed.data.status, reason, seller);
  notifyQuietly({
    userId: seller.ownerUserId,
    category: 'ACCOUNT',
    title: message.title,
    body: message.body,
    href: message.href,
    entityType: 'seller',
    entityId: seller.id,
  });

  revalidatePath('/admin/sellers');
  revalidatePath(`/admin/sellers/${seller.id}`);
  return { ok: true };
}

/** What the store owner is told, in words that say what to do next. */
function sellerStatusMessage(
  status: 'ACTIVE' | 'ON_HOLD' | 'SUSPENDED' | 'APPROVED' | 'REJECTED',
  reason: string,
  seller: { displayName: string; approvedAt: string | null },
): { title: string; body: string; href: string } {
  if (status === 'ACTIVE' || status === 'APPROVED') {
    return seller.approvedAt
      ? {
          title: `${seller.displayName} is back on VestraWAB`,
          body: 'Your store is live again and your listings are back on sale.',
          href: '/seller',
        }
      : {
          title: `${seller.displayName} is approved`,
          body: 'Your seller console is open. Add your first products, and a pickup address before your first order ships.',
          href: '/seller',
        };
  }
  if (status === 'REJECTED') {
    return { title: 'Your seller application needs a change', body: reason, href: '/seller/onboarding' };
  }
  return {
    title: `Your store is now ${SELLER_STATUS_META[status].label.toLowerCase()}`,
    body: reason || SELLER_STATUS_META[status].description,
    href: '/seller/onboarding',
  };
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
  invalidate([tags.coupons]);

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
  invalidate([tags.content]);

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

/* ------------------------------------------------------------- promotions */

/**
 * Turn an automatic offer on or off.
 *
 * Promotions apply with no code typed, so switching one on changes what every
 * shopper pays immediately. That makes it a `promotion:write` action and an
 * audited one — "who put the 30% sale live" is a question that gets asked.
 */
export async function setPromotionActive(input: {
  promotionId: string;
  isActive: boolean;
}): Promise<ActionResult> {
  const actor = await requirePermission('promotion:write');

  const promotions = await collections.promotions();
  const promotion = toEntity(await promotions.findOne({ _id: input.promotionId }));
  if (!promotion) return { ok: false, error: 'Promotion not found.' };

  const patch = { isActive: input.isActive, updatedAt: new Date().toISOString() };
  await promotions.updateOne({ _id: promotion.id }, { $set: patch });
  // Promotions change displayed prices, so grids and their sorting move too.
  invalidate([tags.promotions, tags.productList]);

  await audit.record({
    actor,
    action: input.isActive ? 'promotion.enable' : 'promotion.disable',
    entityType: 'promotion',
    entityId: promotion.id,
    entityLabel: promotion.title,
    changes: audit.diff(promotion, patch, ['isActive']),
    severity: 'NOTICE',
  });

  revalidatePath('/admin/promotions');
  // The bag reads promotions live, so nothing else needs invalidating.
  return { ok: true };
}

/* ---------------------------------------------------------------- refunds */

/**
 * Refund an order by hand.
 *
 * For the cases the return flow cannot express — a parcel the courier lost, a
 * goodwill gesture, a duplicate charge. Gated on `order:refund` because it
 * moves money, and audited at CRITICAL because "who refunded this and why" is
 * the first question asked when the numbers are queried.
 */
export async function refundOrderManually(input: {
  orderId: string;
  /** Rupees from the console; converted to paise here. */
  amountRupees: number;
  reason: string;
}): Promise<ActionResult> {
  const actor = await requirePermission('order:refund');

  const schema = z.object({
    orderId: z.string().min(1),
    amountRupees: z.number().positive('Enter an amount greater than zero'),
    reason: z.string().trim().min(4, 'Give a reason for this refund'),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the details.' };
  }

  const result = await issueManualRefund({
    orderId: parsed.data.orderId,
    amount: toPaise(parsed.data.amountRupees),
    reason: parsed.data.reason,
    actorUserId: actor.id,
  });

  if (!result.ok) return { ok: false, error: result.error };

  const orders = await collections.orders();
  const order = toEntity(await orders.findOne({ _id: parsed.data.orderId }));

  await audit.record({
    actor,
    action: 'order.refund',
    entityType: 'order',
    entityId: parsed.data.orderId,
    entityLabel: order?.orderNumber ?? parsed.data.orderId,
    changes: [{ field: 'refundAmount', before: null, after: result.amount ?? 0 }],
    note: parsed.data.reason,
    severity: 'CRITICAL',
  });

  revalidatePath('/admin/refunds');
  revalidatePath(`/admin/orders/${order?.orderNumber ?? ''}`);
  return { ok: true };
}

/* ------------------------------------------------------------ create flows */

/*
 * Money arrives from these forms in RUPEES and is stored in paise. The
 * conversion happens here and nowhere else, so no client can send a paise
 * figure and have it taken a hundred times too large.
 */

function fail(field: string, error: string): ActionResult {
  return { ok: false, error, field };
}

function firstIssue(error: z.ZodError): ActionResult {
  const issue = error.issues[0];
  return {
    ok: false,
    error: issue?.message ?? 'Check the form and try again.',
    field: issue?.path[0] !== undefined ? String(issue.path[0]) : undefined,
  };
}

/** Parse a date the form sent, or report which field was wrong. */
function parseWindow(startsAt: string, endsAt: string): ActionResult | { starts: number; ends: number } {
  const starts = Date.parse(startsAt);
  const ends = Date.parse(endsAt);
  if (Number.isNaN(starts)) return fail('startsAt', 'Pick a start date.');
  if (Number.isNaN(ends)) return fail('endsAt', 'Pick an end date.');
  if (ends <= starts) return fail('endsAt', 'The end date must be after the start date.');
  if (ends <= Date.now()) return fail('endsAt', 'That end date has already passed.');
  return { starts, ends };
}

/* ------------------------------------------------------------------ coupon */

const createCouponSchema = z.object({
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
  /** null means unlimited. */
  totalUsageLimit: z.number().int().min(1, 'At least 1, or leave it blank.').max(10_000_000).nullable(),
  perUserLimit: z.number().int().min(1, 'At least once per customer.').max(100),
  startsAt: z.string(),
  endsAt: z.string(),
  visible: z.boolean(),
});

export type CreateCouponInput = z.infer<typeof createCouponSchema>;

/** The small print, written from the rules so it can never disagree with them. */
function couponTerms(coupon: {
  audience: Coupon['audience'];
  minCartValue: number;
  maxDiscount: number | null;
  perUserLimit: number;
}): string[] {
  const terms: string[] = [];
  if (coupon.audience === 'NEW_CUSTOMER') terms.push('Valid on your first order only.');
  if (coupon.audience === 'EXISTING_CUSTOMER') terms.push('Valid for customers who have ordered before.');
  if (coupon.minCartValue > 0) {
    terms.push(`Minimum order value ${formatMoney(coupon.minCartValue)} after other discounts.`);
  }
  if (coupon.maxDiscount) terms.push(`Maximum discount ${formatMoney(coupon.maxDiscount)}.`);
  terms.push(
    coupon.perUserLimit === 1 ? 'One use per account.' : `Up to ${coupon.perUserLimit} uses per account.`,
  );
  terms.push('Cannot be combined with another coupon.');
  return terms;
}

/**
 * Create a platform-wide coupon.
 *
 * It goes live on its start date with no further step: a code is inert until a
 * shopper types it, so unlike a promotion there is nothing to review first.
 * Scoped coupons (one brand, one seller) are not offered here yet; the scope is
 * PLATFORM and the checkout already honours that.
 */
export async function createCoupon(input: CreateCouponInput): Promise<ActionResult> {
  const actor = await requirePermission('coupon:write');

  const parsed = createCouponSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const data = parsed.data;

  // The bag uppercases what a shopper types, so the stored code must be upper too.
  const code = data.code.toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9]{4,20}$/.test(code)) {
    return fail('code', 'Codes are 4 to 20 letters or digits, with no spaces.');
  }

  if (data.type === 'PERCENTAGE' && (data.value < 1 || data.value > 90)) {
    return fail('value', 'A percentage coupon takes between 1% and 90% off.');
  }
  if (data.type === 'FIXED') {
    if (data.value < 1) return fail('value', 'Enter the amount to take off.');
    if (data.minCartValue <= data.value) {
      return fail('minCartValue', 'Set a minimum above the discount, or an order could come out free.');
    }
  }

  const window = parseWindow(data.startsAt, data.endsAt);
  if ('ok' in window) return window;

  const coupons = await collections.coupons();
  if (await coupons.findOne({ code })) return fail('code', `${code} is already taken.`);

  const maxDiscount =
    data.type === 'PERCENTAGE' && data.maxDiscount ? toPaise(data.maxDiscount) : null;
  const minCartValue = toPaise(data.minCartValue);
  const now = new Date().toISOString();

  const coupon: Coupon = {
    id: entityId('cpn'),
    code,
    title: data.title,
    description: data.description || data.title,
    type: data.type,
    scope: 'PLATFORM',
    value:
      data.type === 'PERCENTAGE'
        ? Math.round(data.value)
        : data.type === 'FIXED'
          ? toPaise(data.value)
          : 0,
    maxDiscount,
    minCartValue,
    categoryIds: [],
    brandIds: [],
    sellerIds: [],
    productIds: [],
    excludedProductIds: [],
    audience: data.audience,
    segmentKey: null,
    paymentMethods: [],
    totalUsageLimit: data.totalUsageLimit,
    perUserLimit: data.perUserLimit,
    usedCount: 0,
    startsAt: new Date(window.starts).toISOString(),
    endsAt: new Date(window.ends).toISOString(),
    isActive: true,
    stackableWithOffers: false,
    fundedBy: 'PLATFORM',
    visible: data.visible,
    termsAndConditions: couponTerms({
      audience: data.audience,
      minCartValue,
      maxDiscount,
      perUserLimit: data.perUserLimit,
    }),
    createdByUserId: actor.id,
    createdAt: now,
    updatedAt: now,
    buyXGetY: null,
  };

  try {
    await coupons.insertOne(toDoc(coupon));
  } catch (error) {
    // The unique index is the real guard; the lookup above only makes the
    // common case readable. Two admins racing for one code land here.
    if ((error as { code?: number }).code === 11000) return fail('code', `${code} is already taken.`);
    throw error;
  }

  invalidate([tags.coupons]);

  await audit.record({
    actor,
    action: 'coupon.create',
    entityType: 'coupon',
    entityId: coupon.id,
    entityLabel: code,
    severity: 'NOTICE',
  });

  revalidatePath('/admin/coupons');
  return { ok: true };
}

/* ---------------------------------------------------------------- category */

const GST_SLABS = [0, 5, 12, 18, 28];

const createCategorySchema = z.object({
  parentId: z.string().min(1, 'Choose where it sits in the tree.'),
  name: z.string().trim().min(2, 'Give it a name.').max(60),
  description: z.string().trim().max(300),
  /** null means inherit the parent's slab. */
  taxRatePercent: z.number().int().nullable(),
  /** null means inherit the parent's policy. */
  returnable: z.boolean().nullable(),
  featured: z.boolean(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

/**
 * Add a category under an existing one.
 *
 * Departments (Men, Women, Kids) are structural and are not created here: each
 * carries an attribute family that drives the facets and listing form, and a
 * new one is a catalogue project rather than a form. A child inherits its
 * family, size system and imagery from the parent, and its tax slab and return
 * policy unless the form overrides them.
 */
export async function createCategory(input: CreateCategoryInput): Promise<ActionResult> {
  const actor = await requirePermission('catalog:write');

  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const data = parsed.data;

  if (data.taxRatePercent !== null && !GST_SLABS.includes(data.taxRatePercent)) {
    return fail('taxRatePercent', 'Pick one of the GST slabs.');
  }

  const categories = await collections.categories();
  const parent = toEntity(await categories.findOne({ _id: data.parentId }));
  if (!parent) return fail('parentId', 'That parent category no longer exists.');
  if (parent.depth >= 2) {
    return fail('parentId', 'The tree goes three levels deep at most. Pick a higher parent.');
  }

  const base = slugify(data.name);
  if (!base) return fail('name', 'Use letters or digits in the name.');

  // Slugs are global, so Kurtas under Men and under Women cannot both own
  // /category/kurtas. The second one is prefixed with its parent.
  const taken = async (slug: string) =>
    Boolean(await categories.findOne({ $or: [{ slug }, { slugHistory: slug }] }));
  let slug = base;
  if (await taken(slug)) {
    slug = `${parent.slug}-${base}`.slice(0, 80);
    if (await taken(slug)) return fail('name', 'A category with that name already exists here.');
  }

  const [last] = await categories
    .find({ parentId: parent.id })
    .sort({ position: -1 })
    .limit(1)
    .toArray();
  const now = new Date().toISOString();

  const category: Category = {
    id: entityId('cat'),
    slug,
    slugHistory: [],
    name: data.name,
    path: [...parent.path, slug],
    parentId: parent.id,
    depth: parent.depth + 1,
    attributeFamily: parent.attributeFamily,
    gender: parent.gender,
    sizeSystem: parent.sizeSystem,
    sizeChart: null,
    description: data.description || `${data.name} from independent labels, delivered across India.`,
    seoIntro: null,
    imageUrl: parent.imageUrl,
    bannerUrl: null,
    iconKey: parent.iconKey,
    position: (last?.position ?? 0) + 1,
    isActive: true,
    featured: data.featured,
    productCount: 0,
    taxRatePercent: data.taxRatePercent ?? parent.taxRatePercent,
    returnable: data.returnable ?? parent.returnable,
    metaTitle: `${data.name} \u2014 Buy ${data.name} Online | VestraWAB`,
    metaDescription: data.description || null,
    createdAt: now,
    updatedAt: now,
  };

  await categories.insertOne(toDoc(category));
  invalidate([tags.taxonomy, tags.category(parent.slug)]);

  await audit.record({
    actor,
    action: 'category.create',
    entityType: 'category',
    entityId: category.id,
    entityLabel: `${parent.name} / ${category.name}`,
    severity: 'NOTICE',
  });

  revalidatePath('/admin/categories');
  return { ok: true };
}

/**
 * Show or hide a category in the shop.
 *
 * Hiding takes it out of the menu, the facets and its own page. Its products
 * stay reachable by direct link, because a shopper holding an order
 * confirmation must still be able to open what they bought.
 */
export async function setCategoryActive(input: {
  categoryId: string;
  isActive: boolean;
}): Promise<ActionResult> {
  const actor = await requirePermission('catalog:write');

  const categories = await collections.categories();
  const category = toEntity(await categories.findOne({ _id: input.categoryId }));
  if (!category) return { ok: false, error: 'Category not found.' };

  // A department going dark takes a whole column of the menu with it.
  if (category.depth === 0 && !input.isActive) {
    return { ok: false, error: 'Departments cannot be hidden from here.' };
  }

  const patch = { isActive: input.isActive, updatedAt: new Date().toISOString() };
  await categories.updateOne({ _id: category.id }, { $set: patch });
  invalidate([tags.taxonomy, tags.category(category.slug), tags.productList]);

  await audit.record({
    actor,
    action: input.isActive ? 'category.show' : 'category.hide',
    entityType: 'category',
    entityId: category.id,
    entityLabel: category.name,
    changes: audit.diff(category, patch, ['isActive']),
    severity: 'NOTICE',
  });

  revalidatePath('/admin/categories');
  return { ok: true };
}
/* --------------------------------------------------------------- promotion */

const createPromotionSchema = z.object({
  title: z.string().trim().min(4, 'Give it a title of at least 4 characters.').max(80),
  description: z.string().trim().min(8, 'Say what the offer is in a sentence.').max(240),
  badgeText: z.string().trim().max(24),
  type: z.enum(['PERCENT_DISCOUNT', 'FLAT_DISCOUNT', 'FLASH_SALE', 'CATEGORY_OFFER', 'FESTIVAL_CAMPAIGN']),
  valueKind: z.enum(['PERCENT', 'AMOUNT']),
  /** Percent, or rupees when valueKind is AMOUNT. */
  value: z.number().min(0),
  /** Rupees. Caps a percentage; ignored for an amount. */
  maxDiscount: z.number().min(0).nullable(),
  minOrderValue: z.number().min(0).max(1_000_000),
  /** null means every category. */
  categoryId: z.string().nullable(),
  priority: z.number().int().min(0).max(100),
  /** Units at the promo price; null means unlimited. */
  stockLimit: z.number().int().min(1, 'At least 1, or leave it blank.').max(1_000_000).nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
});

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;

/**
 * Create an automatic offer.
 *
 * Always created PAUSED. A promotion needs no code, so the moment it is live it
 * changes what every shopper pays on their next page view; a typo in the value
 * would reprice the whole shop. It is saved, reviewed in the table, and then
 * switched on with the toggle that is already audited.
 */
export async function createPromotion(input: CreatePromotionInput): Promise<ActionResult> {
  const actor = await requirePermission('promotion:write');

  const parsed = createPromotionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const data = parsed.data;

  // The type names a campaign; valueKind says how to read the number. Where
  // the type DOES imply one, the two must agree.
  if (data.type === 'PERCENT_DISCOUNT' && data.valueKind !== 'PERCENT') {
    return fail('value', 'A percentage discount must take a percentage off.');
  }
  if (data.type === 'FLAT_DISCOUNT' && data.valueKind !== 'AMOUNT') {
    return fail('value', 'A flat discount must take an amount off.');
  }
  if (data.valueKind === 'PERCENT' && (data.value < 1 || data.value > 80)) {
    return fail('value', 'An automatic offer takes between 1% and 80% off.');
  }
  if (data.valueKind === 'AMOUNT' && data.value < 1) {
    return fail('value', 'Enter the amount to take off.');
  }
  if (data.type === 'CATEGORY_OFFER' && !data.categoryId) {
    return fail('categoryId', 'A category offer needs a category.');
  }

  if (data.categoryId) {
    const categories = await collections.categories();
    if (!(await categories.findOne({ _id: data.categoryId }))) {
      return fail('categoryId', 'That category no longer exists.');
    }
  }

  const window = parseWindow(data.startsAt, data.endsAt);
  if ('ok' in window) return window;

  const promotions = await collections.promotions();
  const id = entityId('prm');
  let slug = slugify(data.title) || id.toLowerCase();
  if (await promotions.findOne({ slug })) slug = `${slug}-${id.slice(-6).toLowerCase()}`;
  const now = new Date().toISOString();

  const promotion: Promotion = {
    id,
    slug,
    title: data.title,
    subtitle: null,
    description: data.description,
    type: data.type,
    valueKind: data.valueKind,
    value: data.valueKind === 'PERCENT' ? Math.round(data.value) : toPaise(data.value),
    maxDiscount:
      data.valueKind === 'PERCENT' && data.maxDiscount ? toPaise(data.maxDiscount) : null,
    minOrderValue: toPaise(data.minOrderValue),
    categoryIds: data.categoryId ? [data.categoryId] : [],
    brandIds: [],
    sellerIds: [],
    productIds: [],
    paymentMethods: [],
    bankName: null,
    startsAt: new Date(window.starts).toISOString(),
    endsAt: new Date(window.ends).toISOString(),
    isActive: false,
    priority: data.priority,
    fundedBy: 'PLATFORM',
    bannerUrl: null,
    badgeText: data.badgeText || null,
    buyXGetY: null,
    stockLimit: data.type === 'FLASH_SALE' ? data.stockLimit : null,
    stockSold: 0,
    createdAt: now,
    updatedAt: now,
  };

  await promotions.insertOne(toDoc(promotion));
  invalidate([tags.promotions]);

  await audit.record({
    actor,
    action: 'promotion.create',
    entityType: 'promotion',
    entityId: promotion.id,
    entityLabel: promotion.title,
    severity: 'NOTICE',
  });

  revalidatePath('/admin/promotions');
  return { ok: true };
}

/* ------------------------------------------------------------------- brand */

const createBrandSchema = z.object({
  name: z.string().trim().min(2, 'Give the brand a name.').max(60),
  /** Blank means derive one from the name. */
  code: z.string().trim().max(6),
  description: z.string().trim().max(400),
  originCountry: z.string().trim().max(40),
  foundedYear: z.number().int().min(1800, 'That year is too early.').max(2100).nullable(),
  logoUrl: z.string().trim().max(500),
  isPremium: z.boolean(),
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;

/**
 * Add a brand.
 *
 * A listing cannot be submitted without one, and a clean database has none,
 * so this is the step that opens the catalogue. The code goes into every SKU
 * made under the brand, so it is short, uppercase and unique. Without a logo
 * the brand gets a monogram drawn by the site itself, rather than a stock
 * photograph that would misrepresent it.
 */
export async function createBrand(input: CreateBrandInput): Promise<ActionResult> {
  const actor = await requirePermission('catalog:write');

  const parsed = createBrandSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const data = parsed.data;

  const slug = slugify(data.name);
  if (!slug) return fail('name', 'Use letters or digits in the name.');

  const code = (data.code || data.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4)).toUpperCase();
  if (!/^[A-Z0-9]{2,6}$/.test(code)) return fail('code', 'Codes are 2 to 6 letters or digits.');
  if (data.logoUrl && !/^https:\/\/\S+$/.test(data.logoUrl)) {
    return fail('logoUrl', 'Use an https:// link to the logo, or leave it blank.');
  }

  const brands = await collections.brands();
  if (await brands.findOne({ $or: [{ slug }, { slugHistory: slug }] })) {
    return fail('name', 'A brand with that name already exists.');
  }
  if (await brands.findOne({ code })) return fail('code', `${code} is already used by another brand.`);

  const now = new Date().toISOString();
  const brand: Brand = {
    id: entityId('brd'),
    slug,
    slugHistory: [],
    name: data.name,
    code,
    logoUrl: data.logoUrl || `/api/media/t/brand/mulberry/${slug}-r${MEDIA_VERSION}.svg`,
    bannerUrl: null,
    description: data.description || `${data.name} on VestraWAB.`,
    originCountry: data.originCountry || 'India',
    foundedYear: data.foundedYear,
    isPremium: data.isPremium,
    isActive: true,
    productCount: 0,
    averageRating: 0,
    categoryIds: [],
    metaTitle: `${data.name} \u2014 Shop ${data.name} Online | VestraWAB`,
    metaDescription: data.description || null,
    createdAt: now,
    updatedAt: now,
  };

  await brands.insertOne(toDoc(brand));
  invalidate([tags.brandList, tags.brand(slug)]);

  await audit.record({
    actor,
    action: 'brand.create',
    entityType: 'brand',
    entityId: brand.id,
    entityLabel: brand.name,
    severity: 'NOTICE',
  });

  revalidatePath('/admin/brands');
  return { ok: true };
}

/** Show or hide a brand in the shop. Its products stay reachable by direct link. */
export async function setBrandActive(input: {
  brandId: string;
  isActive: boolean;
}): Promise<ActionResult> {
  const actor = await requirePermission('catalog:write');

  const brands = await collections.brands();
  const brand = toEntity(await brands.findOne({ _id: input.brandId }));
  if (!brand) return { ok: false, error: 'Brand not found.' };

  const patch = { isActive: input.isActive, updatedAt: new Date().toISOString() };
  await brands.updateOne({ _id: brand.id }, { $set: patch });
  invalidate([tags.brandList, tags.brand(brand.slug), tags.productList]);

  await audit.record({
    actor,
    action: input.isActive ? 'brand.show' : 'brand.hide',
    entityType: 'brand',
    entityId: brand.id,
    entityLabel: brand.name,
    changes: audit.diff(brand, patch, ['isActive']),
    severity: 'NOTICE',
  });

  revalidatePath('/admin/brands');
  return { ok: true };
}

/* ----------------------------------------------------------------- banners */

const bannerSchema = z.object({
  name: z.string().trim().min(2, 'Name the banner, for this list.').max(60),
  placement: z.enum(['HOME_HERO', 'HOME_GRID']),
  imageUrl: z.string().trim().min(1, 'Upload an image, or paste a link to one.').max(1000),
  alt: z.string().trim().min(3, 'Describe the image for people who cannot see it.').max(160),
  eyebrow: z.string().trim().max(40, 'Keep the label short.'),
  headline: z.string().trim().max(80),
  subheadline: z.string().trim().max(160),
  ctaLabel: z.string().trim().max(24),
  href: z.string().trim().min(1, 'Say where the banner links to.').max(300),
});

export type BannerInput = z.infer<typeof bannerSchema>;

/** The image must be an upload or https; the link must stay on this site or be https. */
function bannerLinkProblem(data: Pick<BannerInput, 'imageUrl' | 'href'>): ActionResult | null {
  // An upload, an https link, or one of the default slides' own pictures,
  // which a customised default slide keeps until someone replaces it.
  if (
    !/^https:\/\/\S+$/.test(data.imageUrl) &&
    !/^\/api\/media\/\S+$/.test(data.imageUrl) &&
    !/^\/hero\/[\w.-]+\.(?:jpe?g|png|webp)$/.test(data.imageUrl)
  ) {
    return fail('imageUrl', 'Upload the image, or use an https:// link.');
  }
  if (!/^\/(?!\/)\S*$/.test(data.href) && !/^https:\/\/\S+$/.test(data.href)) {
    return fail('href', 'Use a path on this site, like /category/kurtas, or an https:// link.');
  }
  return null;
}

/**
 * Add a homepage banner.
 *
 * Until a hero banner exists the homepage shows the built-in default slides,
 * and the tile grid stays hidden. A new banner goes live at the end of its row.
 */
export async function createBanner(input: BannerInput): Promise<ActionResult> {
  const actor = await requirePermission('cms:write');

  const parsed = bannerSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const data = parsed.data;

  const problem = bannerLinkProblem(data);
  if (problem) return problem;

  const banners = await collections.banners();
  const [last] = await banners.find({ placement: data.placement }).sort({ position: -1 }).limit(1).toArray();
  const now = new Date().toISOString();

  const banner: Banner = {
    id: entityId('bnr'),
    name: data.name,
    placement: data.placement,
    eyebrow: data.eyebrow || null,
    headline: data.headline || null,
    subheadline: data.subheadline || null,
    ctaLabel: data.ctaLabel || null,
    href: data.href,
    imageUrl: data.imageUrl,
    mobileImageUrl: null,
    alt: data.alt,
    // The storefront sets banner type in white over the photograph.
    theme: 'light',
    position: last ? last.position + 1 : 0,
    isActive: true,
    startsAt: null,
    endsAt: null,
    impressions: 0,
    clicks: 0,
    createdAt: now,
    updatedAt: now,
  };

  await banners.insertOne(toDoc(banner));
  invalidate([tags.content]);

  await audit.record({
    actor,
    action: 'cms.banner.create',
    entityType: 'banner',
    entityId: banner.id,
    entityLabel: banner.name,
  });

  revalidatePath('/admin/cms');
  revalidatePath('/');
  return { ok: true };
}

const updateBannerSchema = bannerSchema.extend({ bannerId: z.string().min(1) });

/**
 * Edit a banner: its picture, words, link or row.
 *
 * A new picture drops the separate phone crop, which belonged to the old one.
 * Moving to the other row puts it at the end of that row.
 */
export async function updateBanner(input: BannerInput & { bannerId: string }): Promise<ActionResult> {
  const actor = await requirePermission('cms:write');

  const parsed = updateBannerSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const { bannerId, ...data } = parsed.data;

  const problem = bannerLinkProblem(data);
  if (problem) return problem;

  const banners = await collections.banners();
  const banner = toEntity(await banners.findOne({ _id: bannerId }));
  if (!banner) return { ok: false, error: 'Banner not found.' };

  const moved = data.placement !== banner.placement;
  const [last] = moved
    ? await banners.find({ placement: data.placement }).sort({ position: -1 }).limit(1).toArray()
    : [];

  const patch = {
    name: data.name,
    placement: data.placement,
    eyebrow: data.eyebrow || null,
    headline: data.headline || null,
    subheadline: data.subheadline || null,
    ctaLabel: data.ctaLabel || null,
    href: data.href,
    imageUrl: data.imageUrl,
    mobileImageUrl: data.imageUrl === banner.imageUrl ? banner.mobileImageUrl : null,
    alt: data.alt,
    ...(moved ? { position: last ? last.position + 1 : 0 } : {}),
    updatedAt: new Date().toISOString(),
  };

  await banners.updateOne({ _id: banner.id }, { $set: patch });
  invalidate([tags.content]);

  await audit.record({
    actor,
    action: 'cms.banner.update',
    entityType: 'banner',
    entityId: banner.id,
    entityLabel: data.name,
    changes: audit.diff(banner, patch, ['name', 'placement', 'headline', 'href', 'imageUrl']),
  });

  revalidatePath('/admin/cms');
  revalidatePath('/');
  return { ok: true };
}

/**
 * Move a banner one place earlier or later in its row.
 *
 * The whole row is renumbered 0 to n as it goes, which also repairs any gaps
 * or ties left by deletions.
 */
export async function moveBanner(input: {
  bannerId: string;
  direction: 'up' | 'down';
}): Promise<ActionResult> {
  const actor = await requirePermission('cms:write');

  const banners = await collections.banners();
  const banner = toEntity(await banners.findOne({ _id: input.bannerId }));
  if (!banner) return { ok: false, error: 'Banner not found.' };

  const row = toEntities(
    await banners.find({ placement: banner.placement }).sort({ position: 1, createdAt: 1 }).toArray(),
  );
  const index = row.findIndex((entry) => entry.id === banner.id);
  const target = input.direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= row.length) return { ok: true };

  [row[index], row[target]] = [row[target], row[index]];
  await banners.bulkWrite(
    row.map((entry, position) => ({
      updateOne: { filter: { _id: entry.id }, update: { $set: { position } } },
    })),
  );
  invalidate([tags.content]);

  await audit.record({
    actor,
    action: 'cms.banner.move',
    entityType: 'banner',
    entityId: banner.id,
    entityLabel: banner.name,
    note: `${input.direction === 'up' ? 'earlier' : 'later'}, now ${target + 1} of ${row.length}`,
  });

  revalidatePath('/admin/cms');
  revalidatePath('/');
  return { ok: true };
}

/**
 * Copy the built-in hero slides into real banners.
 *
 * The homepage shows them while no hero banner is live; this turns them into
 * ordinary banners that can be edited, reordered, hidden or deleted. Refused
 * once any hero banner exists, so it can never double up.
 */
export async function adoptDefaultHeroSlides(): Promise<ActionResult> {
  const actor = await requirePermission('cms:write');

  const banners = await collections.banners();
  if ((await banners.countDocuments({ placement: 'HOME_HERO' })) > 0) {
    return { ok: false, error: 'There are hero slides already. Edit those instead.' };
  }

  const { DEFAULT_HERO_SLIDES } = await import('@/config/home');
  const now = new Date().toISOString();
  const slides = DEFAULT_HERO_SLIDES.map((slide) => ({
    ...slide,
    id: entityId('bnr'),
    createdAt: now,
    updatedAt: now,
  }));

  await banners.insertMany(slides.map((slide) => toDoc(slide)));
  invalidate([tags.content]);

  await audit.record({
    actor,
    action: 'cms.banner.adopt-defaults',
    entityType: 'banner',
    entityId: slides[0]?.id ?? 'HOME_HERO',
    entityLabel: 'Default hero slides',
    note: `${slides.length} slides copied into banners`,
  });

  revalidatePath('/admin/cms');
  revalidatePath('/');
  return { ok: true };
}

/** Take a banner off the homepage, or put it back. */
export async function setBannerActive(input: {
  bannerId: string;
  isActive: boolean;
}): Promise<ActionResult> {
  const actor = await requirePermission('cms:write');

  const banners = await collections.banners();
  const banner = toEntity(await banners.findOne({ _id: input.bannerId }));
  if (!banner) return { ok: false, error: 'Banner not found.' };

  const patch = { isActive: input.isActive, updatedAt: new Date().toISOString() };
  await banners.updateOne({ _id: banner.id }, { $set: patch });
  invalidate([tags.content]);

  await audit.record({
    actor,
    action: input.isActive ? 'cms.banner.show' : 'cms.banner.hide',
    entityType: 'banner',
    entityId: banner.id,
    entityLabel: banner.name,
    changes: audit.diff(banner, patch, ['isActive']),
  });

  revalidatePath('/admin/cms');
  revalidatePath('/');
  return { ok: true };
}

/** Remove a banner for good. Hiding it is the reversible option. */
export async function deleteBanner(input: { bannerId: string }): Promise<ActionResult> {
  const actor = await requirePermission('cms:write');

  const banners = await collections.banners();
  const banner = toEntity(await banners.findOne({ _id: input.bannerId }));
  if (!banner) return { ok: false, error: 'Banner not found.' };

  await banners.deleteOne({ _id: banner.id });
  invalidate([tags.content]);

  await audit.record({
    actor,
    action: 'cms.banner.delete',
    entityType: 'banner',
    entityId: banner.id,
    entityLabel: banner.name,
    severity: 'NOTICE',
  });

  revalidatePath('/admin/cms');
  revalidatePath('/');
  return { ok: true };
}

/* ------------------------------------------------------------------- pages */

const updatePageSchema = z.object({
  pageId: z.string().min(1),
  title: z.string().trim().min(2, 'Give the page a title.').max(120),
  metaDescription: z.string().trim().max(300, 'Keep the search description under 300 characters.'),
  body: z.string().trim().min(1, 'The page needs some text.').max(40_000, 'That is longer than a page should be.'),
  isPublished: z.boolean(),
});

export type UpdatePageInput = z.infer<typeof updatePageSchema>;

/**
 * Edit a policy or help page.
 *
 * The body is the same light Markdown the pages render. Contact details are
 * not part of it: they come from configuration and are set under the page, so
 * an edit here can never leave a stale phone number behind.
 */
export async function updateCmsPage(input: UpdatePageInput): Promise<ActionResult> {
  const actor = await requirePermission('cms:write');

  const parsed = updatePageSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const data = parsed.data;

  const pages = await collections.cmsPages();
  const page = toEntity(await pages.findOne({ _id: data.pageId }));
  if (!page) return { ok: false, error: 'Page not found.' };

  const patch = {
    title: data.title,
    metaTitle: `${data.title} | VestraWAB`,
    metaDescription: data.metaDescription || null,
    body: data.body,
    isPublished: data.isPublished,
    updatedAt: new Date().toISOString(),
    updatedByUserId: actor.id,
  };
  await pages.updateOne({ _id: page.id }, { $set: patch });
  invalidate([tags.content]);

  await audit.record({
    actor,
    action: 'cms.page.update',
    entityType: 'cmsPage',
    entityId: page.id,
    entityLabel: page.slug,
    changes: audit.diff(page, patch, ['title', 'metaDescription', 'isPublished']),
    ...(page.isPublished !== data.isPublished ? { severity: 'NOTICE' as const } : {}),
  });

  revalidatePath('/admin/pages');
  revalidatePath(`/admin/pages/${page.id}`);
  revalidatePath(`/${page.slug}`);
  return { ok: true };
}

export async function resetCmsPage(input: { pageId: string }): Promise<ActionResult> {
  const actor = await requirePermission('cms:write');
  const page = await (await collections.cmsPages()).findOne({ _id: input.pageId });
  if (!page) return { ok: false, error: 'Page not found.' };
  const { generateCmsPages } = await import('../seed/pages');
  const defaults = generateCmsPages(actor.id, new Date()).find((entry) => entry.slug === page.slug);
  return updateCmsPage({ pageId: page.id, title: defaults?.title ?? page.title,
    body: defaults?.body ?? page.body, metaDescription: defaults?.metaDescription ?? page.metaDescription ?? '',
    isPublished: Boolean(defaults) });
}

/**
 * Put a banner placement back to how the shop ships.
 *
 * NOTHING IS DELETED: every banner in the placement is hidden. For the hero
 * that means the homepage falls back to its built-in slides; for the tile grid
 * it means the grid steps out of the page, which is how a new shop starts.
 * Every banner stays in the list, one click from being live again.
 */
export async function resetBannerPlacement(input: {
  placement: 'HOME_HERO' | 'HOME_GRID';
}): Promise<ActionResult> {
  const actor = await requirePermission('cms:write');
  if (input.placement !== 'HOME_HERO' && input.placement !== 'HOME_GRID') {
    return { ok: false, error: 'Unknown placement.' };
  }

  const banners = await collections.banners();
  const result = await banners.updateMany(
    { placement: input.placement, isActive: true },
    { $set: { isActive: false, updatedAt: new Date().toISOString() } },
  );

  invalidate([tags.content]);

  await audit.record({
    actor,
    action: 'content.banners.reset',
    entityType: 'banner',
    entityId: input.placement,
    entityLabel: input.placement === 'HOME_HERO' ? 'Hero slides' : 'Tile grid',
    note: result.modifiedCount + ' hidden',
    severity: 'NOTICE',
  });

  revalidatePath('/admin/cms');
  revalidatePath('/');
  return { ok: true };
}
