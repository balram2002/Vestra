import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ExchangeDecision } from '@/components/console/exchange-decision';
import { ReturnDecision } from '@/components/console/return-decision';
import { StatusBadge } from '@/components/ui/badge';
import { FULFILLMENT_STATUS_META, RETURN_REASON_LABEL } from '@/domain/enums';
import { formatMoney, formatRelative } from '@/lib/format';
import { requireSeller } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';
import { listSellerExchanges } from '@/server/services/exchanges';

export const metadata: Metadata = { title: 'Returns' };

/**
 * Returns queue.
 *
 * Cards, not a table: a return decision turns on the reason and the customer's
 * note, and squeezing those into a table row hides the one thing the decision
 * depends on.
 *
 * Liability is on every card because it decides who absorbs the reverse pickup
 * fee. A seller approving a change-of-mind return should be able to see that it
 * costs them nothing, and a damaged-item return that it does.
 */
export default function SellerReturnsPage() {
  return (
    <>
      <h1 className="font-display text-ink text-xl">Returns and exchanges</h1>
      <p className="text-muted mt-1 text-sm">
        Approve or decline requests, then record the quality check when the parcel arrives.
      </p>

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <ExchangeQueue />
      </Suspense>

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <ReturnQueue />
      </Suspense>
    </>
  );
}

async function ReturnQueue() {
  const user = await requireSeller();
  const returnCol = await collections.returns();
  const requests = toEntities(
    await returnCol.find({ sellerId: user.sellerId }).sort({ createdAt: -1 }).limit(60).toArray(),
  );

  if (requests.length === 0) {
    return (
      <div className="border-line mt-6 rounded-lg border border-dashed p-12 text-center">
        <p className="text-ink text-md font-medium">No returns</p>
        <p className="text-muted mx-auto mt-1.5 max-w-sm text-sm">
          When a customer raises a return it lands here with their reason and the items involved.
        </p>
      </div>
    );
  }

  return (
    <ul className="mt-6 space-y-3">
      {requests.map((request) => (
        <li key={request.id} className="border-line bg-raised rounded-lg border p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-ink tabular text-sm font-semibold">{request.returnNumber}</p>
              <p className="text-faint mt-0.5 text-2xs">
                Order {request.orderNumber} · {formatRelative(request.requestedAt)}
              </p>
            </div>
            <StatusBadge meta={FULFILLMENT_STATUS_META[request.status]} size="sm" />
          </div>

          <div className="border-line mt-4 border-t pt-4">
            <p className="text-faint text-2xs uppercase tracking-[0.12em]">Reason</p>
            <p className="text-ink mt-1 text-sm">{RETURN_REASON_LABEL[request.reason]}</p>
            {request.reasonNote ? (
              <p className="text-muted mt-1 text-sm italic">{request.reasonNote}</p>
            ) : null}
          </div>

          <ul className="mt-4 space-y-2">
            {request.items.map((item) => (
              <li
                key={item.orderItemId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-ink min-w-0 truncate">
                  {item.productTitle}
                  <span className="text-faint">
                    {' '}
                    · {item.size} · {item.colorLabel}
                  </span>
                </span>
                <span className="text-ink tabular shrink-0 text-xs font-medium">
                  {item.quantity} ×{' '}
                  {formatMoney(Math.round(item.refundableAmount / item.quantity))}
                </span>
              </li>
            ))}
          </ul>

          <dl className="border-line mt-4 flex flex-wrap gap-x-6 gap-y-1.5 border-t pt-3 text-2xs">
            <div className="flex gap-1.5">
              <dt className="text-faint">Refund</dt>
              <dd className="text-ink tabular font-semibold">
                {formatMoney(request.refundAmount)}
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-faint">Liability</dt>
              <dd
                className={
                  request.liability === 'SELLER' ? 'text-danger-600 font-semibold' : 'text-ink'
                }
              >
                {request.liability === 'SELLER' ? 'You pay pickup' : 'Customer pays pickup'}
              </dd>
            </div>
            {request.reverseShippingFee > 0 ? (
              <div className="flex gap-1.5">
                <dt className="text-faint">Pickup fee</dt>
                <dd className="text-ink tabular">{formatMoney(request.reverseShippingFee)}</dd>
              </div>
            ) : null}
          </dl>

          <ReturnDecision
            returnId={request.id}
            status={request.status}
            qcDone={Boolean(request.qcResult)}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Exchanges, above returns.
 *
 * They sit first because they are the more time-critical of the two: a
 * replacement unit is reserved from the moment the customer asks, so an
 * exchange left undecided holds sellable stock out of the catalogue. A return
 * left undecided costs nothing but goodwill.
 */
async function ExchangeQueue() {
  const user = await requireSeller();
  const requests = await listSellerExchanges(user.sellerId);
  const open = requests.filter(
    (request) => request.status === 'EXCHANGE_REQUESTED' || request.status === 'EXCHANGE_APPROVED',
  );

  if (open.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-faint text-2xs uppercase tracking-[0.12em]">
        Exchanges awaiting you ({open.length})
      </h2>

      <ul className="mt-2 space-y-3">
        {open.map((request) => (
          <li key={request.id} className="border-accent-border bg-raised rounded-lg border p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-ink tabular text-sm font-semibold">{request.exchangeNumber}</p>
                <p className="text-faint mt-0.5 text-2xs">
                  Order {request.orderNumber} · {formatRelative(request.requestedAt)}
                </p>
              </div>
              <StatusBadge meta={FULFILLMENT_STATUS_META[request.status]} size="sm" />
            </div>

            <div className="border-line mt-4 flex flex-wrap items-center gap-2 border-t pt-4 text-sm">
              <span className="text-muted">Swap</span>
              <span className="border-line-strong text-ink rounded-sm border px-2 py-0.5 text-xs font-medium">
                {request.fromSize} · {request.fromColorLabel}
              </span>
              <span className="text-faint" aria-hidden>
                →
              </span>
              <span className="bg-ink text-canvas rounded-sm px-2 py-0.5 text-xs font-medium">
                {request.toSize} · {request.toColorLabel}
              </span>
              <span className="text-faint text-2xs">× {request.quantity}</span>
            </div>

            <div className="mt-3">
              <p className="text-faint text-2xs uppercase tracking-[0.12em]">Reason</p>
              <p className="text-ink mt-1 text-sm">{RETURN_REASON_LABEL[request.reason]}</p>
              {request.reasonNote ? (
                <p className="text-muted mt-1 text-sm italic">{request.reasonNote}</p>
              ) : null}
            </div>

            <ExchangeDecision
              exchangeId={request.id}
              status={request.status}
              fromSize={request.fromSize}
              toSize={request.toSize}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
