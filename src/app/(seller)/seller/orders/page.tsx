import { AlertTriangle } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/console/page-header';
import { Tabs } from '@/components/ui/tabs';
import Link from 'next/link';
import { Suspense } from 'react';

import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { SellerOrderActions } from '@/components/console/seller-order-actions';
import { StatusBadge } from '@/components/ui/badge';
import { FULFILLMENT_STATUS_META, SELLER_ACTIONABLE } from '@/domain/enums';
import { formatDateShort, formatMoney, formatRelative } from '@/lib/format';
import { requireSeller } from '@/server/auth/session';
import { listSellerOrders, type SellerOrderRow } from '@/server/services/seller';

export const metadata: Metadata = { title: 'Orders' };

const TABS = [
  { value: 'ACTION', label: 'Needs action' },
  { value: 'ALL', label: 'All' },
  { value: 'PACKED', label: 'Packed' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

/**
 * Fulfilment queue.
 *
 * Defaults to "needs action" rather than "all". A seller opens this to find
 * what to pack, and a list of 900 historical orders is not that; the default
 * view should be the work, and everything else is a tab away.
 */
export default function SellerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  return (
    <>
      <PageHeader
        title="Orders"
        description="Dispatch within your SLA to protect your fulfilment score."
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <OrderQueue searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function OrderQueue({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const [params, user] = await Promise.all([searchParams, requireSeller()]);
  const status = (params.status ?? 'ACTION') as (typeof TABS)[number]['value'];
  const page = Number.parseInt(params.page ?? '1', 10) || 1;

  const { rows, total, pageSize } = await listSellerOrders(user.sellerId, { status, page });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const columns: Column<SellerOrderRow>[] = [
    {
      key: 'order',
      header: 'Order',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-ink tabular text-xs font-semibold">{row.sellerOrderNumber}</p>
          <p className="text-faint mt-0.5 truncate text-2xs">
            {row.items.length} {row.items.length === 1 ? 'item' : 'items'} ·{' '}
            {formatRelative(row.placedAt)}
          </p>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Contents',
      secondary: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="text-ink truncate text-xs">{row.items[0]?.productTitle ?? '—'}</p>
          {row.items.length > 1 ? (
            <p className="text-faint text-2xs">+{row.items.length - 1} more</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge meta={FULFILLMENT_STATUS_META[row.status]} size="sm" />,
    },
    {
      key: 'dispatch',
      header: 'Dispatch by',
      secondary: true,
      render: (row) =>
        SELLER_ACTIONABLE.includes(row.status) ? (
          <span
            className={
              row.breaching ? 'text-danger-600 inline-flex items-center gap-1 text-xs font-medium' : 'text-muted text-xs'
            }
          >
            {row.breaching ? <AlertTriangle className="size-3.5" aria-hidden /> : null}
            {formatDateShort(row.dispatchBy)}
          </span>
        ) : (
          <span className="text-faint text-xs">—</span>
        ),
    },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      render: (row) => (
        <div>
          <p className="text-ink text-xs font-semibold">{formatMoney(row.total)}</p>
          <p className="text-faint text-2xs">You get {formatMoney(row.sellerPayable)}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <SellerOrderActions
          sellerOrderId={row.id}
          status={row.status}
          itemIds={row.items.map((item) => item.id)}
        />
      ),
    },
  ];

  return (
    <div className="mt-6">
      <Tabs
        label="Filter orders"
        items={[...TABS]}
        current={status}
        href={(value) => `/seller/orders?status=${value}`}
      />

      <p className="text-faint mt-4 text-xs">
        {total} {total === 1 ? 'order' : 'orders'}
        {pageCount > 1 ? ` · page ${page} of ${pageCount}` : ''}
      </p>

      <DataTable
        className="mt-2"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        caption="Your orders"
        empty={
          <TableEmpty
            title={status === 'ACTION' ? 'Nothing to pack' : 'No orders here'}
            body={
              status === 'ACTION'
                ? 'Every order is packed and on its way. New orders appear here the moment they are placed.'
                : 'Try a different tab, or check back once orders start arriving.'
            }
          />
        }
      />

      {pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-between">
          <PageLink
            href={`/seller/orders?status=${status}&page=${page - 1}`}
            disabled={page <= 1}
            label="Previous"
          />
          <PageLink
            href={`/seller/orders?status=${status}&page=${page + 1}`}
            disabled={page >= pageCount}
            label="Next"
          />
        </div>
      ) : null}
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
}: {
  href: string;
  disabled: boolean;
  label: string;
}) {
  const shape =
    'inline-flex min-h-11 min-w-11 items-center justify-center px-1 text-xs lg:min-h-0 lg:min-w-0';

  if (disabled) {
    return <span className={`text-faint ${shape}`}>{label}</span>;
  }
  return (
    <Link href={href} className={`text-ink font-medium hover:underline ${shape}`}>
      {label}
    </Link>
  );
}
