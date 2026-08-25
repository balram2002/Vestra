import { RotateCcw } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { AccountNav } from '@/components/account/account-nav';
import { StatusBadge } from '@/components/ui/badge';
import { FULFILLMENT_STATUS_META, RETURN_REASON_LABEL, REFUND_STATUS_META } from '@/domain/enums';
import { formatDate, formatMoney } from '@/lib/format';
import { requireUser } from '@/server/auth/session';
import { listExchanges } from '@/server/services/exchanges';
import { listRefunds, listReturns } from '@/server/services/returns';

export const metadata: Metadata = {
  title: 'Returns and refunds',
  robots: { index: false, follow: false },
};

export default function AccountReturnsPage() {
  return (
    <div className="gutter shell-max py-6">
      <AccountNav current="/account/returns" />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <Returns />
      </Suspense>
    </div>
  );
}

async function Returns() {
  const user = await requireUser();
  const [returns, refunds, exchanges] = await Promise.all([
    listReturns(user.id),
    listRefunds(user.id),
    listExchanges(user.id),
  ]);

  if (returns.length === 0 && refunds.length === 0 && exchanges.length === 0) {
    return (
      <div className="border-line mt-6 rounded-lg border border-dashed p-12 text-center">
        <RotateCcw className="text-faint mx-auto size-8" aria-hidden strokeWidth={1.5} />
        <p className="text-ink mt-4 text-lg font-medium">Nothing sent back</p>
        <p className="text-muted mx-auto mt-1.5 max-w-sm text-sm">
          No returns or exchanges yet. You can raise either from any delivered order while it is
          still inside its window.
        </p>
        <Link
          href="/orders"
          className="text-ink mt-5 inline-block border-b border-current pb-0.5 text-sm font-medium"
        >
          Go to your orders
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      {exchanges.length > 0 ? (
        <section>
          <h2 className="font-display text-ink text-lg">Exchanges</h2>

          <ul className="mt-3 space-y-3">
            {exchanges.map((request) => (
              <li key={request.id} className="border-line rounded-lg border p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-ink tabular text-sm font-semibold">
                      {request.exchangeNumber}
                    </p>
                    <p className="text-faint mt-0.5 text-xs">
                      Order{' '}
                      <Link href={`/orders/${request.orderId}`} className="hover:underline">
                        {request.orderNumber}
                      </Link>{' '}
                      - raised {formatDate(request.requestedAt)}
                    </p>
                  </div>
                  <StatusBadge meta={FULFILLMENT_STATUS_META[request.status]} size="sm" />
                </div>

                <div className="border-line mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
                  <span className="border-line-strong text-muted rounded-sm border px-2 py-0.5 text-xs">
                    {request.fromSize} · {request.fromColorLabel}
                  </span>
                  <span className="text-faint" aria-hidden>
                    →
                  </span>
                  <span className="bg-ink text-canvas rounded-sm px-2 py-0.5 text-xs font-medium">
                    {request.toSize} · {request.toColorLabel}
                  </span>
                </div>

                {request.rejectionReason ? (
                  <p className="text-danger-700 mt-2 text-sm">{request.rejectionReason}</p>
                ) : (
                  <p className="text-muted mt-2 text-sm">
                    {FULFILLMENT_STATUS_META[request.status].description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {returns.length > 0 ? (
        <section>
          <h2 className="font-display text-ink text-lg">Returns</h2>

          <ul className="mt-3 space-y-3">
            {returns.map((request) => (
              <li key={request.id} className="border-line rounded-lg border p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-ink tabular text-sm font-semibold">{request.returnNumber}</p>
                    <p className="text-faint mt-0.5 text-xs">
                      Order{' '}
                      <Link href={`/orders/${request.orderId}`} className="hover:underline">
                        {request.orderNumber}
                      </Link>{' '}
                      - raised {formatDate(request.requestedAt)}
                    </p>
                  </div>
                  <StatusBadge meta={FULFILLMENT_STATUS_META[request.status]} size="sm" />
                </div>

                <p className="text-muted mt-3 text-sm">
                  {RETURN_REASON_LABEL[request.reason]}
                  {request.reasonNote ? ` - ${request.reasonNote}` : ''}
                </p>

                <ul className="text-muted mt-3 space-y-1 text-sm">
                  {request.items.map((item) => (
                    <li key={item.orderItemId} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {item.productTitle}
                        <span className="text-faint">
                          {' '}
                          - {item.size} - {item.colorLabel}
                        </span>
                      </span>
                      <span className="tabular shrink-0">{formatMoney(item.refundableAmount)}</span>
                    </li>
                  ))}
                </ul>

                <div className="border-line mt-3 flex flex-wrap justify-between gap-3 border-t pt-3 text-xs">
                  <span className="text-faint">
                    {request.liability === 'SELLER'
                      ? 'Free pickup - the fault was ours'
                      : `Pickup fee ${formatMoney(request.reverseShippingFee)}`}
                  </span>
                  <span className="text-ink tabular font-semibold">
                    Refund {formatMoney(request.refundAmount)}
                  </span>
                </div>

                {request.rejectionReason ? (
                  <p className="border-danger-100 bg-danger-50 text-danger-700 mt-3 rounded-sm border p-2.5 text-xs">
                    {request.rejectionReason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {refunds.length > 0 ? (
        <section>
          <h2 className="font-display text-ink text-lg">Refunds</h2>

          <ul className="border-line mt-3 divide-y rounded-lg border">
            {refunds.map((refund) => (
              <li key={refund.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-ink tabular text-sm font-medium">
                    {formatMoney(refund.amount)}
                  </p>
                  <p className="text-faint mt-0.5 text-xs">
                    {refund.reason} - order {refund.orderNumber}
                  </p>
                </div>

                <div className="text-right">
                  <StatusBadge meta={REFUND_STATUS_META[refund.status]} size="sm" />
                  {refund.status !== 'COMPLETED' && refund.expectedBy ? (
                    <p className="text-faint mt-1 text-2xs">
                      Expected by {formatDate(refund.expectedBy)}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
