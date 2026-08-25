'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { FulfillmentStatus } from '@/domain/enums';
import { decideExchange, submitExchangeQualityCheck } from '@/server/actions/seller';

/**
 * Exchange decisions.
 *
 * The same two moments as a return, with different consequences, and the copy
 * says so rather than making the seller remember:
 *
 *  1. APPROVE books the reverse pickup. The replacement has been RESERVED
 *     since the customer asked, so rejecting is what puts that unit back on
 *     sale — which is why the reject path insists on a reason.
 *  2. The QUALITY CHECK is where the swap actually happens: a pass restocks the
 *     returned unit and dispatches the replacement in one action, because from
 *     the seller's side those are the same trip to the shelf.
 */
export function ExchangeDecision({
  exchangeId,
  status,
  fromSize,
  toSize,
}: {
  exchangeId: string;
  status: FulfillmentStatus;
  fromSize: string;
  toSize: string;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  const awaitingDecision = status === 'EXCHANGE_REQUESTED';
  const awaitingCheck = status === 'EXCHANGE_APPROVED';

  if (!awaitingDecision && !awaitingCheck) return null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(success);
        setRejecting(false);
        setReason('');
      } else {
        toast.error(result.error ?? 'That did not work.');
      }
    });
  };

  if (awaitingDecision) {
    return (
      <div className="border-line mt-4 border-t pt-4">
        {rejecting ? (
          <div>
            <label className="block">
              <span className="text-faint text-2xs uppercase tracking-[0.12em]">
                Why are you declining this?
              </span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                maxLength={400}
                placeholder="The customer sees this, so be specific."
                className="border-line-strong bg-canvas text-ink placeholder:text-faint mt-1.5 w-full rounded-sm border px-2 py-1.5 text-sm"
              />
            </label>

            <p className="text-faint mt-1.5 text-2xs">
              Declining releases the {toSize} you are holding for this customer.
            </p>

            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                disabled={pending || reason.trim().length < 8}
                onClick={() =>
                  run(
                    () => decideExchange({ exchangeId, decision: 'REJECT', reason: reason.trim() }),
                    'Exchange declined',
                  )
                }
                className="bg-danger-600 disabled:bg-line-strong rounded-sm px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed"
              >
                {pending ? 'Working…' : 'Confirm decline'}
              </button>
              <button
                type="button"
                onClick={() => setRejecting(false)}
                disabled={pending}
                className="text-muted hover:text-ink px-2 py-1.5 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () => decideExchange({ exchangeId, decision: 'APPROVE' }),
                  'Approved. A courier will collect the item.',
                )
              }
              className="bg-ink text-canvas rounded-sm px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {pending ? 'Working…' : 'Approve exchange'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setRejecting(true)}
              className="border-line-strong text-muted hover:border-ink hover:text-ink rounded-sm border px-3 py-1.5 text-xs transition-colors"
            >
              Decline
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-line mt-4 border-t pt-4">
      <p className="text-faint text-2xs uppercase tracking-[0.12em]">
        {fromSize} arrived? Record the quality check
      </p>

      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => submitExchangeQualityCheck({ exchangeId, result: 'PASSED' }),
              `Passed. ${toSize} is on its way to the customer.`,
            )
          }
          className="bg-success-600 rounded-sm px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Working…' : `Passed — dispatch ${toSize}`}
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                submitExchangeQualityCheck({
                  exchangeId,
                  result: 'FAILED',
                  note: 'The returned item did not pass quality check on arrival.',
                }),
              'Marked as failed. The unit is written off and the replacement released.',
            )
          }
          className="border-danger-300 text-danger-700 hover:bg-danger-50 rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
        >
          Failed
        </button>
      </div>

      <p className="text-faint mt-2 text-2xs">
        A pass puts {fromSize} back on sale and dispatches {toSize}. A fail writes the returned
        unit off, releases {toSize} and raises a dispute instead.
      </p>
    </div>
  );
}
