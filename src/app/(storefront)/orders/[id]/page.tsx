import { CheckCircle2, Clock } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { OrderStatusTimeline } from '@/components/commerce/order-status-timeline';
import { ShipmentTracker } from '@/components/commerce/shipment-tracker';
import { OrderItemActions } from '@/components/orders/order-item-actions';
import { StatusBadge } from '@/components/ui/badge';
import { FULFILLMENT_STATUS_META } from '@/domain/enums';
import { formatDate, formatMoney } from '@/lib/format';
import { getSessionUser } from '@/server/auth/session';
import { exchangeOptionsFor } from '@/server/services/exchanges';
import { getOrderForViewer } from '@/server/services/orders';

export const metadata: Metadata = {
  title: 'Order',
  robots: { index: false, follow: false },
};

/**
 * Order detail.
 *
 * Grouped by SELLER, because that is how the order is actually fulfilled: each
 * block is its own parcel with its own tracking and its own status. Presenting
 * one merged progress bar for a three-seller order would be a lie the moment
 * one of them shipped first.
 */
export default function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string; pending?: string }>;
}) {
  return (
    <div className="gutter shell-max py-6">
      <Suspense fallback={<OrderSkeleton />}>
        <OrderDetail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function OrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string; pending?: string }>;
}) {
  const [{ id }, flags, user] = await Promise.all([params, searchParams, getSessionUser()]);

  /*
   * Resolves for a signed-in shopper OR for a guest holding the cookie they
   * were given at checkout. A 404 for anyone else — an order number should not
   * confirm that somebody else's order exists.
   */
  const detail = await getOrderForViewer(id);
  if (!detail) notFound();

  const { order, sellerOrders, items, payment, shipments, returnWindowOpen } = detail;

  /*
   * Which sizes each delivered item could be swapped for.
   *
   * Resolved here, on the server, rather than fetched by the buttons: the
   * picker must never offer a variant the request would then refuse, and doing
   * it per-item on the client would mean one round trip per line. Only items
   * that are actually exchangeable are looked up, so a fully shipped order
   * costs nothing extra.
   */
  const exchangeable = items.filter(
    (item) => item.status === 'DELIVERED' && item.exchangeable && (returnWindowOpen[item.id] ?? false),
  );
  // Exchanges need an account, so a guest is offered none.
  const exchangeOptions = user
    ? Object.fromEntries(
        await Promise.all(
          exchangeable.map(
            async (item) => [item.id, await exchangeOptionsFor(item.id, user.id)] as const,
          ),
        ),
      )
    : {};

  return (
    <>
      {/*
        A guest has no order history to go back to, so pointing them at
        /orders would land them on a sign-in wall from a page they are
        legitimately allowed to read.
      */}
      <Breadcrumbs
        items={
          user
            ? [
                { href: '/orders', label: 'Your orders' },
                { href: `/orders/${order.id}`, label: order.orderNumber },
              ]
            : [
                { href: '/', label: 'Home' },
                { href: `/orders/${order.id}`, label: order.orderNumber },
              ]
        }
      />

      {/* Post-checkout confirmation. Shown once, from the URL, so a refresh
          does not keep celebrating. */}
      {flags.placed ? (
        <div className="border-success-100 bg-success-50 mt-4 flex items-start gap-3 rounded-lg border p-4">
          <CheckCircle2 className="text-success-600 mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="text-success-700 text-sm font-semibold">Order placed</p>
            <p className="text-success-700/80 mt-0.5 text-sm">
              We have emailed the confirmation. You can track every parcel from this page.
            </p>
          </div>
        </div>
      ) : null}

      {/*
        The "payment taken but not yet confirmed" state, which is a real one and
        the most dangerous to get wrong: the customer must be told NOT to pay
        again while the provider settles.
      */}
      {flags.pending ? (
        <div className="border-warning-100 bg-warning-50 mt-4 flex items-start gap-3 rounded-lg border p-4">
          <Clock className="text-warning-700 mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="text-warning-700 text-sm font-semibold">
              Waiting for your bank to confirm
            </p>
            <p className="text-warning-700/80 mt-0.5 text-sm">
              Do not pay again. Your order is reserved and we will confirm it as soon as the bank
              responds — usually within a few minutes.
            </p>
          </div>
        </div>
      ) : null}

      {/*
        A guest has no account, so the only handle on this order is the cookie
        in this browser. Saying so plainly — and offering the one action that
        fixes it — is better than letting them discover it when they clear
        their history.
      */}
      {!user ? (
        <div className="border-accent-border bg-accent-soft mt-4 flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4">
          <div className="min-w-0">
            <p className="text-ink text-sm font-semibold">You ordered as a guest</p>
            <p className="text-muted mt-0.5 text-sm">
              We emailed the confirmation to{' '}
              <span className="text-ink">{order.guestEmail ?? 'your email address'}</span>. Create
              an account with that address to keep this order, track it and return items from
              your account.
            </p>
          </div>
          <Link
            href={`/register?next=/orders/${order.id}`}
            className="bg-ink text-canvas shrink-0 rounded-md px-3.5 py-2 text-xs font-medium"
          >
            Create an account
          </Link>
        </div>
      ) : null}

      <header className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-ink text-2xl">Order {order.orderNumber}</h1>
          <p className="text-muted mt-1 text-sm">
            Placed {formatDate(order.placedAt)} · {items.length}{' '}
            {items.length === 1 ? 'item' : 'items'} ·{' '}
            <span className="tabular">{formatMoney(order.pricing.payable)}</span>
          </p>
        </div>

        <StatusBadge meta={FULFILLMENT_STATUS_META[order.status]} size="lg" />
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
        <div className="space-y-8">
          {sellerOrders.map((sellerOrder) => {
            const own = items.filter((item) => item.sellerOrderId === sellerOrder.id);

            return (
              <section key={sellerOrder.id} className="border-line rounded-lg border">
                <header className="border-line flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
                  <div>
                    <p className="text-faint text-2xs uppercase tracking-[0.14em]">
                      Parcel {sellerOrder.sellerOrderNumber}
                    </p>
                    <p className="text-ink mt-0.5 text-sm font-medium">{sellerOrder.sellerName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/*
                      The invoice exists only once the parcel has been
                      dispatched, because that is when it is raised. Showing a
                      dead "Download invoice" link before then is worse than
                      showing none.
                    */}
                    {sellerOrder.invoiceId ? (
                      <a
                        href={`/invoice/${sellerOrder.invoiceId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted hover:text-ink text-2xs underline-offset-2 hover:underline"
                      >
                        Invoice
                      </a>
                    ) : null}
                    <StatusBadge meta={FULFILLMENT_STATUS_META[sellerOrder.status]} size="sm" />
                  </div>
                </header>

                <div className="px-5 py-6">
                  <OrderStatusTimeline
                    status={sellerOrder.status}
                    events={own.flatMap((item) => item.timeline)}
                  />
                </div>

                {/*
                  Courier tracking, once there is a parcel to track. Kept
                  distinct from the order timeline above: that one is about the
                  seller's commitments, this one is about where the box is.
                */}
                {(shipments[sellerOrder.id] ?? []).map((shipment) => (
                  <div key={shipment.id} className="border-line border-t px-5 py-5">
                    <ShipmentTracker shipment={shipment} />
                  </div>
                ))}

                <ul className="border-line border-t px-5">
                  {own.map((item) => (
                    <li key={item.id} className="border-line flex gap-4 border-t py-4 first:border-t-0">
                      <Link
                        href={`/product/${item.productSlug}`}
                        className="bg-sunken relative aspect-3/4 w-20 shrink-0 overflow-hidden rounded-md"
                      >
                        <Image
                          src={item.imageUrl}
                          alt={item.productTitle}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      </Link>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-faint text-2xs uppercase tracking-[0.12em]">
                              {item.brandName}
                            </p>
                            <Link
                              href={`/product/${item.productSlug}`}
                              className="text-ink clamp-2 mt-0.5 text-sm font-medium hover:underline"
                            >
                              {item.productTitle}
                            </Link>
                            <p className="text-faint mt-1 text-xs">
                              Size {item.size} · {item.colorLabel} · Qty {item.quantity}
                            </p>
                          </div>

                          <p className="text-ink tabular shrink-0 text-sm font-semibold">
                            {formatMoney(item.lineTotal)}
                          </p>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <StatusBadge meta={FULFILLMENT_STATUS_META[item.status]} size="sm" />
                          {item.returnEligibleUntil && item.status === 'DELIVERED' ? (
                            <span className="text-faint text-2xs">
                              Returnable until {formatDate(item.returnEligibleUntil)}
                            </span>
                          ) : null}
                        </div>

                        <OrderItemActions
                          orderId={order.id}
                          itemId={item.id}
                          status={item.status}
                          returnable={item.returnable}
                          returnWindowOpen={returnWindowOpen[item.id] ?? false}
                          productTitle={item.productTitle}
                          exchangeOptions={exchangeOptions[item.id]}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        {/* ------------------------------------------------------- aside */}

        <aside className="space-y-6">
          <div className="border-line rounded-lg border p-5">
            <h2 className="text-faint text-2xs font-medium uppercase tracking-[0.14em]">
              Delivery address
            </h2>
            <address className="text-muted mt-3 text-sm not-italic">
              <span className="text-ink block font-medium">{order.shippingAddress.fullName}</span>
              {order.shippingAddress.line1}
              {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
              {order.shippingAddress.pincode}
              <br />
              <span className="text-faint text-xs">{order.shippingAddress.phone}</span>
            </address>
          </div>

          <div className="border-line rounded-lg border p-5">
            <h2 className="text-faint text-2xs font-medium uppercase tracking-[0.14em]">Payment</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Method</dt>
                <dd className="text-ink">{payment?.instrumentLabel ?? order.paymentMethod}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Items</dt>
                <dd className="text-ink tabular">{formatMoney(order.pricing.subtotal)}</dd>
              </div>
              {order.pricing.couponDiscount > 0 ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Coupon</dt>
                  <dd className="text-success-600 tabular">
                    − {formatMoney(order.pricing.couponDiscount)}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Delivery</dt>
                <dd className="text-ink tabular">
                  {order.pricing.shippingFee === 0
                    ? 'Free'
                    : formatMoney(order.pricing.shippingFee)}
                </dd>
              </div>
              <div className="border-line flex justify-between gap-3 border-t pt-2">
                <dt className="text-ink font-semibold">Paid</dt>
                <dd className="text-ink tabular font-semibold">
                  {formatMoney(order.pricing.payable)}
                </dd>
              </div>
            </dl>
            <p className="text-faint mt-2 text-2xs">
              Includes {formatMoney(order.pricing.taxTotal)} tax
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

function OrderSkeleton() {
  return (
    <div aria-hidden>
      <div className="skeleton h-4 w-48 rounded-xs" />
      <div className="skeleton mt-5 h-9 w-72 rounded-sm" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="skeleton h-96 rounded-lg" />
        <div className="space-y-6">
          <div className="skeleton h-40 rounded-lg" />
          <div className="skeleton h-52 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
