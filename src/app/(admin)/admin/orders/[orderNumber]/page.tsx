import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { ShipmentTracker } from '@/components/commerce/shipment-tracker';
import { ManualRefund } from '@/components/console/manual-refund';
import { StatusBadge } from '@/components/ui/badge';
import {
  FULFILLMENT_STATUS_META,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_META,
  REFUND_STATUS_META,
} from '@/domain/enums';
import { formatDateTime, formatMoney, formatPhone } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntities, toEntity } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Order' };

export default function AdminOrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  return (
    <Suspense fallback={<div className="skeleton h-[32rem] rounded-lg" aria-hidden />}>
      <OrderDetail params={params} />
    </Suspense>
  );
}

/**
 * One order, from the operations side.
 *
 * Addressed by ORDER NUMBER rather than by id, because that is the only
 * identifier a customer has and support arrives here from a phone call. Shows
 * what an agent needs to answer without opening anything else: money, parcels,
 * and every refund already raised against it.
 */
async function OrderDetail({ params }: { params: Promise<{ orderNumber: string }> }) {
  const [{ orderNumber }, user] = await Promise.all([params, requirePermission('order:read')]);

  /*
   * Resolve by order NUMBER or by id.
   *
   * Support arrives here from a phone call holding the number the customer can
   * read off their email; the console links with the internal id. Accepting
   * both means neither audience has to translate.
   */
  const key = decodeURIComponent(orderNumber);
  const orders = await collections.orders();
  const order = toEntity(
    (await orders.findOne({ orderNumber: key })) ?? (await orders.findOne({ _id: key })),
  );
  if (!order) notFound();

  const [sellerOrderCol, itemCol, paymentCol, shipmentCol, refundCol] = await Promise.all([
    collections.sellerOrders(),
    collections.orderItems(),
    collections.payments(),
    collections.shipments(),
    collections.refunds(),
  ]);

  const [sellerOrders, items, payment, shipments, refunds] = await Promise.all([
    sellerOrderCol.find({ orderId: order.id }).toArray().then(toEntities),
    itemCol.find({ orderId: order.id }).toArray().then(toEntities),
    order.paymentId ? paymentCol.findOne({ _id: order.paymentId }).then(toEntity) : null,
    shipmentCol.find({ orderId: order.id }).sort({ createdAt: 1 }).toArray().then(toEntities),
    refundCol.find({ orderId: order.id }).sort({ createdAt: -1 }).toArray().then(toEntities),
  ]);

  const refunded = refunds
    .filter((refund) => refund.status !== 'FAILED')
    .reduce((sum, refund) => sum + refund.amount, 0);
  const refundable = Math.max(0, order.pricing.payable - refunded);

  const canRefund = user.permissions.includes('order:refund');

  return (
    <>
      <nav className="text-2xs mb-3">
        <Link href="/admin/orders" className="text-muted hover:text-ink">
          ← All orders
        </Link>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-ink tabular text-xl">{order.orderNumber}</h1>
          <p className="text-muted mt-1 text-sm">
            Placed {formatDateTime(order.placedAt)} · {items.length} items ·{' '}
            <span className="tabular">{formatMoney(order.pricing.payable)}</span>
            {order.userId ? '' : ' · guest order'}
          </p>
        </div>
        <StatusBadge meta={FULFILLMENT_STATUS_META[order.status]} size="lg" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {/* ------------------------------------------------ parcels */}
          {sellerOrders.map((sellerOrder) => {
            const own = items.filter((item) => item.sellerOrderId === sellerOrder.id);
            const parcels = shipments.filter((s) => s.sellerOrderId === sellerOrder.id);

            return (
              <section key={sellerOrder.id} className="border-line bg-raised rounded-lg border">
                <header className="border-line flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
                  <div>
                    <p className="text-faint text-2xs uppercase tracking-[0.12em]">
                      {sellerOrder.sellerOrderNumber}
                    </p>
                    <p className="text-ink mt-0.5 text-sm font-medium">{sellerOrder.sellerName}</p>
                  </div>
                  <StatusBadge meta={FULFILLMENT_STATUS_META[sellerOrder.status]} size="sm" />
                </header>

                <ul className="px-5">
                  {own.map((item) => (
                    <li
                      key={item.id}
                      className="border-line flex items-start justify-between gap-3 border-t py-3 first:border-t-0 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="text-ink truncate">{item.productTitle}</p>
                        <p className="text-faint mt-0.5 text-2xs">
                          {item.size} · {item.colorLabel} · SKU {item.sku} ·{' '}
                          {FULFILLMENT_STATUS_META[item.status].label}
                        </p>
                      </div>
                      <p className="text-ink tabular shrink-0 text-xs font-medium">
                        {item.quantity} × {formatMoney(item.unitSellingPrice)}
                      </p>
                    </li>
                  ))}
                </ul>

                {parcels.map((shipment) => (
                  <div key={shipment.id} className="border-line border-t px-5 py-4">
                    <ShipmentTracker shipment={shipment} />
                  </div>
                ))}
              </section>
            );
          })}

          {/* ------------------------------------------------ refunds */}
          <section className="border-line bg-raised rounded-lg border p-5">
            <h2 className="text-ink text-md font-semibold">Refunds</h2>

            {refunds.length === 0 ? (
              <p className="text-muted mt-1 text-sm">Nothing has been refunded on this order.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {refunds.map((refund) => (
                  <li
                    key={refund.id}
                    className="border-line flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="text-ink tabular text-xs font-medium">{refund.refundNumber}</p>
                      <p className="text-faint mt-0.5 text-2xs">{refund.reason}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-ink tabular text-sm font-semibold">
                        {formatMoney(refund.amount)}
                      </span>
                      <StatusBadge meta={REFUND_STATUS_META[refund.status]} size="sm" />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {canRefund ? (
              <div className="border-line mt-4 border-t pt-4">
                <ManualRefund orderId={order.id} refundable={refundable} />
              </div>
            ) : null}
          </section>
        </div>

        {/* ---------------------------------------------------- sidebar */}
        <aside className="space-y-4">
          <section className="border-line bg-raised rounded-lg border p-5">
            <h2 className="text-faint text-2xs uppercase tracking-[0.12em]">Customer</h2>
            <p className="text-ink mt-2 text-sm font-medium">{order.shippingAddress.fullName}</p>
            <p className="text-muted text-sm">{formatPhone(order.shippingAddress.phone)}</p>
            {order.guestEmail ? (
              <p className="text-muted text-sm">{order.guestEmail}</p>
            ) : null}
            <address className="text-muted mt-2 text-sm not-italic leading-relaxed">
              {order.shippingAddress.line1}
              {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
              <span className="tabular">{order.shippingAddress.pincode}</span>
            </address>
          </section>

          <section className="border-line bg-raised rounded-lg border p-5">
            <h2 className="text-faint text-2xs uppercase tracking-[0.12em]">Payment</h2>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-ink text-sm">{PAYMENT_METHOD_LABEL[order.paymentMethod]}</span>
              <StatusBadge meta={PAYMENT_STATUS_META[order.paymentStatus]} size="sm" />
            </div>
            {payment?.providerPaymentId ? (
              <p className="text-faint mt-1 break-all font-mono text-2xs">
                {payment.providerPaymentId}
              </p>
            ) : null}

            <dl className="border-line mt-3 space-y-1.5 border-t pt-3 text-sm">
              <Row label="Items" value={formatMoney(order.pricing.subtotal)} />
              {order.pricing.couponDiscount > 0 ? (
                <Row
                  label={`Coupon ${order.pricing.couponCode ?? ''}`}
                  value={`− ${formatMoney(order.pricing.couponDiscount)}`}
                />
              ) : null}
              {order.pricing.platformDiscount + order.pricing.sellerDiscount > 0 ? (
                <Row
                  label="Offers"
                  value={`− ${formatMoney(order.pricing.platformDiscount + order.pricing.sellerDiscount)}`}
                />
              ) : null}
              <Row
                label="Delivery"
                value={
                  order.pricing.shippingFee - order.pricing.shippingDiscount === 0
                    ? 'Free'
                    : formatMoney(order.pricing.shippingFee - order.pricing.shippingDiscount)
                }
              />
              {order.pricing.codFee > 0 ? (
                <Row label="COD fee" value={formatMoney(order.pricing.codFee)} />
              ) : null}
              <div className="border-line flex justify-between gap-3 border-t pt-1.5">
                <dt className="text-ink font-semibold">Paid</dt>
                <dd className="text-ink tabular font-semibold">
                  {formatMoney(order.pricing.payable)}
                </dd>
              </div>
              {refunded > 0 ? (
                <Row label="Refunded" value={`− ${formatMoney(refunded)}`} />
              ) : null}
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink tabular text-right">{value}</dd>
    </div>
  );
}
