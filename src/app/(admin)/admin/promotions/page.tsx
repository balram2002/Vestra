import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PromotionToggle } from '@/components/console/admin-actions';
import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { Badge } from '@/components/ui/badge';
import type { Promotion } from '@/domain/types';
import { formatDateShort, formatMoney } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Promotions' };

/**
 * Automatic offers.
 *
 * Separate from coupons because they behave differently: nobody types a code,
 * so switching one on changes what every shopper pays on their next page view.
 * "Live" is therefore computed from the window AND the flag — a promotion whose
 * end date has passed is over whether or not anyone remembered to switch it off.
 */
export default function AdminPromotionsPage() {
  return (
    <>
      <h1 className="font-display text-ink text-xl">Promotions</h1>
      <p className="text-muted mt-1 text-sm">
        Offers that apply on their own, with no code. Only the best one applies to any item.
      </p>

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <PromotionTable />
      </Suspense>
    </>
  );
}

async function PromotionTable() {
  const user = await requirePermission('coupon:read');
  const canWrite = user.permissions.includes('promotion:write');

  const promotionCol = await collections.promotions();
  const promotions = toEntities(
    await promotionCol.find({}).sort({ priority: -1, createdAt: -1 }).toArray(),
  );

  const now = new Date().toISOString();

  const columns: Column<Promotion>[] = [
    {
      key: 'promotion',
      header: 'Offer',
      render: (promotion) => (
        <div className="min-w-0">
          <p className="text-ink truncate text-xs font-medium">{promotion.title}</p>
          <p className="text-faint mt-0.5 truncate text-2xs">{promotion.description}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      secondary: true,
      render: (promotion) => (
        <span className="text-muted text-2xs uppercase tracking-[0.1em]">
          {promotion.type.replace(/_/g, ' ').toLowerCase()}
        </span>
      ),
    },
    {
      key: 'value',
      header: 'Discount',
      numeric: true,
      render: (promotion) => (
        <div>
          <p className="text-ink tabular text-xs font-medium">
            {promotion.type === 'FLAT_DISCOUNT' || promotion.type === 'SELLER_OFFER'
              ? formatMoney(promotion.value)
              : promotion.type === 'BUY_X_GET_Y'
                ? `${promotion.buyXGetY?.buyQuantity ?? 0}+${promotion.buyXGetY?.getQuantity ?? 0}`
                : `${promotion.value}%`}
          </p>
          {promotion.maxDiscount ? (
            <p className="text-faint text-2xs">max {formatMoney(promotion.maxDiscount)}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'window',
      header: 'Runs',
      secondary: true,
      render: (promotion) => (
        <span className="text-muted text-xs">
          {formatDateShort(promotion.startsAt)} – {formatDateShort(promotion.endsAt)}
        </span>
      ),
    },
    {
      key: 'funding',
      header: 'Funded by',
      secondary: true,
      render: (promotion) => (
        <span className="text-muted text-xs">
          {promotion.fundedBy === 'SELLER' ? 'Seller' : 'Vestra'}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Allocation',
      secondary: true,
      render: (promotion) =>
        promotion.stockLimit === null ? (
          <span className="text-faint text-xs">Unlimited</span>
        ) : (
          <span className="text-ink tabular text-xs">
            {promotion.stockSold} / {promotion.stockLimit}
          </span>
        ),
    },
    {
      key: 'state',
      header: 'State',
      render: (promotion) => {
        // Live means active AND inside its window. A flag alone is a lie.
        const started = promotion.startsAt <= now;
        const ended = promotion.endsAt < now;
        const exhausted =
          promotion.stockLimit !== null && promotion.stockSold >= promotion.stockLimit;

        if (!promotion.isActive) return <Badge tone="neutral">Paused</Badge>;
        if (ended) return <Badge tone="neutral">Ended</Badge>;
        if (!started) return <Badge tone="info">Scheduled</Badge>;
        if (exhausted) return <Badge tone="warning">Sold out</Badge>;
        return <Badge tone="success">Live</Badge>;
      },
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            render: (promotion: Promotion) => (
              <PromotionToggle
                promotionId={promotion.id}
                title={promotion.title}
                isActive={promotion.isActive}
              />
            ),
          } satisfies Column<Promotion>,
        ]
      : []),
  ];

  return (
    <DataTable
      className="mt-6"
      columns={columns}
      rows={promotions}
      rowKey={(promotion) => promotion.id}
      caption="Promotions"
      empty={
        <TableEmpty
          title="No promotions"
          body="Automatic offers appear here once marketing creates them."
        />
      }
    />
  );
}
