import type { Metadata } from 'next';
import { Suspense } from 'react';

import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { FULFILLMENT_STATUS_META, RETURN_REASON_LABEL } from '@/domain/enums';
import type { ReturnRequest } from '@/domain/types';
import { formatDateShort, formatMoney } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Returns' };

export default function AdminReturnsPage() {
  return (
    <>
      <h1 className="font-display text-ink text-xl">Returns</h1>
      <p className="text-muted mt-1 text-sm">
        Every return across the platform, with who is liable for the cost.
      </p>

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <ReturnTable />
      </Suspense>
    </>
  );
}

async function ReturnTable() {
  await requirePermission('return:read');

  const returnCol = await collections.returns();
  const requests = toEntities(
    await returnCol.find({}).sort({ createdAt: -1 }).limit(100).toArray(),
  );

  const columns: Column<ReturnRequest>[] = [
    {
      key: 'ref',
      header: 'Return',
      render: (request) => (
        <div className="min-w-0">
          <p className="text-ink tabular text-xs font-semibold">{request.returnNumber}</p>
          <p className="text-faint tabular text-2xs">{request.orderNumber}</p>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (request) => (
        <span className="text-muted text-xs">{RETURN_REASON_LABEL[request.reason]}</span>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      numeric: true,
      secondary: true,
      render: (request) => (
        <span className="text-ink text-xs">
          {request.items.reduce((sum, item) => sum + item.quantity, 0)}
        </span>
      ),
    },
    {
      key: 'liability',
      header: 'Liable',
      secondary: true,
      render: (request) => (
        <span
          className={
            request.liability === 'SELLER'
              ? 'text-warning-700 text-xs font-medium'
              : 'text-muted text-xs'
          }
        >
          {request.liability.toLowerCase()}
        </span>
      ),
    },
    {
      key: 'refund',
      header: 'Refund',
      numeric: true,
      render: (request) => (
        <span className="text-ink text-xs font-semibold">
          {formatMoney(request.refundAmount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (request) => <StatusBadge meta={FULFILLMENT_STATUS_META[request.status]} size="sm" />,
    },
    {
      key: 'raised',
      header: 'Raised',
      numeric: true,
      secondary: true,
      render: (request) => (
        <span className="text-faint text-2xs">{formatDateShort(request.requestedAt)}</span>
      ),
    },
  ];

  return (
    <div className="mt-6">
      <DataTable
        columns={columns}
        rows={requests}
        rowKey={(request) => request.id}
        caption="Returns"
        empty={
          <TableEmpty
            title="No returns"
            body="Nothing has been sent back yet. Returns appear here as soon as a customer raises one."
          />
        }
      />
    </div>
  );
}
