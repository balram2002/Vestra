import { ArrowRight, LayoutDashboard, MapPin, Package, RotateCcw, Store } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

import { AccountNav } from '@/components/account/account-nav';
import { VerifyEmailNotice } from '@/components/account/verify-email-notice';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { SignOutButton } from '@/components/account/sign-out-button';
import { StatusBadge } from '@/components/ui/badge';
import { FULFILLMENT_STATUS_META } from '@/domain/enums';
import { formatDate, formatMoney } from '@/lib/format';
import { requireUser } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';
import { listOrders } from '@/server/services/orders';
import { workspacesFor } from '@/server/services/workspaces';

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
};

/**
 * Account overview.
 *
 * Leads with the thing people actually come here for — where their most recent
 * order is — rather than a grid of navigation tiles. The first version of this
 * page was five links and a lot of empty space, three of which 404'd; a
 * shortcut that goes nowhere is worse than no shortcut.
 */
export default function AccountPage() {
  return (
    <div className="gutter shell-max py-6">
      <AccountNav current="/account" />

      <Suspense fallback={<AccountSkeleton />}>
        <Overview />
      </Suspense>
    </div>
  );
}

async function Overview() {
  const user = await requireUser();

  const [orders, addressCol, returnCol, access] = await Promise.all([
    listOrders(user.id, 3),
    collections.addresses(),
    collections.returns(),
    workspacesFor(user),
  ]);

  const [addressCount, openReturns, allOrders] = await Promise.all([
    addressCol.countDocuments({ userId: user.id }),
    returnCol.countDocuments({
      userId: user.id,
      status: { $nin: ['REFUNDED', 'RETURN_REJECTED'] },
    }),
    (await collections.orders()).countDocuments({ userId: user.id }),
  ]);

  const items = await (await collections.orderItems())
    .find({ orderId: { $in: orders.map((order) => order.id) } })
    .toArray()
    .then(toEntities);

  const byOrder = new Map<string, typeof items>();
  for (const item of items) {
    byOrder.set(item.orderId, [...(byOrder.get(item.orderId) ?? []), item]);
  }

  return (
    <>
      <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-ink text-2xl">{user.fullName}</h1>
          <p className="text-muted mt-1 text-sm">{user.email}</p>
          {access.chips.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Your roles">
              {access.chips.map((chip) => (
                <li
                  key={chip}
                  className="bg-accent-soft text-accent-ink rounded-full px-2.5 py-0.5 text-2xs font-semibold"
                >
                  {chip}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <SignOutButton />
      </header>

      {!user.emailVerified ? <VerifyEmailNotice email={user.email} /> : null}

      {/*
        The consoles this account can work in. On a phone the Account tab is
        where people look for anything about themselves, so this is the most
        findable place for the way into the admin or seller console.
      */}
      {access.workspaces.length > 0 ? (
        <section
          aria-labelledby="workspaces"
          className="border-accent-border bg-accent-soft mt-4 rounded-lg border p-4"
        >
          <h2 id="workspaces" className="text-ink text-sm font-semibold">
            Your workspaces
          </h2>
          <p className="text-muted mt-0.5 text-sm">
            You shop from this account, and you can work in these as well.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {access.workspaces.map((workspace) => (
              <li key={workspace.href}>
                <a
                  href={workspace.href}
                  className="border-line bg-raised hover:border-accent-control group flex min-h-14 items-center gap-3 rounded-md border p-3 transition-colors"
                >
                  {workspace.kind === 'admin' ? (
                    <LayoutDashboard className="text-accent-ink size-5 shrink-0" aria-hidden />
                  ) : (
                    <Store className="text-accent-ink size-5 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block text-sm font-medium">{workspace.label}</span>
                    <span className="text-muted block truncate text-xs">{workspace.description}</span>
                  </span>
                  <ArrowRight
                    className="text-faint size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        Appearance.
        
        The header carries a compact control that cycles through the three
        modes, which is right for a toolbar and wrong as the only way to set it:
        cycling gives no way to see what the options ARE. This is the explicit
        one, where someone looking for a setting would look for it.
      */}
      <section className="border-line bg-raised mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <div>
          <h2 className="text-ink text-sm font-semibold">Appearance</h2>
          <p className="text-muted mt-0.5 text-sm">
            System follows your device, and changes with it.
          </p>
        </div>
        <ThemeToggle />
      </section>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-14">
        <section>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-ink text-lg">Recent orders</h2>
            {allOrders > orders.length ? (
              <Link
                href="/orders"
                className="text-ink group text-sm font-medium hover:underline underline-offset-4 inline-flex min-h-11 items-center lg:min-h-0"
              >
                <span className="inline-flex items-center gap-1.5">
                  All {allOrders} orders
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ) : null}
          </div>

          {orders.length === 0 ? (
            <div className="border-line mt-4 rounded-lg border border-dashed p-10 text-center">
              <Package className="text-faint mx-auto size-7" aria-hidden strokeWidth={1.5} />
              <p className="text-ink mt-3 text-md font-medium">No orders yet</p>
              <p className="text-muted mx-auto mt-1.5 max-w-sm text-sm">
                When you place an order it appears here with live tracking for every parcel.
              </p>
              <Link
                href="/"
                className="text-ink mt-5 inline-block border-b border-current pb-0.5 text-sm font-medium"
              >
                Start shopping
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {orders.map((order) => {
                const lines = byOrder.get(order.id) ?? [];

                return (
                  <li key={order.id}>
                    <Link
                      href={`/orders/${order.id}`}
                      className="border-line hover:border-ink block rounded-lg border p-4 transition-colors"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-ink tabular text-sm font-semibold">
                            {order.orderNumber}
                          </p>
                          <p className="text-muted mt-0.5 text-xs">
                            {formatDate(order.placedAt)} · {lines.length}{' '}
                            {lines.length === 1 ? 'item' : 'items'} ·{' '}
                            <span className="tabular">{formatMoney(order.pricing.payable)}</span>
                          </p>
                        </div>
                        <StatusBadge meta={FULFILLMENT_STATUS_META[order.status]} size="sm" />
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        {lines.slice(0, 6).map((item) => (
                          <div
                            key={item.id}
                            className="bg-sunken relative aspect-3/4 w-10 overflow-hidden rounded-sm"
                          >
                            <Image
                              src={item.imageUrl}
                              alt={item.productTitle}
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          </div>
                        ))}
                        {lines.length > 6 ? (
                          <span className="text-faint text-xs">+{lines.length - 6}</span>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="space-y-3">
          <Shortcut
            href="/account/addresses"
            icon={MapPin}
            title="Addresses"
            meta={
              addressCount === 0
                ? 'None saved yet'
                : `${addressCount} saved${addressCount === 1 ? '' : ' addresses'}`
            }
          />
          <Shortcut
            href="/account/returns"
            icon={RotateCcw}
            title="Returns and refunds"
            meta={openReturns > 0 ? `${openReturns} in progress` : 'Nothing in progress'}
          />

          {user.creditBalance > 0 ? (
            <div className="border-sand-200 bg-sand-50 rounded-lg border p-4">
              <p className="text-sand-700 text-2xs font-medium uppercase tracking-[0.12em]">
                VestraWAB credit
              </p>
              <p className="text-ink tabular mt-1 text-xl font-semibold">
                {formatMoney(user.creditBalance)}
              </p>
              <p className="text-muted mt-1 text-xs">
                Applied automatically at checkout, before any other payment.
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function Shortcut({
  href,
  icon: Icon,
  title,
  meta,
}: {
  href: string;
  icon: typeof MapPin;
  title: string;
  meta: string;
}) {
  return (
    <Link
      href={href}
      className="border-line hover:border-ink group flex items-center gap-3 rounded-lg border p-4 transition-colors"
    >
      <Icon className="text-accent-ink size-5 shrink-0" aria-hidden strokeWidth={1.5} />
      <span className="min-w-0 flex-1">
        <span className="text-ink block text-sm font-medium">{title}</span>
        <span className="text-faint block text-xs">{meta}</span>
      </span>
      <ArrowRight className="text-faint size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function AccountSkeleton() {
  return (
    <div className="mt-6" aria-hidden>
      <div className="skeleton h-9 w-56 rounded-sm" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3">
          <div className="skeleton h-6 w-40 rounded-xs" />
          <div className="skeleton h-28 rounded-lg" />
          <div className="skeleton h-28 rounded-lg" />
        </div>
        <div className="space-y-3">
          <div className="skeleton h-20 rounded-lg" />
          <div className="skeleton h-20 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
