import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ReviewModerationActions } from '@/components/console/admin-actions';
import { ConsoleTabs } from '@/components/console/console-tabs';
import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { PageHeader } from '@/components/console/page-header';
import { Pager } from '@/components/console/pager';
import { RatingStars } from '@/components/commerce/rating-stars';
import { Badge } from '@/components/ui/badge';
import type { Review } from '@/domain/types';
import { formatDateShort } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Reviews' };

const TABS = [
  { value: 'PENDING', label: 'Waiting' },
  { value: 'FLAGGED', label: 'Reported' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'REJECTED', label: 'Rejected' },
];

const PAGE_SIZE = 25;

type ReviewSearchParams = { status?: string; page?: string };

/**
 * Review moderation.
 *
 * Most reviews publish the moment they are written; the ones with a link, an
 * email or a phone number wait here for a person, and a published review can
 * be taken down. Every decision moves the product's rating and is audited.
 */
export default function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<ReviewSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Reviews"
        description="What shoppers say about what they bought. Reviews with links or contact details wait here before they go live."
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-xl" aria-hidden />}>
        <ReviewTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ReviewTable({ searchParams }: { searchParams: Promise<ReviewSearchParams> }) {
  const [params] = await Promise.all([searchParams, requirePermission('review:moderate')]);
  const status = (
    TABS.some((tab) => tab.value === params.status) ? params.status : 'PENDING'
  ) as Review['status'];
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  const reviewCol = await collections.reviews();
  const filter = { status };
  const [docs, total] = await Promise.all([
    reviewCol
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .toArray(),
    reviewCol.countDocuments(filter),
  ]);
  const reviews = toEntities(docs);

  const productCol = await collections.products();
  const products = toEntities(
    await productCol
      .find(
        { _id: { $in: reviews.map((review) => review.productId) } },
        { projection: { title: 1, slug: 1 } },
      )
      .toArray(),
  );
  const byProduct = new Map(products.map((product) => [product.id, product]));

  const columns: Column<Review>[] = [
    {
      key: 'review',
      header: 'Review',
      render: (review) => (
        <div className="max-w-md min-w-0">
          <RatingStars rating={review.rating} count={null} size="md" />
          {review.title ? (
            <p className="text-ink mt-1 truncate text-xs font-semibold">{review.title}</p>
          ) : null}
          <p className="text-muted clamp-2 mt-0.5 text-xs">{review.body}</p>
          {review.moderationNote ? (
            <p className="text-warning-700 mt-1 text-2xs">{review.moderationNote}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'product',
      header: 'Product',
      secondary: true,
      render: (review) => {
        const product = byProduct.get(review.productId);
        return product ? (
          <a
            href={`/product/${product.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-ink clamp-2 max-w-[14rem] text-xs hover:underline"
          >
            {product.title}
          </a>
        ) : (
          <span className="text-faint text-xs">No longer listed</span>
        );
      },
    },
    {
      key: 'author',
      header: 'Author',
      render: (review) => (
        <div className="min-w-0">
          <p className="text-ink truncate text-xs font-medium">{review.authorName}</p>
          {review.verifiedPurchase ? (
            <Badge tone="success" size="sm" className="mt-1">
              Verified
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Written',
      numeric: true,
      secondary: true,
      render: (review) => (
        <span className="text-faint text-2xs">{formatDateShort(review.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (review) => <ReviewModerationActions reviewId={review.id} status={review.status} />,
    },
  ];

  return (
    <div className="mt-6">
      <ConsoleTabs basePath="/admin/reviews" param="status" current={status} tabs={TABS} />

      <p className="text-faint mt-4 text-xs">
        {total.toLocaleString('en-IN')} {total === 1 ? 'review' : 'reviews'}
      </p>

      <DataTable
        className="mt-2"
        columns={columns}
        rows={reviews}
        rowKey={(review) => review.id}
        caption="Reviews"
        empty={
          <TableEmpty
            title={status === 'PENDING' ? 'Nothing waiting' : 'No reviews here'}
            body={
              status === 'PENDING'
                ? 'Reviews with links or contact details land here before they go live.'
                : 'Nothing matches this filter.'
            }
          />
        }
      />

      <Pager
        basePath="/admin/reviews"
        params={{ status }}
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}