import { AlertTriangle, ArrowRight, PackageX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { RevenueChart } from '@/components/console/revenue-chart';
import { StatCard } from '@/components/console/stat-card';
import { requireSeller } from '@/server/auth/session';
import { formatMoneyCompact, formatMoney, formatCompactNumber } from '@/lib/format';
import { getSellerDashboard } from '@/server/services/seller';

export const metadata: Metadata = { title: 'Dashboard' };

export default function SellerDashboardPage() {
  return (
    <>
      <h1 className="font-display text-ink text-xl">Dashboard</h1>
      <p className="text-muted mt-1 text-sm">Your last 30 days, against the 30 before it.</p>

      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

async function Dashboard() {
  const user = await requireSeller();
  const data = await getSellerDashboard(user.sellerId);
  if (!data) return null;

  return (
    <div className="mt-6 space-y-6">
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
        <StatCard
          label="Revenue"
          value={formatMoneyCompact(data.revenue.current)}
          delta={data.revenue.delta}
          hint="last 30 days"
        />
        <StatCard
          label="Orders"
          value={formatCompactNumber(data.orders.current)}
          delta={data.orders.delta}
          hint={`${data.units} units`}
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

      <section className="border-line bg-raised rounded-lg border p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-ink text-md font-semibold">Revenue</h2>
          <p className="text-faint text-xs">Daily, last 30 days</p>
        </div>
        <RevenueChart data={data.trend} className="mt-4" />
      </section>

      <section className="border-line bg-raised rounded-lg border">
        <div className="border-line flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="text-ink text-md font-semibold">Best sellers</h2>
          <Link href="/seller/analytics" className="text-muted hover:text-ink text-xs">
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
      </section>
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
