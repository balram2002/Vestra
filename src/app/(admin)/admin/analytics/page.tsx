import type { Metadata } from 'next';
import { PageHeader } from '@/components/console/page-header';
import { Card } from '@/components/ui/card';
import { Suspense } from 'react';

import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { RevenueChart } from '@/components/console/revenue-chart';
import { StatCard } from '@/components/console/stat-card';
import { FINANCE } from '@/config/business';
import { formatMoney, formatMoneyCompact } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { getAdminDashboard, getPlatformFinance, type PlatformFinance } from '@/server/services/admin';

export const metadata: Metadata = { title: 'Analytics' };

/**
 * Platform finance and trade.
 *
 * The distinction that matters here and is easy to blur: GMV is what customers
 * paid, and it is NOT the platform's revenue. What the platform keeps is
 * commission, less the commission it gave back on refunds. Both are shown, and
 * labelled so they cannot be confused with each other.
 */
export default function AdminAnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Trade, revenue and what the platform actually keeps."
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <Analytics />
      </Suspense>
    </>
  );
}

async function Analytics() {
  await requirePermission('analytics:read');

  const [dashboard, finance] = await Promise.all([
    getAdminDashboard(90),
    getPlatformFinance(),
  ]);

  type MonthRow = PlatformFinance['byMonth'][number];

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
      key: 'gmv',
      header: 'GMV',
      numeric: true,
      render: (row) => <span className="text-ink text-xs">{formatMoney(row.gmv)}</span>,
    },
    {
      key: 'commission',
      header: 'Commission',
      numeric: true,
      render: (row) => (
        <span className="text-success-600 text-xs font-semibold">
          {formatMoney(row.commission)}
        </span>
      ),
    },
    {
      key: 'refunds',
      header: 'Refunded',
      numeric: true,
      render: (row) => (
        <span className="text-danger-600 text-xs">
          {row.refunds > 0 ? formatMoney(row.refunds) : '-'}
        </span>
      ),
    },
  ];

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="GMV"
          value={formatMoneyCompact(dashboard.gmv.current)}
          delta={dashboard.gmv.delta}
          hint="last 90 days"
        />
        <StatCard
          label="Platform revenue"
          value={formatMoneyCompact(finance.netRevenue)}
          hint="commission, net of refunds"
        />
        <StatCard
          label="Owed to sellers"
          value={formatMoneyCompact(finance.payableToSellers)}
          hint="lifetime, before payout"
        />
        <StatCard
          label="Refunded"
          value={formatMoneyCompact(finance.refunded)}
          goodDirection="down"
        />
      </div>

      <Card as="section">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-ink text-md font-semibold">GMV over time</h2>
          <p className="text-faint text-xs">Daily, last 90 days</p>
        </div>
        <RevenueChart data={dashboard.trend} className="mt-4 h-72" />
      </Card>

      <Card as="section">
        <h2 className="text-ink text-md font-semibold">Where the money goes</h2>
        <p className="text-muted mt-1 text-xs">
          Lifetime, across every seller. GMV is what customers paid; the platform keeps only the
          commission line.
        </p>

        <dl className="mt-4 max-w-md space-y-2.5 text-sm">
          <Row label="Gross merchandise value" value={formatMoney(finance.gmv)} />
          <Row
            label={`Paid to sellers`}
            value={`- ${formatMoney(finance.payableToSellers)}`}
            tone="negative"
          />
          <Row
            label={`Payment gateway fees (${FINANCE.paymentGatewayFeePercent}%)`}
            value={`- ${formatMoney(finance.gatewayFees)}`}
            tone="negative"
          />
          <div className="border-line border-t pt-2.5">
            <Row
              label={`Platform commission (${FINANCE.defaultCommissionPercent}%)`}
              value={formatMoney(finance.commission)}
              emphasis
            />
          </div>
        </dl>
      </Card>

      <section>
        <h2 className="text-ink mb-2 text-md font-semibold">By month</h2>
        <DataTable
          columns={columns}
          rows={finance.byMonth}
          rowKey={(row) => row.month}
          caption="Monthly platform finance"
          empty={<TableEmpty title="No trade yet" body="Monthly figures appear once orders land." />}
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
          emphasis
            ? 'text-success-600 font-semibold'
            : tone === 'negative'
              ? 'text-danger-600'
              : 'text-ink',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}
