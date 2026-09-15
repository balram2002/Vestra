import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';

import { galleryAssets } from '@/domain/media';
import type { ProductRating, Review } from '@/domain/types';

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

/* ---------------------------------------------------------------- writing */

/**
 * Move a product's rating by one review, in or out.
 *
 * Incremental rather than recounted from the review collection: a product's
 * rating also carries stars given without a written review, so counting review
 * documents would turn "4.3 from 512" into "4.0 from 3" the first time
 * somebody posted one. The count is re-derived from the distribution, so the
 * two can never drift apart.
 */
export async function applyRating(
  productId: string,
  rating: number,
  direction: 1 | -1,
): Promise<void> {
  const products = await collections.products();
  const product = await products.findOne({ _id: productId }, { projection: { rating: 1 } });
  if (!product) return;

  const star = Math.min(5, Math.max(1, Math.round(rating))) - 1;
  const distribution = [...product.rating.distribution] as ProductRating['distribution'];
  distribution[star] = Math.max(0, (distribution[star] ?? 0) + direction);

  const count = distribution.reduce((sum, value) => sum + value, 0);
  const weighted = distribution.reduce((sum, value, index) => sum + value * (index + 1), 0);
  const average = count > 0 ? Number((weighted / count).toFixed(1)) : 0;

  await products.updateOne(
    { _id: productId },
    {
      $set: {
        'rating.average': average,
        'rating.count': count,
        'rating.distribution': distribution,
      },
    },
  );
}

export interface Testimonial {
  id: string;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  productTitle: string;
  productSlug: string;
  productImageUrl: string | null;
  verifiedPurchase: boolean;
}

/**
 * What shoppers actually said, for the homepage.
 *
 * REAL REVIEWS ONLY, and only ones tied to a delivered order. A testimonial
 * band is the single easiest thing on a shop to fake, and a fabricated one is
 * worth less than nothing: it is the section shoppers have learned to
 * disbelieve. These are the same reviews on the product pages, chosen for being
 * recent, five-star and long enough to say something.
 */
export async function topTestimonials(limit = 6): Promise<Testimonial[]> {
  'use cache';
  cacheTag(tags.productList);
  cacheLife('hours');

  const [reviewCol, productCol] = await Promise.all([
    collections.reviews(),
    collections.products(),
  ]);

  const reviews = await reviewCol
    .find({ status: 'PUBLISHED', rating: { $gte: 4 }, verifiedPurchase: true })
    .sort({ helpfulCount: -1, createdAt: -1 })
    .limit(limit * 3)
    .toArray();

  // A one-word review is not a testimonial, however many stars it carries.
  const usable = reviews.filter((review) => review.body.trim().length >= 40).slice(0, limit);
  if (usable.length === 0) return [];

  const products = await productCol
    .find({ _id: { $in: usable.map((review) => review.productId) } })
    .toArray();
  const byId = new Map(products.map((product) => [product._id, product]));

  return usable.flatMap((review) => {
    const product = byId.get(review.productId);
    if (!product || product.status !== 'PUBLISHED') return [];

    return [
      {
        id: review._id,
        authorName: review.authorName,
        rating: review.rating,
        title: review.title,
        body: review.body,
        productTitle: product.title,
        productSlug: product.slug,
        productImageUrl: galleryAssets(product.media ?? [])[0]?.url ?? null,
        verifiedPurchase: review.verifiedPurchase,
      },
    ];
  });
}
