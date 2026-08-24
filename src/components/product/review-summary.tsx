import { CheckCircle2, ThumbsUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { Review } from '@/domain/types';
import type { FitSummary } from '@/server/services/reviews';
import { formatDate } from '@/lib/format';

/**
 * Reviews on the PDP.
 *
 * The fit signal is placed ABOVE the star average deliberately. For clothing,
 * "68% said this runs true to size" changes the buying decision far more than
 * "4.3 stars", and getting the size right is what stops the item coming back.
 *
 * The seller's reply is rendered inline under the review rather than collapsed,
 * because how a seller handles a complaint is itself information a shopper is
 * trying to read off the page.
 *
 * Dates are absolute, not relative. A prerendered "2 days ago" is frozen at
 * build time and starts lying immediately; a date never does.
 */
export function ReviewSummary({
  reviews,
  total,
  fit,
}: {
  reviews: Review[];
  total: number;
  fit: FitSummary | null;
}) {
  if (total === 0) {
    return (
      <p className="text-muted mt-3 text-sm">
        No reviews yet. If you buy this, yours will be the first — we only publish reviews from
        verified orders.
      </p>
    );
  }

  return (
    <div className="mt-4">
      {fit ? (
        <div className="border-line max-w-md rounded-md border p-4">
          <p className="text-ink text-sm font-semibold">How it fits</p>

          {/* A three-part bar rather than three numbers: the shape of the
              distribution is the point, and it reads at a glance. */}
          <div className="mt-3 flex h-2 overflow-hidden rounded-full">
            <span
              className="bg-warning-400 block"
              style={{ width: `${fit.tooSmallPercent}%` }}
              aria-hidden
            />
            <span
              className="bg-success-500 block"
              style={{ width: `${fit.trueToSizePercent}%` }}
              aria-hidden
            />
            <span
              className="bg-info-300 block"
              style={{ width: `${fit.tooLargePercent}%` }}
              aria-hidden
            />
          </div>

          <dl className="text-muted mt-2 flex justify-between text-2xs">
            <div>
              <dt className="inline">Runs small </dt>
              <dd className="tabular text-ink inline font-medium">{fit.tooSmallPercent}%</dd>
            </div>
            <div>
              <dt className="inline">True to size </dt>
              <dd className="tabular text-ink inline font-medium">{fit.trueToSizePercent}%</dd>
            </div>
            <div>
              <dt className="inline">Runs large </dt>
              <dd className="tabular text-ink inline font-medium">{fit.tooLargePercent}%</dd>
            </div>
          </dl>

          <p className="text-faint mt-2 text-2xs">Based on {fit.sampleSize} buyers</p>
        </div>
      ) : null}

      <ul className="mt-6 space-y-6">
        {reviews.map((review) => (
          <li key={review.id} className="border-line border-t pt-5 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={review.rating >= 4 ? 'success' : review.rating >= 3 ? 'warning' : 'danger'} size="sm" solid>
                {review.rating}★
              </Badge>

              {review.title ? (
                <span className="text-ink text-sm font-semibold">{review.title}</span>
              ) : null}

              {review.verifiedPurchase ? (
                <span className="text-success-600 inline-flex items-center gap-1 text-2xs">
                  <CheckCircle2 className="size-3" aria-hidden />
                  Verified purchase
                </span>
              ) : null}
            </div>

            <p className="text-muted mt-2 text-pretty text-sm">{review.body}</p>

            <div className="text-faint mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs">
              <span>{review.authorName}</span>
              <span aria-hidden>·</span>
              <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>

              {review.sizePurchased ? (
                <>
                  <span aria-hidden>·</span>
                  <span>Bought size {review.sizePurchased}</span>
                </>
              ) : null}

              {review.helpfulCount > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <ThumbsUp className="size-3" aria-hidden />
                    {review.helpfulCount} found this helpful
                  </span>
                </>
              ) : null}
            </div>

            {review.response ? (
              <div className="border-line bg-sunken mt-3 rounded-md border-l-2 p-3">
                <p className="text-ink text-xs font-semibold">{review.response.byName} replied</p>
                <p className="text-muted mt-1 text-sm">{review.response.body}</p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {total > reviews.length ? (
        <p className="text-faint mt-6 text-xs">
          Showing {reviews.length} of {total} reviews.
        </p>
      ) : null}
    </div>
  );
}
