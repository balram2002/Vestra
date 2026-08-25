import type { Metadata } from 'next';
import { Suspense } from 'react';

import { QueueBadge } from '@/components/console/queue-badge';
import { ConsoleShell } from '@/components/layout/console-shell';
import { SELLER_ACTIONABLE } from '@/domain/enums';
import { requireSeller } from '@/server/auth/session';
import { collections } from '@/server/db/collections';

export const metadata: Metadata = {
  title: { template: '%s · Seller console', default: 'Seller console' },
  robots: { index: false, follow: false },
};

/**
 * Seller console shell.
 *
 * The layout body itself reads NOTHING dynamic. Under Cache Components anything
 * that touches cookies makes its whole subtree dynamic, so a layout that awaits
 * the session would stop every page beneath it from prerendering its shell.
 *
 * Instead the nav is static and prerenders, while the two per-user pieces — the
 * store name and the queue counts — are Suspense islands that stream in. Each
 * page calls `requireSeller()` inside its own boundary, so authorisation is
 * still enforced on every screen; it just is not enforced HERE, where it would
 * cost the whole console its static shell.
 */
export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConsoleShell
      homeHref="/seller"
      title={
        <Suspense fallback={<span className="text-faint">Your store</span>}>
          <StoreName />
        </Suspense>
      }
      subtitle="Seller console"
      groups={[
        {
          label: 'Trade',
          items: [
            { href: '/seller', label: 'Dashboard' },
            {
              href: '/seller/orders',
              label: 'Orders',
              badge: (
                <Suspense fallback={null}>
                  <OrderQueueBadge />
                </Suspense>
              ),
            },
            {
              href: '/seller/shipments',
              label: 'Shipments',
              badge: (
                <Suspense fallback={null}>
                  <ShipmentQueueBadge />
                </Suspense>
              ),
            },
            {
              href: '/seller/returns',
              label: 'Returns',
              badge: (
                <Suspense fallback={null}>
                  <ReturnQueueBadge />
                </Suspense>
              ),
            },
          ],
        },
        {
          label: 'Catalogue',
          items: [
            { href: '/seller/products', label: 'Products' },
            { href: '/seller/inventory', label: 'Inventory' },
          ],
        },
        {
          label: 'Business',
          items: [
            { href: '/seller/earnings', label: 'Earnings' },
            { href: '/seller/analytics', label: 'Analytics' },
            { href: '/seller/settings', label: 'Settings' },
          ],
        },
      ]}
      accessory={
        <Suspense fallback={null}>
          <WhoAmI />
        </Suspense>
      }
    >
      {children}
    </ConsoleShell>
  );
}

async function StoreName() {
  const user = await requireSeller();
  const sellers = await collections.sellers();
  const seller = await sellers.findOne({ _id: user.sellerId }, { projection: { displayName: 1 } });
  return <>{seller?.displayName ?? 'Your store'}</>;
}

async function OrderQueueBadge() {
  const user = await requireSeller();
  const sellerOrders = await collections.sellerOrders();
  const count = await sellerOrders.countDocuments({
    sellerId: user.sellerId,
    status: { $in: SELLER_ACTIONABLE },
  });
  return <QueueBadge count={count} />;
}

/**
 * Parcels still sitting with the seller: booked but unlabelled, or labelled but
 * never handed over. Anything already with the courier is not the seller's
 * problem and would only inflate the number.
 */
async function ShipmentQueueBadge() {
  const user = await requireSeller();
  const shipments = await collections.shipments();
  const count = await shipments.countDocuments({
    sellerId: user.sellerId,
    status: { $in: ['CREATED', 'LABEL_GENERATED', 'PICKUP_SCHEDULED'] },
  });
  return <QueueBadge count={count} />;
}

/**
 * Returns and exchanges share a screen, so they share a count. An exchange
 * waiting on a decision is holding reserved stock, which makes it at least as
 * urgent as a return.
 */
async function ReturnQueueBadge() {
  const user = await requireSeller();
  const [returns, exchanges] = await Promise.all([
    collections.returns(),
    collections.exchanges(),
  ]);

  const [returnCount, exchangeCount] = await Promise.all([
    returns.countDocuments({ sellerId: user.sellerId, status: 'RETURN_REQUESTED' }),
    exchanges.countDocuments({
      sellerId: user.sellerId,
      status: { $in: ['EXCHANGE_REQUESTED', 'EXCHANGE_APPROVED'] },
    }),
  ]);

  return <QueueBadge count={returnCount + exchangeCount} />;
}

async function WhoAmI() {
  const user = await requireSeller();
  return (
    <span className="text-muted text-xs">
      {user.fullName}{' '}
      <span className="text-faint">
        · {user.activeRole === 'SELLER' ? 'Owner' : 'Staff'}
      </span>
    </span>
  );
}
