import type { Metadata } from 'next';

import { PageHeader } from '@/components/console/page-header';
import { Tabs } from '@/components/ui/tabs';
import Link from 'next/link';
import { Suspense } from 'react';

import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { StockEditor } from '@/components/console/stock-editor';
import { formatMoney } from '@/lib/format';
import { requireSeller } from '@/server/auth/session';
import { listSellerInventory, type InventoryRow } from '@/server/services/seller';

export const metadata: Metadata = { title: 'Inventory' };

const TABS = [
  { value: 'OUT', label: 'Out of stock' },
  { value: 'LOW', label: 'Running low' },
  { value: 'ALL', label: 'All sizes' },
] as const;

/**
 * Stock, per size.
 *
 * Per SIZE rather than per style, because that is the unit that actually sells
 * out — a style showing "42 in stock" while its two most popular sizes are at
 * zero is the single most expensive blind spot a fashion seller has.
 *
 * The four buckets are all shown. `available` is what a seller can act on, but
 * `reserved` explains why available dropped without a sale, and `damaged`
 * explains why returned units did not come back to it.
 */
export default function SellerInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Counts are live. Editing here changes what shoppers can buy immediately."
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <InventoryTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function InventoryTable({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const [params, user] = await Promise.all([searchParams, requireSeller()]);
  const filter = (params.filter ?? 'OUT') as (typeof TABS)[number]['value'];

  const rows = await listSellerInventory(user.sellerId, { filter });

  const columns: Column<InventoryRow>[] = [
    {
      key: 'product',
      header: 'Style and size',
      render: (row) => (
        <div className="min-w-0">
          <Link
            href={`/product/${row.productSlug}`}
            className="row-link text-ink block truncate text-xs font-medium hover:underline"
          >
            {row.productTitle}
          </Link>
          <p className="text-faint text-2xs">
            {row.size} · {row.colorLabel} · <span className="tabular">{row.sku}</span>
          </p>
        </div>
      ),
    },
    {
      key: 'available',
      header: 'Available',
      numeric: true,
      render: (row) => (
        <span
          className={
            row.available <= 0
              ? 'text-danger-600 text-xs font-semibold'
              : row.available <= row.lowStockThreshold
                ? 'text-warning-700 text-xs font-semibold'
                : 'text-ink text-xs'
          }
        >
          {row.available}
        </span>
      ),
    },
    {
      key: 'reserved',
      header: 'Reserved',
      numeric: true,
      secondary: true,
      render: (row) => <span className="text-muted text-xs">{row.reserved}</span>,
    },
    {
      key: 'sold',
      header: 'Sold',
      numeric: true,
      secondary: true,
      render: (row) => <span className="text-muted text-xs">{row.sold}</span>,
    },
    {
      key: 'returned',
      header: 'Returned',
      numeric: true,
      secondary: true,
      render: (row) => (
        <span className="text-muted text-xs">
          {row.returned}
          {row.damaged > 0 ? (
            <span className="text-danger-600" title="Written off after quality check">
              {' '}
              (+{row.damaged})
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      numeric: true,
      secondary: true,
      render: (row) => <span className="text-ink text-xs">{formatMoney(row.sellingPrice)}</span>,
    },
    {
      key: 'edit',
      header: 'Set stock',
      numeric: true,
      render: (row) => <StockEditor variantId={row.variantId} available={row.available} />,
    },
  ];

  return (
    <div className="mt-6">
      <Tabs
        label="Filter inventory"
        items={[...TABS]}
        current={filter}
        href={(value) => `/seller/inventory?filter=${value}`}
      />

      <p className="text-faint mt-4 text-xs">
        {rows.length} {rows.length === 1 ? 'size' : 'sizes'}
      </p>

      <DataTable
        className="mt-2"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.variantId}
        caption="Your inventory"
        empty={
          <TableEmpty
            title={filter === 'OUT' ? 'Nothing is out of stock' : 'Nothing to see here'}
            body={
              filter === 'OUT'
                ? 'Every size you list is currently buyable. Check "Running low" to restock before anything sells out.'
                : 'No sizes match this filter.'
            }
          />
        }
      />
    </div>
  );
}
