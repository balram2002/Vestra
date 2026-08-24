import { Lock, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { PaymentPanel } from '@/components/checkout/payment-panel';
import { CheckoutSteps } from '@/components/checkout/checkout-steps';
import { formatMoney } from '@/lib/format';
import { requireUser } from '@/server/auth/session';
import { collections, toEntity } from '@/server/db/collections';

export const metadata: Metadata = {
  title: 'Payment',
  robots: { index: false, follow: false },
};

/**
 * Payment step.
 *
 * The order already exists and stock is already reserved by the time anyone
 * lands here — that is the point. If this page is closed, refreshed or crashes,
 * the order survives and the webhook still confirms it. Nothing about the money
 * depends on this page completing.
 *
 * With a real provider this is where their SDK or hosted page takes over. The
 * mock provider is exercised through the same `confirmPayment` action, so the
 * capture, decline and pending paths are all real code paths rather than
 * simulated in the UI.
 */
export default function PaymentPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  // `params` is deliberately NOT awaited here. Under Cache Components, reading
  // it in the page body makes the whole shell dynamic; passing the promise into
  // the Suspense child keeps the header and step indicator prerendered while
  // only the order lookup streams.
  return (
    <div className="gutter shell-max py-6">
      <h1 className="font-display text-ink text-2xl">Payment</h1>
      <CheckoutSteps current={2} />

      <Suspense fallback={<div className="skeleton mt-8 h-72 max-w-lg rounded-lg" aria-hidden />}>
        <PaymentDetail params={params} />
      </Suspense>
    </div>
  );
}

async function PaymentDetail({ params }: { params: Promise<{ orderId: string }> }) {
  const [{ orderId }, user] = await Promise.all([params, requireUser()]);

  const orders = await collections.orders();
  const order = toEntity(await orders.findOne({ _id: orderId, userId: user.id }));
  if (!order) notFound();

  const payments = await collections.payments();
  const payment = order.paymentId
    ? toEntity(await payments.findOne({ _id: order.paymentId }))
    : null;

  return (
    <div className="mt-8 max-w-lg">
      <div className="border-line rounded-lg border p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-faint text-2xs uppercase tracking-[0.14em]">Order</p>
            <p className="text-ink tabular mt-0.5 text-sm font-semibold">{order.orderNumber}</p>
          </div>
          <div className="text-right">
            <p className="text-faint text-2xs uppercase tracking-[0.14em]">Amount</p>
            <p className="text-ink tabular mt-0.5 text-xl font-semibold">
              {formatMoney(order.pricing.payable)}
            </p>
          </div>
        </div>

        <p className="text-muted border-line mt-5 flex items-center gap-2 border-t pt-4 text-xs">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          Paying by {payment?.method === 'CARD' ? 'card' : (payment?.method ?? 'card').toLowerCase()}
        </p>

        <PaymentPanel orderId={order.id} amount={order.pricing.payable} />
      </div>

      <p className="text-faint mt-5 flex items-start gap-2 text-xs">
        <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden />
        Your order and the stock for it are already reserved. If this page closes or your
        connection drops, the payment still completes and your order is confirmed — you will not
        need to pay twice.
      </p>
    </div>
  );
}
