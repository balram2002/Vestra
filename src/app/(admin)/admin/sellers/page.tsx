import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { SellerStatusActions } from '@/components/console/admin-actions';
import { ConsoleTabs } from '@/components/console/console-tabs';
import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { PageHeader } from '@/components/console/page-header';
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
  { value: 'PENDING', label: 'Applications' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_HOLD', label: 'On hold' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'REJECTED', label: 'Sent back' },
];

const EMPTY: Record<string, { title: string; body: string }> = {
  ALL: {
    title: 'No sellers yet',
    body: 'Stores appear here as soon as someone applies at /sell-with-us.',
  },
  PENDING: {
    title: 'No applications waiting',
    body: 'New applications appear here the moment they are sent, oldest first.',
  },
};

export default function AdminSellersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  return (
    <>
      <PageHeader
        title="Sellers"
        description="Every store on the platform, and the applications waiting for a decision."
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
            href={`/admin/sellers/${seller.id}`}
            className="row-link text-ink block truncate text-xs font-medium hover:underline"
          >
            {seller.displayName}
          </Link>
          <p className="text-faint truncate text-2xs">
            {seller.kyc.registeredAddress.city || 'City not given'} -{' '}
            <span className="tabular">{seller.code}</span>
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
      render: (seller) =>
        seller.rating.count > 0 ? (
          <div>
            <p className="text-ink text-xs">{seller.rating.average}</p>
            <p className="text-faint text-2xs">{seller.rating.count} reviews</p>
          </div>
        ) : (
          <span className="text-faint text-2xs">No reviews</span>
        ),
    },
    {
      key: 'products',
      header: 'Listings',
      numeric: true,
      secondary: true,
      render: (seller) => <span className="text-ink text-xs">{seller.metrics.liveProductCount}</span>,
    },
    {
      key: 'gmv',
      header: 'Lifetime sales',
      numeric: true,
      render: (seller) => (
        <div>
          <p className="text-ink text-xs font-semibold">{formatMoneyCompact(seller.metrics.lifetimeGmv)}</p>
          <p className="text-faint text-2xs">{seller.metrics.orderCount} orders</p>
        </div>
      ),
    },
    {
      key: 'joined',
      header: 'Applied',
      numeric: true,
      secondary: true,
      render: (seller) => <span className="text-faint text-2xs">{formatDateShort(seller.joinedAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (seller) => (
        <SellerStatusActions sellerId={seller.id} name={seller.displayName} status={seller.status} />
      ),
    },
  ];

  const empty = EMPTY[status] ?? { title: 'No sellers here', body: 'No stores match this filter.' };

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
        empty={<TableEmpty title={empty.title} body={empty.body} />}
      />

      <Pager basePath="/admin/sellers" params={{ status }} page={page} total={total} pageSize={pageSize} />
    </div>
  );
}
