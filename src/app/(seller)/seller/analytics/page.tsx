import type { Metadata } from 'next';
import { PageHeader } from '@/components/console/page-header';
import { Card } from '@/components/ui/card';
import { Suspense } from 'react';

import { RevenueChart } from '@/components/console/revenue-chart';
import { StatCard } from '@/components/console/stat-card';
import { formatCompactNumber, formatMoney, formatMoneyCompact } from '@/lib/format';
import { requireSeller } from '@/server/auth/session';
import { getSellerDashboard } from '@/server/services/seller';

export const metadata: Metadata = { title: 'Analytics' };

export default function SellerAnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="How your store is trading over the last 90 days."
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <Analytics />
      </Suspense>
    </>
  );
}

async function Analytics() {
  const user = await requireSeller();
  const data = await getSellerDashboard(user.sellerId, 90);
  if (!data) return null;

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatMoneyCompact(data.revenue.current)}
          delta={data.revenue.delta}
          hint="last 90 days"
        />
        <StatCard
          label="Orders"
          value={formatCompactNumber(data.orders.current)}
          delta={data.orders.delta}
          hint={`${data.units} units`}
        />
        <StatCard label="Average order" value={formatMoney(data.averageOrderValue)} />
        <StatCard
          label="Return rate"
          value={`${data.returnRate}%`}
          goodDirection="down"
          hint="of dispatched units"
        />
      </div>

      <Card as="section">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-ink text-md font-semibold">Revenue over time</h2>
          <p className="text-faint text-xs">Daily, last 90 days</p>
        </div>
        <RevenueChart data={data.trend} className="mt-4 h-72" />
      </Card>

      <Card as="section" pad="none">
        <div className="border-line border-b px-5 py-3.5">
          <h2 className="text-ink text-md font-semibold">Top styles by revenue</h2>
        </div>

        {data.topProducts.length === 0 ? (
          <p className="text-muted px-5 py-8 text-center text-sm">Nothing sold in this period.</p>
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
