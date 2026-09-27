import { Copy } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { CouponToggle } from '@/components/console/admin-actions';
import { CampaignBadge } from '@/components/console/campaigns/campaign-badge';
import { CouponArchive } from '@/components/console/coupons/coupon-archive';
import { CouponEditor } from '@/components/console/coupons/coupon-editor';
import { PageHeader } from '@/components/console/page-header';
import { StatCard } from '@/components/console/stat-card';
import { Button } from '@/components/ui/button';
import { formatDateShort, formatMoney } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { couponDraftFrom, getCouponEditor } from '@/server/services/coupons-admin';

export const metadata: Metadata = { title: 'Coupon' };

type Params = Promise<{ id: string }>;

/**
 * One coupon: how it is doing, then its rules.
 *
 * Performance first, because the usual reason to open a coupon is "is it
 * working?" -- and the answer decides whether to edit it at all.
 */
export default function CouponPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="skeleton mt-6 h-[40rem] rounded-lg" aria-hidden />}>
      <Coupon params={params} />
    </Suspense>
  );
}

async function Coupon({ params }: { params: Params }) {
  await requirePermission('coupon:write');
  const { id } = await params;
  const data = await getCouponEditor(id);
  if (!data) notFound();
  const { coupon, row, insight, targets } = data;

  return (
    <>
      <PageHeader
        back={{ href: '/admin/coupons', label: 'Coupons' }}
        title={coupon.code}
        description={row.summary}
        meta={<CampaignBadge status={row.status} archived={row.archived} />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!row.archived && row.status !== 'expired' ? (
              <CouponToggle couponId={coupon.id} code={coupon.code} isActive={coupon.isActive} />
            ) : null}
            <Button asChild size="sm" variant="secondary">
              <Link href={`/admin/coupons/new?from=${coupon.id}`}>
                <Copy className="size-4" aria-hidden />
                Duplicate
              </Link>
            </Button>
            <CouponArchive couponId={coupon.id} code={coupon.code} archived={row.archived} />
          </div>
        }
      />

      <section aria-label="Performance" className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Redemptions" value={insight.redemptions.toLocaleString('en-IN')} hint="Last 30 days shown" series={insight.series} />
          <StatCard label="Discount given" value={formatMoney(insight.discountGiven)} hint="Across every order that used it" />
          <StatCard label="Revenue influenced" value={formatMoney(insight.revenue)} hint="What those orders paid" />
          <StatCard label="Average order" value={formatMoney(insight.averageOrder)} hint="With this coupon" />
        </div>

        {insight.recent.length > 0 ? (
          <div className="border-line bg-raised rounded-lg border">
            <h2 className="text-ink border-line border-b px-4 py-3 text-sm font-semibold sm:px-5">Latest uses</h2>
            <ul className="divide-line divide-y">
              {insight.recent.map((use) => (
                <li key={`${use.orderNumber}-${use.at}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-xs sm:px-5">
                  <span className="text-ink tabular font-mono font-medium">{use.orderNumber}</span>
                  <span className="text-muted min-w-0 flex-1 truncate">{use.customer}</span>
                  <span className="text-ink tabular">−{formatMoney(use.discount)}</span>
                  <span className="text-faint">{formatDateShort(use.at)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <CouponEditor id={coupon.id} initial={couponDraftFrom(coupon)} targets={targets} usedCount={coupon.usedCount} />
    </>
  );
}
