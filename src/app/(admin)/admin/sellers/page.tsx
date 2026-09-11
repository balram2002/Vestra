import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { PageHeader } from '@/components/console/page-header';
import { SellerStatusActions } from '@/components/console/admin-actions';
import { ConsoleTabs } from '@/components/console/console-tabs';
import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { Pager } from '@/components/console/pager';
import { StatusBadge } from '@/components/ui/badge';
import { SELLER_STATUS_META } from '@/domain/enums';
import type { Seller } from '@/domain/types';
import { formatDateShort, formatMoneyCompact } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { listSellers } from '@/server/services/admin';

export const metadata: Metadata = { title: 'Sellers' };

const TABS = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'KYC_PENDING', label: 'KYC pending' },
  { value: 'ON_HOLD', label: 'On hold' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

export default function AdminSellersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  return (
    <>
      <PageHeader
        title="Sellers"
        description="Every store on the platform, ranked by lifetime trade."
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <SellerTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SellerTable({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const [params] = await Promise.all([searchParams, requirePermission('seller:read')]);
  const status = params.status ?? 'ALL';
  const page = Number.parseInt(params.page ?? '1', 10) || 1;

  const { rows, total, pageSize } = await listSellers({ status, page });

  const columns: Column<Seller>[] = [
    {
      key: 'store',
      header: 'Store',
      render: (seller) => (
        <div className="min-w-0">
          <Link
            href={`/store/${seller.slug}`}
            className="row-link text-ink block truncate text-xs font-medium hover:underline"
          >
            {seller.displayName}
          </Link>
          <p className="text-faint truncate text-2xs">
            {seller.legalName} - <span className="tabular">{seller.code}</span>
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (seller) => <StatusBadge meta={SELLER_STATUS_META[seller.status]} size="sm" />,
    },
    {
      key: 'rating',
      header: 'Rating',
      numeric: true,
      secondary: true,
      render: (seller) => (
        <div>
          <p className="text-ink text-xs">{seller.rating.average}</p>
          <p className="text-faint text-2xs">{seller.rating.count} reviews</p>
        </div>
      ),
    },
    {
      key: 'fulfilment',
      header: 'On-time',
      numeric: true,
      secondary: true,
      render: (seller) => (
        <span
          className={
            seller.rating.onTimeDispatchRate < 92
              ? 'text-warning-700 text-xs font-medium'
              : 'text-ink text-xs'
          }
        >
          {seller.rating.onTimeDispatchRate}%
        </span>
      ),
    },
    {
      key: 'products',
      header: 'Listings',
      numeric: true,
      secondary: true,
      render: (seller) => (
        <span className="text-ink text-xs">{seller.metrics.liveProductCount}</span>
      ),
    },
    {
      key: 'gmv',
      header: 'Lifetime GMV',
      numeric: true,
      render: (seller) => (
        <div>
          <p className="text-ink text-xs font-semibold">
            {formatMoneyCompact(seller.metrics.lifetimeGmv)}
          </p>
          <p className="text-faint text-2xs">{seller.metrics.orderCount} orders</p>
        </div>
      ),
    },
    {
      key: 'joined',
      header: 'Joined',
      numeric: true,
      secondary: true,
      render: (seller) => (
        <span className="text-faint text-2xs">{formatDateShort(seller.joinedAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (seller) => (
        <SellerStatusActions
          sellerId={seller.id}
          name={seller.displayName}
          status={seller.status}
        />
      ),
    },
  ];

  return (
    <div className="mt-6">
      <ConsoleTabs basePath="/admin/sellers" param="status" current={status} tabs={TABS} />

      <p className="text-faint mt-4 text-xs">
        {total} {total === 1 ? 'store' : 'stores'}
      </p>

      <DataTable
        className="mt-2"
        columns={columns}
        rows={rows}
        rowKey={(seller) => seller.id}
        caption="Sellers"
        empty={<TableEmpty title="No sellers" body="No stores match this filter." />}
      />

      <Pager
        basePath="/admin/sellers"
        params={{ status }}
        page={page}
        total={total}
        pageSize={pageSize}
      />
    </div>
  );
}
