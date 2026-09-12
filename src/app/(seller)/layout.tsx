import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  Package,
  Receipt,
  RotateCcw,
  Settings,
  ShoppingCart,
  Truck,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { QueueBadge } from '@/components/console/queue-badge';
import { SellerLiveDesk } from '@/components/live/seller-live-desk';
import { ConsoleShell } from '@/components/layout/console-shell';
import { ConsoleUserMenu } from '@/components/layout/console-user-menu';
import { Avatar } from '@/components/ui/avatar';
import { SELLER_ACTIONABLE } from '@/domain/enums';
import { requireSellerAccount } from '@/server/auth/session';
import { isStaffRole } from '@/server/auth/rbac';
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
      brand={
        <Suspense fallback={<span className="skeleton size-8 rounded-lg" aria-hidden />}>
          <StoreBrand />
        </Suspense>
      }
      title={
        <Suspense fallback={<span className="text-faint">Your store</span>}>
          <StoreName />
        </Suspense>
      }
      subtitle="Seller console"
      user={
        <Suspense fallback={<UserSkeleton />}>
          <SellerUser />
        </Suspense>
      }
      headerEnd={
        /*
          The live switch, and nothing else, in the header.

          It is on EVERY seller screen because a shopkeeper who has gone live is
          packing orders or updating stock, not waiting on one page. It is one
          compact row now: the call cards it raises portal themselves to the
          corner of the viewport, and the signed-in name moved to the rail's
          user menu. Together those were what pushed the old header's content
          below the header.
        */
        <Suspense fallback={<span className="skeleton h-9 w-24 rounded-full" aria-hidden />}>
          <LiveDesk />
        </Suspense>
      }
      groups={[
        {
          label: 'Trade',
          items: [
            { href: '/seller', label: 'Dashboard', icon: <LayoutDashboard aria-hidden /> },
            {
              href: '/seller/orders',
              label: 'Orders',
              icon: <ShoppingCart aria-hidden />,
              badge: (
                <Suspense fallback={null}>
                  <OrderQueueBadge />
                </Suspense>
              ),
            },
            {
              href: '/seller/shipments',
              label: 'Shipments',
              icon: <Truck aria-hidden />,
              badge: (
                <Suspense fallback={null}>
                  <ShipmentQueueBadge />
                </Suspense>
              ),
            },
            {
              href: '/seller/returns',
              label: 'Returns',
              icon: <RotateCcw aria-hidden />,
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
            { href: '/seller/products', label: 'Products', icon: <Package aria-hidden /> },
            { href: '/seller/inventory', label: 'Inventory', icon: <Boxes aria-hidden /> },
          ],
        },
        {
          label: 'Business',
          items: [
            { href: '/seller/earnings', label: 'Earnings', icon: <Wallet aria-hidden /> },
            { href: '/seller/settlements', label: 'Settlements', icon: <Receipt aria-hidden /> },
            { href: '/seller/analytics', label: 'Analytics', icon: <BarChart3 aria-hidden /> },
            { href: '/seller/settings', label: 'Settings', icon: <Settings aria-hidden /> },
          ],
        },
      ]}
    >
      {children}
    </ConsoleShell>
  );
}

async function StoreName() {
  const user = await requireSellerAccount();
  const sellers = await collections.sellers();
  const seller = await sellers.findOne({ _id: user.sellerId }, { projection: { displayName: 1 } });
  return <>{seller?.displayName ?? 'Your store'}</>;
}

async function OrderQueueBadge() {
  const user = await requireSellerAccount();
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
  const user = await requireSellerAccount();
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
  const user = await requireSellerAccount();
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

/**
 * The live desk, wired to this seller's primary location.
 *
 * Presence is keyed by LOCATION rather than by seller — a chain with three
 * shops has three shutters, and only the branch that is actually staffed can
 * take a call about the stock on its own shelves.
 *
 * The primary location is used because that is the one a single-shop seller
 * has, which is almost all of them. A multi-location seller choosing which
 * branch is live is a real requirement and a later one; picking the primary is
 * correct for one shop and a defensible default for several, whereas guessing
 * would put calls in the wrong postcode.
 *
 * A seller with no location at all renders nothing rather than a switch that
 * cannot work — there is nowhere for a shopper to be matched to.
 */
async function LiveDesk() {
  const user = await requireSellerAccount();

  const locations = await collections.sellerLocations();
  const primary =
    (await locations.findOne({ sellerId: user.sellerId, isPrimary: true })) ??
    (await locations.findOne({ sellerId: user.sellerId }));

  if (!primary) return null;

  const { getPresence } = await import('@/server/services/live');
  const presence = await getPresence(user.sellerId);

  return (
    <SellerLiveDesk locationId={primary.id} initialState={presence?.state ?? 'OFFLINE'} />
  );
}

/** The store's own mark for the top of the rail: its logo, or its initials. */
async function StoreBrand() {
  const user = await requireSellerAccount();
  const sellers = await collections.sellers();
  const seller = await sellers.findOne(
    { _id: user.sellerId },
    { projection: { displayName: 1, logoUrl: 1 } },
  );
  return (
    <Avatar
      name={seller?.displayName ?? 'Store'}
      src={seller?.logoUrl || null}
      size="sm"
      square
    />
  );
}

/**
 * The signed-in person, for the rail's user menu.
 *
 * Carries the store's public URL so "View your storefront" opens the page
 * shoppers actually see — the single most common thing a seller checks after
 * changing a listing.
 */
async function SellerUser() {
  const user = await requireSellerAccount();
  const sellers = await collections.sellers();
  const seller = await sellers.findOne({ _id: user.sellerId }, { projection: { slug: 1 } });

  return (
    <ConsoleUserMenu
      name={user.fullName}
      role={user.activeRole === 'SELLER' ? 'Store owner' : 'Store staff'}
      email={user.email}
      avatarUrl={user.avatarUrl}
      storeHref={seller?.slug ? `/store/${seller.slug}` : undefined}
      otherConsoles={user.roles.some(isStaffRole) ? [{ href: '/admin', label: 'Admin console' }] : undefined}
    />
  );
}

/** The user card's geometry, so nothing shifts when the identity lands. */
function UserSkeleton() {
  return (
    <div className="flex items-center gap-2.5 p-1.5" aria-hidden>
      <span className="skeleton size-8 shrink-0 rounded-full" />
      <span className="flex-1 space-y-1.5">
        <span className="skeleton block h-3 w-3/4 rounded" />
        <span className="skeleton block h-2.5 w-1/2 rounded" />
      </span>
    </div>
  );
}
