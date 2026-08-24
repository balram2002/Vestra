import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';

import type { Review } from '@/domain/types';

import { collections, toEntities } from '../db/collections';
import { tags } from './cache-tags';

/**
 * Reviews.
 *
 * Tagged separately from the product itself (`reviews:<id>` rather than
 * `product:<id>`), so posting a review expires the review list without
 * invalidating the prerendered product shell — the copy, imagery and price on
 * that page have not changed.
 */

export interface ReviewPage {
  items: Review[];
  total: number;
  /** Photos across all reviews, for the "customer photos" strip. */
  photos: string[];
}

export async function getProductReviews(
  productId: string,
  options: { sort?: 'recent' | 'helpful'; limit?: number; rating?: number } = {},
): Promise<ReviewPage> {
  'use cache';
  cacheTag(tags.reviews(productId));
  cacheLife('minutes');

  const { sort = 'helpful', limit = 8, rating } = options;

  const reviews = await collections.reviews();
  const filter = {
    productId,
    status: 'PUBLISHED' as const,
    ...(rating ? { rating } : {}),
  };

  const [docs, total] = await Promise.all([
    reviews
      .find(filter)
      .sort(sort === 'recent' ? { createdAt: -1 } : { helpfulCount: -1, createdAt: -1 })
      .limit(limit)
      .toArray(),
    reviews.countDocuments(filter),
  ]);

  const items = toEntities(docs);

  return {
    items,
    total,
    photos: items.flatMap((review) => review.images).slice(0, 12),
  };
}

/**
 * The fit signal shown above the review list.
 *
 * Fashion returns are dominated by fit, so "62% said this runs true to size" is
 * the single most useful thing a previous buyer can tell the next one — more
 * than the star average.
 */
export interface FitSummary {
  trueToSizePercent: number;
  tooSmallPercent: number;
  tooLargePercent: number;
  sampleSize: number;
}

export async function getFitSummary(productId: string): Promise<FitSummary | null> {
  'use cache';
  cacheTag(tags.reviews(productId));
  cacheLife('hours');

  const reviews = await collections.reviews();
  const rows = await reviews
    .aggregate<{ _id: string | null; count: number }>([
      { $match: { productId, status: 'PUBLISHED', fitFeedback: { $ne: null } } },
      { $group: { _id: '$fitFeedback', count: { $sum: 1 } } },
    ])
    .toArray();

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  // Below this the percentages are noise, and presenting them would imply a
  // confidence the data does not support.
  if (total < 5) return null;

  const pick = (key: string) => rows.find((row) => row._id === key)?.count ?? 0;

  return {
    trueToSizePercent: Math.round((pick('TRUE_TO_SIZE') / total) * 100),
    tooSmallPercent: Math.round((pick('TOO_SMALL') / total) * 100),
    tooLargePercent: Math.round((pick('TOO_LARGE') / total) * 100),
    sampleSize: total,
  };
}
