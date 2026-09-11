'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { Review } from '@/domain/types';
import { entityId } from '@/lib/ids';

import { requirePermission, requireUser } from '../auth/session';
import { collections, toDoc, toEntity } from '../db/collections';
import * as audit from '../services/audit';
import { invalidate } from '../services/cache-invalidation';
import { tags } from '../services/cache-tags';
import { applyRating } from '../services/reviews';
import { LIMITS, hit, retryMessage } from '../security/rate-limit';

/**
 * Writing and moderating reviews.
 *
 * Reviews could be read on every product page and nobody could write one: the
 * service had queries and no inserts. A review here is always a VERIFIED
 * purchase, because the only way in is a delivered item on the writer's own
 * order. A badge anybody could earn would be worth nothing.
 */

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  field?: string;
  data?: T;
}

const reviewSchema = z.object({
  orderItemId: z.string().min(1),
  rating: z.number().int().min(1, 'Choose a star rating').max(5),
  title: z.string().trim().max(80, 'Keep the title under 80 characters'),
  body: z
    .string()
    .trim()
    .min(20, 'Say a little more, at least 20 characters')
    .max(2000, 'Keep it under 2,000 characters'),
  fitFeedback: z.enum(['TOO_SMALL', 'TRUE_TO_SIZE', 'TOO_LARGE']).nullable(),
});

export type ReviewInput = z.input<typeof reviewSchema>;

/*
 * Links, email addresses and phone numbers are held for a person to read.
 *
 * Everything else publishes at once: holding every review makes honest
 * shoppers wait, and holding only the unhappy ones would be worse than
 * holding none. These three are how spam and doxxing get into a review.
 */
const HOLD = /(https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[\w.]+|(?:\+?91[\s-]?)?[6-9]\d{9})/i;

/** "Ananya Iyer" becomes "Ananya I.": enough to be a person, not enough to find one. */
function publicName(fullName: string): string {
  const [first = 'Customer', ...rest] = fullName.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

export async function submitReview(
  input: ReviewInput,
): Promise<ActionResult<{ status: Review['status'] }>> {
  const user = await requireUser();

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? 'Check the review and try again.',
      field: issue?.path[0] !== undefined ? String(issue.path[0]) : undefined,
    };
  }
  const data = parsed.data;

  const limited = await hit(LIMITS.review, user.id);
  if (!limited.allowed) return { ok: false, error: retryMessage(limited) };

  const [itemCol, orderCol, reviewCol] = await Promise.all([
    collections.orderItems(),
    collections.orders(),
    collections.reviews(),
  ]);

  const item = toEntity(await itemCol.findOne({ _id: data.orderItemId }));
  const order = item
    ? await orderCol.findOne({ _id: item.orderId, userId: user.id }, { projection: { _id: 1 } })
    : null;
  if (!item || !order) return { ok: false, error: 'That order item could not be found.' };
  if (item.status !== 'DELIVERED') {
    return { ok: false, error: 'You can review this once it has been delivered.' };
  }

  if (await reviewCol.findOne({ userId: user.id, productId: item.productId })) {
    return { ok: false, error: 'You have already reviewed this product.' };
  }

  const held = HOLD.test(`${data.title} ${data.body}`);
  const now = new Date().toISOString();

  const review: Review = {
    id: entityId('rev'),
    productId: item.productId,
    variantId: item.variantId,
    sellerId: item.sellerId,
    userId: user.id,
    authorName: publicName(user.fullName),
    authorAvatarUrl: user.avatarUrl ?? null,
    orderItemId: item.id,
    verifiedPurchase: true,
    rating: data.rating,
    title: data.title || null,
    body: data.body,
    images: [],
    fitFeedback: data.fitFeedback,
    sizePurchased: item.size,
    status: held ? 'PENDING' : 'PUBLISHED',
    helpfulCount: 0,
    notHelpfulCount: 0,
    reportCount: 0,
    response: null,
    moderationNote: held ? 'Held automatically: contains a link or contact details.' : null,
    moderatedByUserId: null,
    createdAt: now,
    updatedAt: now,
  };

  await reviewCol.insertOne(toDoc(review));

  if (review.status === 'PUBLISHED') {
    await applyRating(item.productId, data.rating, 1);
    invalidate([tags.reviews(item.productId), tags.product(item.productId), tags.productList]);
  }

  revalidatePath(`/orders/${item.orderId}`);
  revalidatePath('/account/reviews');
  return { ok: true, data: { status: review.status } };
}

const moderationSchema = z.object({
  reviewId: z.string().min(1),
  decision: z.enum(['PUBLISH', 'REJECT']),
  note: z.string().trim().max(300).optional(),
});

/**
 * Publish, reject or take down.
 *
 * The product's rating counts published reviews, so it moves by one on every
 * change into or out of PUBLISHED and never otherwise. A rejection needs a
 * reason because the audit log is where "why did my review vanish" gets
 * answered.
 */
export async function moderateReview(input: {
  reviewId: string;
  decision: 'PUBLISH' | 'REJECT';
  note?: string;
}): Promise<ActionResult> {
  const actor = await requirePermission('review:moderate');

  const parsed = moderationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That is not a valid decision.' };
  const { reviewId, decision, note } = parsed.data;

  if (decision === 'REJECT' && (!note || note.length < 4)) {
    return { ok: false, error: 'Say why, so the decision can be explained later.', field: 'note' };
  }

  const reviews = await collections.reviews();
  const review = toEntity(await reviews.findOne({ _id: reviewId }));
  if (!review) return { ok: false, error: 'Review not found.' };

  const next: Review['status'] = decision === 'PUBLISH' ? 'PUBLISHED' : 'REJECTED';
  if (review.status === next) return { ok: true };

  const patch = {
    status: next,
    moderationNote: note ?? null,
    moderatedByUserId: actor.id,
    updatedAt: new Date().toISOString(),
  };
  await reviews.updateOne({ _id: review.id }, { $set: patch });

  if (next === 'PUBLISHED') await applyRating(review.productId, review.rating, 1);
  else if (review.status === 'PUBLISHED') await applyRating(review.productId, review.rating, -1);

  invalidate([tags.reviews(review.productId), tags.product(review.productId), tags.productList]);

  await audit.record({
    actor,
    action: decision === 'PUBLISH' ? 'review.publish' : 'review.reject',
    entityType: 'review',
    entityId: review.id,
    entityLabel: `${review.rating} stars by ${review.authorName}`,
    changes: audit.diff(review, patch, ['status']),
    note: note ?? null,
    severity: 'NOTICE',
  });

  revalidatePath('/admin/reviews');
  return { ok: true };
}