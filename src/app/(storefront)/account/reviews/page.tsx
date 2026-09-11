import { Star } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { AccountNav } from '@/components/account/account-nav';
import { RatingStars } from '@/components/commerce/rating-stars';
import { formatDate } from '@/lib/format';
import { requireUser } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';

export const metadata: Metadata = {
  title: 'Your reviews',
  robots: { index: false, follow: false },
};

export default function AccountReviewsPage() {
  return (
    <div className="gutter shell-max py-6">
      <AccountNav current="/account/reviews" />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <Reviews />
      </Suspense>
    </div>
  );
}

async function Reviews() {
  const user = await requireUser();

  const reviewCol = await collections.reviews();
  const reviews = toEntities(
    await reviewCol.find({ userId: user.id }).sort({ createdAt: -1 }).limit(50).toArray(),
  );

  if (reviews.length === 0) {
    return (
      <div className="border-line mt-6 rounded-lg border border-dashed p-12 text-center">
        <Star className="text-faint mx-auto size-8" aria-hidden strokeWidth={1.5} />
        <p className="text-ink mt-4 text-lg font-medium">No reviews yet</p>
        <p className="text-muted mx-auto mt-1.5 max-w-sm text-sm">
          Once something you ordered is delivered you can rate it. Size feedback especially helps
          the next shopper get it right first time.
        </p>
        <Link
          href="/orders"
          className="text-ink mt-5 inline-block border-b border-current pb-0.5 text-sm font-medium"
        >
          Go to your orders
        </Link>
      </div>
    );
  }

  const products = await collections.products();
  const productDocs = toEntities(
    await products
      .find(
        { _id: { $in: reviews.map((review) => review.productId) } },
        { projection: { title: 1, slug: 1, id: 1 } },
      )
      .toArray(),
  );
  const byProduct = new Map(productDocs.map((product) => [product.id, product]));

  return (
    <ul className="mt-6 space-y-3">
      {reviews.map((review) => {
        const product = byProduct.get(review.productId);

        return (
          <li key={review.id} className="border-line rounded-lg border p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                {product ? (
                  <Link
                    href={`/product/${product.slug}`}
                    className="text-ink text-sm font-medium hover:underline"
                  >
                    {product.title}
                  </Link>
                ) : (
                  <span className="text-muted text-sm">Product no longer listed</span>
                )}
                <p className="text-faint mt-0.5 text-xs">
                  {formatDate(review.createdAt)}
                  {review.sizePurchased ? ` - size ${review.sizePurchased}` : ''}
                  {review.verifiedPurchase ? ' - verified purchase' : ''}
                  {review.status === 'PENDING'
                    ? ' - publishing after a quick check'
                    : review.status === 'REJECTED'
                      ? ' - not published'
                      : ''}
                </p>
              </div>

              <RatingStars rating={review.rating} count={null} size="md" />
            </div>

            {review.title ? (
              <p className="text-ink mt-3 text-sm font-medium">{review.title}</p>
            ) : null}
            <p className="text-muted mt-1 text-sm">{review.body}</p>

            {review.response ? (
              <div className="border-line bg-sunken mt-3 rounded-sm border-l-2 p-3">
                <p className="text-ink text-xs font-medium">{review.response.byName} replied</p>
                <p className="text-muted mt-0.5 text-xs">{review.response.body}</p>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
