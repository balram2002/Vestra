import type { Metadata } from 'next';
import { Suspense } from 'react';

import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { Badge } from '@/components/ui/badge';
import type { Coupon } from '@/domain/types';
import { formatDateShort, formatMoney } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Coupons' };

/**
 * Coupon list.
 *
 * "Live" is computed from the window and the active flag rather than read from
 * a stored status, because a coupon whose end date has passed is expired
 * whether or not anyone remembered to switch it off.
 */
export default function AdminCouponsPage() {
  return (
    <>
      <h1 className="font-display text-ink text-xl">Coupons</h1>
      <p className="text-muted mt-1 text-sm">
        Discount codes, their rules and how much they have been used.
      </p>

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <CouponTable />
      </Suspense>
    </>
  );
}

async function CouponTable() {
  await requirePermission('coupon:read');

  const couponCol = await collections.coupons();
  const coupons = toEntities(await couponCol.find({}).sort({ createdAt: -1 }).toArray());

  const now = new Date().toISOString();

  const columns: Column<Coupon>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (coupon) => (
        <div className="min-w-0">
          <p className="text-ink tabular text-xs font-semibold">{coupon.code}</p>
          <p className="text-faint truncate text-2xs">{coupon.title}</p>
        </div>
      ),
    },
    {
      key: 'value',
      header: 'Discount',
      render: (coupon) => (
        <span className="text-ink text-xs">
          {coupon.type === 'PERCENTAGE'
            ? `${coupon.value}%${coupon.maxDiscount ? ` up to ${formatMoney(coupon.maxDiscount)}` : ''}`
            : coupon.type === 'FIXED'
              ? formatMoney(coupon.value)
              : coupon.type === 'FREE_SHIPPING'
                ? 'Free delivery'
                : 'Buy X get Y'}
        </span>
      ),
    },
    {
      key: 'scope',
      header: 'Scope',
      secondary: true,
      render: (coupon) => (
        <span className="text-muted text-xs">{coupon.scope.toLowerCase()}</span>
      ),
    },
    {
      key: 'min',
      header: 'Min cart',
      numeric: true,
      secondary: true,
      render: (coupon) => (
        <span className="text-muted text-xs">
          {coupon.minCartValue > 0 ? formatMoney(coupon.minCartValue) : '-'}
        </span>
      ),
    },
    {
      key: 'usage',
      header: 'Used',
      numeric: true,
      render: (coupon) => (
        <span className="text-ink text-xs">
          {coupon.usedCount}
          {coupon.totalUsageLimit ? (
            <span className="text-faint"> / {coupon.totalUsageLimit}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'window',
      header: 'Window',
      secondary: true,
      render: (coupon) => (
        <span className="text-faint text-2xs">
          {formatDateShort(coupon.startsAt)} - {formatDateShort(coupon.endsAt)}
        </span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (coupon) => {
        const live = coupon.isActive && coupon.startsAt <= now && coupon.endsAt >= now;
        const expired = coupon.endsAt < now;
        return (
          <Badge tone={live ? 'success' : expired ? 'neutral' : 'warning'} size="sm">
            {live ? 'Live' : expired ? 'Expired' : 'Scheduled'}
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="mt-6">
      <DataTable
        columns={columns}
        rows={coupons}
        rowKey={(coupon) => coupon.id}
        caption="Coupons"
        empty={<TableEmpty title="No coupons" body="Create one to start running offers." />}
      />
    </div>
  );
}
