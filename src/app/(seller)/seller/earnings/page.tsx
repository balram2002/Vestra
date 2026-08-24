import type { Metadata } from 'next';
import { Suspense } from 'react';

import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { StatCard } from '@/components/console/stat-card';
import { FINANCE } from '@/config/business';
import { formatMoney, formatMoneyCompact } from '@/lib/format';
import { requireSeller } from '@/server/auth/session';
import { getSellerEarnings, type SellerEarnings } from '@/server/services/seller';

export const metadata: Metadata = { title: 'Earnings' };

/**
 * Seller finance.
 *
 * Shows the full path from what the customer paid to what lands in the bank,
 * with every deduction named. A single "payable" figure invites a support
 * ticket; the arithmetic written out does not.
 */
export default function SellerEarningsPage() {
  return (
    <>
      <h1 className="font-display text-ink text-xl">Earnings</h1>
      <p className="text-muted mt-1 text-sm">
        Money clears {FINANCE.settlementHoldDays} days after delivery, once the return window is
        safely past.
      </p>

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <Earnings />
      </Suspense>
    </>
  );
}

async function Earnings() {
  const user = await requireSeller();
  const data = await getSellerEarnings(user.sellerId);

  type MonthRow = SellerEarnings['byMonth'][number];

  const columns: Column<MonthRow>[] = [
    {
      key: 'month',
      header: 'Month',
      render: (row) => (
        <span className="text-ink text-xs font-medium">
          {new Date(`${row.month}-01`).toLocaleDateString('en-IN', {
            month: 'long',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      key: 'gross',
      header: 'Gross sales',
      numeric: true,
      render: (row) => <span className="text-ink text-xs">{formatMoney(row.gross)}</span>,
    },
    {
      key: 'commission',
      header: 'Commission',
      numeric: true,
      render: (row) => (
        <span className="text-danger-600 text-xs">− {formatMoney(row.commission)}</span>
      ),
    },
    {
      key: 'net',
      header: 'Net payable',
      numeric: true,
      render: (row) => (
        <span className="text-ink text-xs font-semibold">{formatMoney(row.net)}</span>
      ),
    },
  ];

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Gross sales" value={formatMoneyCompact(data.grossSales)} hint="lifetime" />
        <StatCard
          label="Ready to pay out"
          value={formatMoneyCompact(data.clearable)}
          hint="past the hold"
        />
        <StatCard
          label="In hold"
          value={formatMoneyCompact(data.pending)}
          hint={`clears ${FINANCE.settlementHoldDays}d after delivery`}
        />
        <StatCard
          label="Refunded"
          value={formatMoneyCompact(data.refunded)}
          goodDirection="down"
          hint="returns and cancellations"
        />
      </div>

      {/* The arithmetic, written out. */}
      <section className="border-line bg-raised rounded-lg border p-5">
        <h2 className="text-ink text-md font-semibold">How your payout is calculated</h2>

        <dl className="mt-4 max-w-md space-y-2.5 text-sm">
          <Row label="Gross sales" value={formatMoney(data.grossSales)} />
          <Row
            label={`Platform commission (${FINANCE.defaultCommissionPercent}%)`}
            value={`− ${formatMoney(data.commission)}`}
            tone="negative"
          />
          <Row
            label={`Payment gateway fee (${FINANCE.paymentGatewayFeePercent}%)`}
            value={`− ${formatMoney(data.gatewayFees)}`}
            tone="negative"
          />
          <div className="border-line border-t pt-2.5">
            <Row label="Net payable" value={formatMoney(data.netPayable)} emphasis />
          </div>
        </dl>

        <p className="text-faint mt-4 text-xs">
          TCS at {FINANCE.tcsPercent}% and TDS at {FINANCE.tdsPercent}% are deducted at settlement
          and reported against your PAN.
        </p>
      </section>

      <section>
        <h2 className="text-ink mb-2 text-md font-semibold">By month</h2>
        <DataTable
          columns={columns}
          rows={data.byMonth}
          rowKey={(row) => row.month}
          caption="Monthly earnings"
          empty={
            <TableEmpty
              title="No sales yet"
              body="Once orders start arriving, your monthly earnings appear here."
            />
          }
        />
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  emphasis,
}: {
  label: string;
  value: string;
  tone?: 'negative';
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={emphasis ? 'text-ink font-semibold' : 'text-muted'}>{label}</dt>
      <dd
        className={[
          'tabular',
          emphasis ? 'text-ink font-semibold' : tone === 'negative' ? 'text-danger-600' : 'text-ink',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}
