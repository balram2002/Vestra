import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { ConsoleTabs } from '@/components/console/console-tabs';
import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { Pager } from '@/components/console/pager';
import { StatusBadge } from '@/components/ui/badge';
import { FULFILLMENT_STATUS_META, PAYMENT_STATUS_META } from '@/domain/enums';
import type { Order } from '@/domain/types';
import { formatDateShort, formatMoney } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { listAllOrders } from '@/server/services/admin';

export const metadata: Metadata = { title: 'Orders' };

const TABS = [
  { value: 'ALL', label: 'All' },
  { value: 'PLACED', label: 'Placed' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'REFUNDED', label: 'Refunded' },
];

export default function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  return (
    <>
      <h1 className="font-display text-ink text-xl">Orders</h1>
      <p className="text-muted mt-1 text-sm">Every order across the platform.</p>

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <OrderTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function OrderTable({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const [params] = await Promise.all([searchParams, requirePermission('order:read')]);
  const status = params.status ?? 'ALL';
  const page = Number.parseInt(params.page ?? '1', 10) || 1;

  const { rows, total, pageSize } = await listAllOrders({ status, page });

  const columns: Column<Order>[] = [
    {
      key: 'order',
      header: 'Order',
      render: (order) => (
        <div className="min-w-0">
          <Link
            href={`/admin/orders/${order.id}`}
            className="text-ink tabular block text-xs font-semibold hover:underline"
          >
            {order.orderNumber}
          </Link>
          <p className="text-faint text-2xs">
            {order.itemIds.length} {order.itemIds.length === 1 ? 'item' : 'items'} ·{' '}
            {order.sellerOrderIds.length}{' '}
            {order.sellerOrderIds.length === 1 ? 'seller' : 'sellers'}
          </p>
        </div>
      ),
    },
    {
      key: 'placed',
      header: 'Placed',
      secondary: true,
      render: (order) => (
        <span className="text-muted text-xs">{formatDateShort(order.placedAt)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (order) => <StatusBadge meta={FULFILLMENT_STATUS_META[order.status]} size="sm" />,
    },
    {
      key: 'payment',
      header: 'Payment',
      secondary: true,
      render: (order) => (
        <div>
          <StatusBadge meta={PAYMENT_STATUS_META[order.paymentStatus]} size="sm" />
          <p className="text-faint mt-0.5 text-2xs">{order.paymentMethod}</p>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      render: (order) => (
        <span className="text-ink text-xs font-semibold">
          {formatMoney(order.pricing.payable)}
        </span>
      ),
    },
  ];

  return (
    <div className="mt-6">
      <ConsoleTabs basePath="/admin/orders" param="status" current={status} tabs={TABS} />

      <p className="text-faint mt-4 text-xs">
        {total.toLocaleString('en-IN')} {total === 1 ? 'order' : 'orders'}
      </p>

      <DataTable
        className="mt-2"
        columns={columns}
        rows={rows}
        rowKey={(order) => order.id}
        caption="All orders"
        empty={<TableEmpty title="No orders" body="No orders match this filter." />}
      />

      <Pager
        basePath="/admin/orders"
        params={{ status }}
        page={page}
        total={total}
        pageSize={pageSize}
      />
    </div>
  );
}
