import { ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/console/page-header';
import { Card } from '@/components/ui/card';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { RevenueChart } from '@/components/console/revenue-chart';
import { StatCard } from '@/components/console/stat-card';
import { formatCompactNumber, formatMoney, formatMoneyCompact } from '@/lib/format';
import { hasPermission, STAFF_ROLES } from '@/server/auth/rbac';
import { requireAnyRole } from '@/server/auth/session';
import { getAdminDashboard } from '@/server/services/admin';

export const metadata: Metadata = { title: 'Dashboard' };

export default function AdminDashboardPage() {
  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Last 30 days, against the 30 before it."
      />

      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

async function Dashboard() {
  /*
   * The dashboard is where every staff role LANDS after signing in, so it must
   * never refuse them outright — a Support agent redirected here and then shown
   * a 403 has been given a broken app.
   *
   * Instead it adapts: the work queues are visible to any staff role, and the
   * commercial figures are gated on `analytics:read`. That way each role sees
   * their own job on arrival rather than someone else's numbers or an error.
   */
  const user = await requireAnyRole(STAFF_ROLES);
  const canReadAnalytics = hasPermission(user.permissions, 'analytics:read');
  const data = await getAdminDashboard();

  const queues = [
    {
      href: '/admin/products?status=PENDING_REVIEW',
      count: data.pendingProducts,
      label: 'listings awaiting review',
    },
    {
      href: '/admin/sellers?status=KYC_PENDING',
      count: data.pendingSellers,
      label: 'sellers awaiting KYC',
    },
    { href: '/admin/returns', count: data.openReturns, label: 'returns open' },
    {
      href: '/admin/payments?status=FAILED',
      count: data.failedPayments,
      label: 'payments failed this month',
    },
  ].filter((queue) => queue.count > 0);

  return (
    <div className="mt-6 space-y-6">
      {/* Queues before figures: what needs a decision outranks what happened. */}
      {queues.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {queues.map((queue) => (
            <li key={queue.href}>
              <Link
                href={queue.href}
                className="border-line bg-raised hover:border-ink group flex items-center gap-3 rounded-lg border p-4 transition-colors"
              >
                <span className="text-ink tabular text-2xl font-semibold">{queue.count}</span>
                <span className="text-muted min-w-0 flex-1 text-xs">{queue.label}</span>
                <ArrowRight className="text-faint size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {canReadAnalytics ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {/*
            Same trailing-30-day series the chart below plots, so the tile shows
            the shape of the period rather than only its endpoint.
          */}
          <StatCard
            label="GMV"
            value={formatMoneyCompact(data.gmv.current)}
            delta={data.gmv.delta}
            hint="gross merchandise value"
            series={data.trend.map((day) => day.revenue)}
          />
          <StatCard
            label="Orders"
            value={formatCompactNumber(data.orders.current)}
            delta={data.orders.delta}
            series={data.trend.map((day) => day.orders)}
          />
          <StatCard label="Average order" value={formatMoney(data.averageOrderValue)} />
          <StatCard
            label="Commission earned"
            value={formatMoneyCompact(data.commission)}
            hint="platform revenue"
          />
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Customers"
          value={formatCompactNumber(data.customers)}
          hint={`+${data.newCustomers} new`}
        />
        <StatCard label="Active sellers" value={String(data.activeSellers)} />
        <StatCard label="Live listings" value={formatCompactNumber(data.liveProducts)} />
        <StatCard
          label="Refunded"
          value={formatMoneyCompact(data.refunds)}
          goodDirection="down"
          hint="returns and cancellations"
        />
      </div>

      {canReadAnalytics ? (
        <Card as="section">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-ink text-md font-semibold">GMV</h2>
            <p className="text-faint text-xs">Daily, last 30 days</p>
          </div>
          <RevenueChart data={data.trend} className="mt-4" />
        </Card>
      ) : null}

      {canReadAnalytics ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Leaderboard
          title="Top sellers"
          href="/admin/sellers"
          rows={data.topSellers.map((seller) => ({
            id: seller.sellerId,
            label: seller.name,
            meta: `${seller.orders} orders`,
            value: formatMoney(seller.gmv),
          }))}
        />

        <Leaderboard
          title="Top categories"
          href="/admin/categories"
          rows={data.topCategories.map((category) => ({
            id: category.categoryId,
            label: category.name,
            meta: `${category.units} units`,
            value: formatMoney(category.revenue),
          }))}
          />
        </div>
      ) : null}
    </div>
  );
}

function Leaderboard({
  title,
  href,
  rows,
}: {
  title: string;
  href: string;
  rows: Array<{ id: string; label: string; meta: string; value: string }>;
}) {
  return (
    <Card as="section" pad="none">
      <div className="border-line flex items-center justify-between border-b px-4 py-3.5 sm:px-5">
        <h2 className="text-ink text-md font-semibold">{title}</h2>
        <Link
          href={href}
          className="text-muted hover:text-ink inline-flex min-h-11 min-w-11 items-center justify-end text-xs lg:min-h-0 lg:min-w-0"
        >
          See all
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted px-4 py-8 text-center text-sm sm:px-5">Nothing in this period.</p>
      ) : (
        <ol className="divide-line divide-y">
          {rows.map((row, index) => (
            /*
              At 320px this row overflowed the page by 10px, measured by
              `audit-layout.mjs`. Three unshrinkable columns plus a fixed 6rem
              value column left the label nothing to give back, and `truncate`
              on the label cannot rescue a row whose siblings refuse to yield.
              The meta is context rather than identity, so it is the one that
              goes; the value keeps its fixed width only once there is room for
              it, so a column of money still aligns on every screen that has the
              space to align it.
            */
            <li key={row.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <span className="text-faint tabular w-5 shrink-0 text-xs">{index + 1}</span>
              <span className="text-ink min-w-0 flex-1 truncate text-sm">{row.label}</span>
              <span className="text-faint tabular hidden shrink-0 text-xs sm:block">
                {row.meta}
              </span>
              <span className="text-ink tabular shrink-0 text-right text-sm font-semibold sm:w-24">
                {row.value}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mt-6 space-y-6" aria-hidden>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-28 rounded-lg" />
        ))}
      </div>
      <div className="skeleton h-64 rounded-lg" />
    </div>
  );
}
