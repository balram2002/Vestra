import { AlertTriangle, ArrowRight, PackageX } from 'lucide-react';
import { PageHeader } from '@/components/console/page-header';
import { Card } from '@/components/ui/card';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { RevenueChart } from '@/components/console/revenue-chart';
import { StatCard } from '@/components/console/stat-card';
import { SetupChecklist } from '@/components/seller/setup-checklist';
import { requireSeller } from '@/server/auth/session';
import { formatMoneyCompact, formatMoney, formatCompactNumber } from '@/lib/format';
import { getLiveStats } from '@/server/services/live';
import { getSetupChecklist } from '@/server/services/onboarding';
import { getSellerDashboard } from '@/server/services/seller';

export const metadata: Metadata = { title: 'Dashboard' };

export default function SellerDashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your last 30 days, against the 30 before it."
      />

      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

async function Dashboard() {
  const user = await requireSeller();

  /*
   * Fetched together, because they are independent.
   *
   * The live figures come from their own collections and share nothing with the
   * order dashboard, so awaiting them in sequence would add a round trip to the
   * slowest screen in the console for no reason.
   */
  const [data, live, setup] = await Promise.all([
    getSellerDashboard(user.sellerId),
    getLiveStats(user.sellerId),
    getSetupChecklist(user.sellerId),
  ]);

  if (!data) return null;

  return (
    <div className="mt-6 space-y-6">
      <SetupChecklist items={setup} />

      {/*
        Work that needs doing comes FIRST, above the revenue figures. A seller
        opening this screen needs to know what is late before they know what
        they earned; revenue is a report, a breached SLA is a job.
      */}
      {data.breaching > 0 || data.outOfStock > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.breaching > 0 ? (
            <Link
              href="/seller/orders?status=ACTION"
              className="border-danger-100 bg-danger-50 hover:border-danger-300 group flex items-start gap-3 rounded-lg border p-4 transition-colors"
            >
              <AlertTriangle className="text-danger-600 mt-0.5 size-5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-danger-700 text-sm font-semibold">
                  {data.breaching} {data.breaching === 1 ? 'order is' : 'orders are'} past their
                  dispatch promise
                </p>
                <p className="text-danger-700/80 mt-0.5 text-xs">
                  Late dispatch costs you the fulfilment score that decides your search ranking.
                </p>
              </div>
              <ArrowRight className="text-danger-600 mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : null}

          {data.outOfStock > 0 ? (
            <Link
              href="/seller/inventory?filter=OUT"
              className="border-warning-100 bg-warning-50 hover:border-warning-300 group flex items-start gap-3 rounded-lg border p-4 transition-colors"
            >
              <PackageX className="text-warning-700 mt-0.5 size-5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-warning-700 text-sm font-semibold">
                  {data.outOfStock} {data.outOfStock === 1 ? 'size is' : 'sizes are'} out of stock
                </p>
                <p className="text-warning-700/80 mt-0.5 text-xs">
                  {data.lowStock > 0 ? `${data.lowStock} more are running low. ` : ''}
                  Out-of-stock sizes still appear in search but cannot be bought.
                </p>
              </div>
              <ArrowRight className="text-warning-700 mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/*
          The sparkline reads the trend the dashboard already computes.

          `data.trend` is thirty daily buckets, oldest first — the same series
          the revenue chart below plots. Passing it here costs no extra query
          and turns a bare number into a shape: "₹4.2L, up 12%" says the period
          was good, and the line says whether it was steady or one enormous
          Tuesday.
        */}
        <StatCard
          label="Revenue"
          value={formatMoneyCompact(data.revenue.current)}
          delta={data.revenue.delta}
          hint="last 30 days"
          series={data.trend.map((day) => day.revenue)}
        />
        <StatCard
          label="Orders"
          value={formatCompactNumber(data.orders.current)}
          delta={data.orders.delta}
          hint={`${data.units} units`}
          series={data.trend.map((day) => day.orders)}
        />
        <StatCard
          label="Average order"
          value={formatMoney(data.averageOrderValue)}
          hint="per order"
        />
        <StatCard
          label="Return rate"
          value={`${data.returnRate}%`}
          goodDirection="down"
          hint={`${data.liveProducts} live styles`}
        />
      </div>

      {/*
        Live commerce, and only once there is something to say.
        
        A shop that has never taken a live call sees nothing here rather than a
        row of zeroes — four empty tiles on the main dashboard would read as a
        broken feature rather than an unused one, and they would push the
        revenue chart below the fold to say it.
      */}
      {live.sessions > 0 || live.missed > 0 ? (
        <section>
          <h2 className="eyebrow mb-3">Live commerce · last 30 days</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Calls taken" value={String(live.sessions)} hint="answered" />
            <StatCard label="Sold on a call" value={String(live.purchased)} hint="orders" />
            <StatCard
              /*
               * Null when there were no calls, rather than 0%.
               *
               * "0%" reads as a failure to convert; having taken no calls is
               * not that, and the tile says so by showing a dash.
               */
              label="Live conversion"
              value={live.conversionRate === null ? '—' : `${live.conversionRate}%`}
              hint="of calls taken"
            />
            <StatCard
              label="Missed calls"
              value={String(live.missed)}
              goodDirection="down"
              hint="rang out unanswered"
            />
          </div>
        </section>
      ) : null}

      <Card as="section">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-ink text-md font-semibold">Revenue</h2>
          <p className="text-faint text-xs">Daily, last 30 days</p>
        </div>
        <RevenueChart data={data.trend} className="mt-4" />
      </Card>

      <Card as="section" pad="none">
        <div className="border-line flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="text-ink text-md font-semibold">Best sellers</h2>
          <Link
            href="/seller/analytics"
            className="text-muted hover:text-ink inline-flex min-h-11 items-center text-xs lg:min-h-0"
          >
            All analytics
          </Link>
        </div>

        {data.topProducts.length === 0 ? (
          <p className="text-muted px-5 py-8 text-center text-sm">
            Nothing sold in the last 30 days yet.
          </p>
        ) : (
          <ol className="divide-line divide-y">
            {data.topProducts.map((product, index) => (
              <li key={product.productId} className="flex items-center gap-3 px-5 py-3">
                <span className="text-faint tabular w-5 shrink-0 text-xs">{index + 1}</span>
                <span className="text-ink min-w-0 flex-1 truncate text-sm">{product.title}</span>
                <span className="text-faint tabular shrink-0 text-xs">{product.units} units</span>
                <span className="text-ink tabular w-24 shrink-0 text-right text-sm font-semibold">
                  {formatMoney(product.revenue)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
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
      <div className="skeleton h-64 rounded-lg" />
    </div>
  );
}
