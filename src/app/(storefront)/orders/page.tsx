import { Package } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { Button } from '@/components/ui/button';
import { collections } from '@/server/db/collections';
import { requireUser } from '@/server/auth/session';

export const metadata: Metadata = {
  title: 'Your orders',
  robots: { index: false, follow: false },
};

/**
 * Order history.
 *
 * Reads straight from the orders collection scoped to the signed-in user — the
 * user id comes from the session, never from a request parameter, so one
 * customer can never request another's history.
 */
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

  const orders = await collections.orders();
  const count = await orders.countDocuments({ userId: user.id });

  return (
    <>

      {count === 0 ? (
        <div className="border-line mt-8 flex flex-col items-center rounded-lg border border-dashed px-6 py-20 text-center">
          <Package className="text-faint size-9" aria-hidden />
          <h2 className="text-ink mt-4 text-lg font-semibold">No orders yet</h2>
          <p className="text-muted mt-1.5 max-w-sm text-sm">
            When you place an order it appears here, with live tracking from dispatch to delivery.
          </p>
          <Button asChild className="mt-6">
            <Link href="/">Start shopping</Link>
          </Button>
        </div>
      ) : null}
    </>
  );
}

function OrdersSkeleton() {
  return (
    <div className="mt-6 space-y-3" aria-hidden>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="skeleton h-28 rounded-lg" />
      ))}
    </div>
  );
}
