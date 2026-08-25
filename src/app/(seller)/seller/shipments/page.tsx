import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { ManifestBar } from '@/components/console/manifest-bar';
import { StatusBadge } from '@/components/ui/badge';
import { SHIPMENT_STATUS_META, type ShipmentStatus } from '@/domain/enums';
import type { Shipment } from '@/domain/types';
import { formatDateShort, formatMoney, formatRelative } from '@/lib/format';
import { requireSeller } from '@/server/auth/session';
import { listSellerShipments } from '@/server/services/shipments';

export const metadata: Metadata = { title: 'Shipments' };

const TABS = [
  { value: 'ACTION_NEEDED', label: 'Needs action' },
  { value: 'ALL', label: 'All' },
  { value: 'PICKED_UP', label: 'Picked up' },
  { value: 'IN_TRANSIT', label: 'In transit' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'DELIVERY_FAILED', label: 'Exceptions' },
] as const;

/**
 * Parcels.
 *
 * Separate from Orders because they answer different questions. Orders is
 * "what have I sold and what do I owe the customer"; this is "what is in the
 * room, what has a label on it, and what is the courier taking today". A seller
 * packing a run works from here.
 *
 * Defaults to the work: parcels booked but unlabelled, or labelled but not yet
 * handed over.
 */
export default function SellerShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  return (
    <>
      <h1 className="font-display text-ink text-xl">Shipments</h1>
      <p className="text-muted mt-1 text-sm">
        Generate labels, hand parcels to the courier and close a manifest for the run.
      </p>

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <ShipmentQueue searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ShipmentQueue({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const [params, user] = await Promise.all([searchParams, requireSeller()]);
  const status = (params.status ?? 'ACTION_NEEDED') as (typeof TABS)[number]['value'];

  const shipments = await listSellerShipments(user.sellerId, {
    status: status === 'ALL' ? undefined : (status as ShipmentStatus | 'ACTION_NEEDED'),
    search: params.q,
  });

  // Only labelled, un-manifested parcels can go on a manifest.
  const manifestable = shipments.filter(
    (shipment) => shipment.awb && !shipment.manifestId && shipment.status !== 'CANCELLED',
  );

  const columns: Column<Shipment>[] = [
    {
      key: 'shipment',
      header: 'Parcel',
      render: (row) => (
        <div className="min-w-0">
          <Link
            href={`/seller/shipments/${row.id}`}
            className="text-ink tabular hover:text-accent text-xs font-semibold underline-offset-2 hover:underline"
          >
            {row.shipmentNumber}
          </Link>
          <p className="text-faint mt-0.5 truncate text-2xs">
            Order {row.orderNumber} · {formatRelative(row.createdAt)}
          </p>
        </div>
      ),
    },
    {
      key: 'awb',
      header: 'AWB',
      secondary: true,
      render: (row) =>
        row.awb ? (
          <div className="min-w-0">
            <p className="text-ink tabular truncate text-xs">{row.awb}</p>
            <p className="text-faint truncate text-2xs">{row.carrier}</p>
          </div>
        ) : (
          <span className="text-faint text-xs">Not generated</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge meta={SHIPMENT_STATUS_META[row.status]} size="sm" />,
    },
    {
      key: 'destination',
      header: 'To',
      secondary: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="text-ink truncate text-xs">{row.deliveryAddress.city}</p>
          <p className="text-faint tabular text-2xs">{row.deliveryAddress.pincode}</p>
        </div>
      ),
    },
    {
      key: 'eta',
      header: 'Expected',
      secondary: true,
      render: (row) =>
        row.status === 'DELIVERED' && row.deliveredAt ? (
          <span className="text-success-600 text-xs">{formatDateShort(row.deliveredAt)}</span>
        ) : row.estimatedDeliveryTo ? (
          <span className="text-muted text-xs">{formatDateShort(row.estimatedDeliveryTo)}</span>
        ) : (
          <span className="text-faint text-xs">—</span>
        ),
    },
    {
      key: 'value',
      header: 'Value',
      numeric: true,
      render: (row) => (
        <div>
          <p className="text-ink text-xs font-semibold">{formatMoney(row.declaredValue)}</p>
          {row.codAmount > 0 ? <p className="text-warning-700 text-2xs">COD</p> : null}
        </div>
      ),
    },
  ];

  return (
    <div className="mt-6">
      <nav
        className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
        aria-label="Filter shipments"
      >
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/seller/shipments?status=${tab.value}`}
            aria-current={tab.value === status ? 'page' : undefined}
            className={
              tab.value === status
                ? 'bg-ink text-canvas shrink-0 rounded-md px-3 py-1.5 text-xs font-medium'
                : 'text-muted hover:bg-sunken hover:text-ink shrink-0 rounded-md px-3 py-1.5 text-xs transition-colors'
            }
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {manifestable.length > 0 ? (
        <ManifestBar
          shipmentIds={manifestable.map((shipment) => shipment.id)}
          carrier={manifestable[0].carrier}
        />
      ) : null}

      <p className="text-faint mt-4 text-xs">
        {shipments.length} {shipments.length === 1 ? 'parcel' : 'parcels'}
      </p>

      <DataTable
        className="mt-2"
        columns={columns}
        rows={shipments}
        rowKey={(row) => row.id}
        caption="Your shipments"
        empty={
          <TableEmpty
            title={status === 'ACTION_NEEDED' ? 'Nothing waiting' : 'No parcels here'}
            body={
              status === 'ACTION_NEEDED'
                ? 'Every parcel is labelled and on its way. Mark an order packed to create the next one.'
                : 'Try a different tab. Parcels appear here once an order is packed.'
            }
          />
        }
      />
    </div>
  );
}
