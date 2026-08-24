import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

import { ConsoleTabs } from '@/components/console/console-tabs';
import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { Pager } from '@/components/console/pager';
import { StatusBadge } from '@/components/ui/badge';
import { PRODUCT_STATUS_META } from '@/domain/enums';
import type { Product } from '@/domain/types';
import { formatDateShort, formatMoney } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { listAllProducts } from '@/server/services/admin';

export const metadata: Metadata = { title: 'Products' };

const TABS = [
  { value: 'PENDING_REVIEW', label: 'Awaiting review' },
  { value: 'ALL', label: 'All' },
  { value: 'PUBLISHED', label: 'Live' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ARCHIVED', label: 'Archived' },
];

/**
 * Catalogue moderation.
 *
 * Defaults to the review queue rather than the whole catalogue, for the same
 * reason the seller order list defaults to "needs action": the reason someone
 * opens this screen is almost always the queue.
 */
export default function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  return (
    <>
      <h1 className="font-display text-ink text-xl">Products</h1>
      <p className="text-muted mt-1 text-sm">
        Approve listings before they reach shoppers, and audit what is already live.
      </p>

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <ProductTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ProductTable({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const [params] = await Promise.all([searchParams, requirePermission('catalog:read')]);
  const status = params.status ?? 'PENDING_REVIEW';
  const page = Number.parseInt(params.page ?? '1', 10) || 1;

  const { rows, total, pageSize } = await listAllProducts({ status, page });

  const columns: Column<Product>[] = [
    {
      key: 'product',
      header: 'Style',
      render: (product) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="bg-sunken relative aspect-3/4 w-9 shrink-0 overflow-hidden rounded-sm">
            {product.media[0] ? (
              <Image src={product.media[0].url} alt="" fill sizes="36px" className="object-cover" />
            ) : null}
          </div>
          <div className="min-w-0">
            <Link
              href={`/product/${product.slug}`}
              className="text-ink block truncate text-xs font-medium hover:underline"
            >
              {product.title}
            </Link>
            <p className="text-faint tabular text-2xs">{product.styleCode}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (product) => <StatusBadge meta={PRODUCT_STATUS_META[product.status]} size="sm" />,
    },
    {
      key: 'price',
      header: 'Price',
      numeric: true,
      secondary: true,
      render: (product) => (
        <span className="text-ink text-xs">
          {formatMoney(product.priceRange.minSellingPrice)}
        </span>
      ),
    },
    {
      key: 'variants',
      header: 'Sizes',
      numeric: true,
      secondary: true,
      render: (product) => <span className="text-muted text-xs">{product.variants.length}</span>,
    },
    {
      key: 'rating',
      header: 'Rating',
      numeric: true,
      secondary: true,
      render: (product) => (
        <span className="text-ink text-xs">
          {product.rating.count > 0 ? `${product.rating.average} (${product.rating.count})` : '-'}
        </span>
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      numeric: true,
      render: (product) => (
        <span className="text-faint text-2xs">{formatDateShort(product.updatedAt)}</span>
      ),
    },
  ];

  return (
    <div className="mt-6">
      <ConsoleTabs basePath="/admin/products" param="status" current={status} tabs={TABS} />

      <p className="text-faint mt-4 text-xs">
        {total.toLocaleString('en-IN')} {total === 1 ? 'style' : 'styles'}
      </p>

      <DataTable
        className="mt-2"
        columns={columns}
        rows={rows}
        rowKey={(product) => product.id}
        caption="Products"
        empty={
          <TableEmpty
            title={status === 'PENDING_REVIEW' ? 'Review queue is clear' : 'Nothing here'}
            body={
              status === 'PENDING_REVIEW'
                ? 'Every submitted listing has been reviewed. New submissions appear here.'
                : 'No styles match this filter.'
            }
          />
        }
      />

      <Pager
        basePath="/admin/products"
        params={{ status }}
        page={page}
        total={total}
        pageSize={pageSize}
      />
    </div>
  );
}
