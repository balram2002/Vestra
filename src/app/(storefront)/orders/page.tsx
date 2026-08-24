import { Package } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FULFILLMENT_STATUS_META } from '@/domain/enums';
import { formatDate, formatMoney } from '@/lib/format';
import { requireUser } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';
import { listOrders } from '@/server/services/orders';

export const metadata: Metadata = {
  title: 'Your orders',
  robots: { index: false, follow: false },
};

export default function OrdersPage() {
  return (
    <div className="gutter shell-max py-6">
      <h1 className="font-display text-ink text-2xl">Your orders</h1>

      <Suspense fallback={<OrdersSkeleton />}>
        <OrderList />
      </Suspense>
    </div>
  );
}

async function OrderList() {
  const user = await requireUser();
  const orders = await listOrders(user.id);

  if (orders.length === 0) {
    return (
      <div className="border-line mt-8 rounded-lg border border-dashed p-12 text-center">
        <Package className="text-faint mx-auto size-8" aria-hidden strokeWidth={1.5} />
        <p className="text-ink mt-4 text-lg font-medium">No orders yet</p>
        <p className="text-muted mx-auto mt-1.5 max-w-sm text-sm">
          When you place an order it will appear here, with live tracking for every parcel.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Start shopping</Link>
        </Button>
      </div>
    );
  }

  // One query for every line across every order, rather than one per order.
  const itemCol = await collections.orderItems();
  const items = toEntities(
    await itemCol.find({ orderId: { $in: orders.map((o) => o.id) } }).toArray(),
  );

  const byOrder = new Map<string, typeof items>();
  for (const item of items) {
    byOrder.set(item.orderId, [...(byOrder.get(item.orderId) ?? []), item]);
  }

  return (
    <ul className="mt-8 space-y-4">
      {orders.map((order) => {
        const lines = byOrder.get(order.id) ?? [];

        return (
          <li key={order.id}>
            <Link
              href={`/orders/${order.id}`}
              className="border-line hover:border-ink group block rounded-lg border p-5 transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-ink tabular text-sm font-semibold">{order.orderNumber}</p>
                  <p className="text-muted mt-0.5 text-xs">
                    Placed {formatDate(order.placedAt)} · {lines.length}{' '}
                    {lines.length === 1 ? 'item' : 'items'}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <StatusBadge meta={FULFILLMENT_STATUS_META[order.status]} size="sm" />
                  <span className="text-ink tabular text-sm font-semibold">
                    {formatMoney(order.pricing.payable)}
                  </span>
                </div>
              </div>

              {/* A row of thumbnails identifies an order far faster than its
                  number does. */}
              <div className="mt-4 flex items-center gap-2">
                {lines.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="bg-sunken relative aspect-3/4 w-12 overflow-hidden rounded-sm"
                  >
                    <Image
                      src={item.imageUrl}
                      alt={item.productTitle}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  </div>
                ))}
                {lines.length > 5 ? (
                  <span className="text-faint text-xs">+{lines.length - 5} more</span>
                ) : null}
              </div>

              {order.estimatedDeliveryTo && order.status !== 'DELIVERED' ? (
                <p className="text-muted mt-3 text-xs">
                  Arriving by {formatDate(order.estimatedDeliveryTo)}
                </p>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function OrdersSkeleton() {
  return (
    <ul className="mt-8 space-y-4" aria-hidden>
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i} className="skeleton h-40 rounded-lg" />
      ))}
    </ul>
  );
}
