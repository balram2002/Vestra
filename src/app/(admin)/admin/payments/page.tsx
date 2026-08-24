import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ConsoleTabs } from '@/components/console/console-tabs';
import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { Pager } from '@/components/console/pager';
import { StatusBadge } from '@/components/ui/badge';
import { PAYMENT_STATUSES, PAYMENT_STATUS_META } from '@/domain/enums';
import type { Payment, PaymentStatus } from '@/domain/types';
import { formatDateShort, formatMoney } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Payments' };

const TABS = [
  { value: 'ALL', label: 'All' },
  { value: 'CAPTURED', label: 'Captured' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'REFUNDED', label: 'Refunded' },
];

/**
 * Payment ledger.
 *
 * The reconciliation surface: every attempt, including the failed ones, with
 * the provider reference finance needs to match against a bank statement. A
 * ledger that hides failures cannot be reconciled.
 */
export default function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  return (
    <>
      <h1 className="font-display text-ink text-xl">Payments</h1>
      <p className="text-muted mt-1 text-sm">
        Every attempt, with the provider reference for reconciliation.
      </p>

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <PaymentTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PaymentTable({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const [params] = await Promise.all([searchParams, requirePermission('finance:read')]);
  const status = params.status ?? 'ALL';
  const page = Number.parseInt(params.page ?? '1', 10) || 1;
  const pageSize = 25;

  /*
   * Validated against the enum before it reaches the query. A raw search-param
   * string is untrusted input, and the typed collection rejects it — which is
   * the point of typing the collections rather than reaching for `any`.
   */
  const validStatus = (PAYMENT_STATUSES as readonly string[]).includes(status)
    ? (status as PaymentStatus)
    : null;

  const filter = validStatus ? { status: validStatus } : {};
  const paymentCol = await collections.payments();
  const [docs, total] = await Promise.all([
    paymentCol
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    paymentCol.countDocuments(filter),
  ]);

  const payments = toEntities(docs);

  const columns: Column<Payment>[] = [
    {
      key: 'order',
      header: 'Order',
      render: (payment) => (
        <div className="min-w-0">
          <p className="text-ink tabular text-xs font-semibold">{payment.orderNumber}</p>
          <p className="text-faint truncate text-2xs">
            {payment.providerPaymentId ?? payment.providerOrderId ?? 'no provider reference'}
          </p>
        </div>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      render: (payment) => (
        <div>
          <p className="text-ink text-xs">{payment.method}</p>
          <p className="text-faint truncate text-2xs">{payment.instrumentLabel ?? '-'}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (payment) => (
        <div>
          <StatusBadge meta={PAYMENT_STATUS_META[payment.status]} size="sm" />
          {payment.failureMessage ? (
            <p className="text-danger-600 mt-0.5 max-w-48 truncate text-2xs">
              {payment.failureMessage}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      render: (payment) => (
        <span className="text-ink text-xs font-semibold">{formatMoney(payment.amount)}</span>
      ),
    },
    {
      key: 'when',
      header: 'Initiated',
      numeric: true,
      secondary: true,
      render: (payment) => (
        <span className="text-faint text-2xs">{formatDateShort(payment.initiatedAt)}</span>
      ),
    },
  ];

  return (
    <div className="mt-6">
      <ConsoleTabs basePath="/admin/payments" param="status" current={status} tabs={TABS} />

      <p className="text-faint mt-4 text-xs">
        {total.toLocaleString('en-IN')} {total === 1 ? 'payment' : 'payments'}
      </p>

      <DataTable
        className="mt-2"
        columns={columns}
        rows={payments}
        rowKey={(payment) => payment.id}
        caption="Payments"
        empty={<TableEmpty title="No payments" body="No payments match this filter." />}
      />

      <Pager
        basePath="/admin/payments"
        params={{ status }}
        page={page}
        total={total}
        pageSize={pageSize}
      />
    </div>
  );
}
