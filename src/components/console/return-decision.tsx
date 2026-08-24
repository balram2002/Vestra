'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { FulfillmentStatus } from '@/domain/enums';
import { decideReturn, submitQualityCheck } from '@/server/actions/seller';

/**
 * Return decisions.
 *
 * Two distinct moments, and the component shows only the one that is due:
 *
 *  1. APPROVE or REJECT the request, before the parcel moves.
 *  2. Record the QUALITY CHECK once it arrives, which is where the money and
 *     the stock actually move — a pass restocks the unit and refunds the
 *     customer, a fail writes it off and refunds nothing automatically.
 *
 * Rejecting requires a reason. It is the message the customer reads, and
 * "rejected" with no explanation is how a return becomes a support ticket.
 */
export function ReturnDecision({
  returnId,
  status,
  qcDone,
}: {
  returnId: string;
  status: FulfillmentStatus;
  qcDone: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  const awaitingDecision = status === 'RETURN_REQUESTED';
  const awaitingCheck =
    !qcDone && (status === 'RETURN_APPROVED' || status === 'RETURN_PICKUP');

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
                Why are you rejecting this?
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

            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                disabled={pending || reason.trim().length < 8}
                onClick={() =>
                  run(
                    () => decideReturn({ returnId, decision: 'REJECT', reason: reason.trim() }),
                    'Return rejected',
                  )
                }
                className="bg-danger-600 disabled:bg-line-strong rounded-sm px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed"
              >
                {pending ? 'Working…' : 'Confirm rejection'}
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
                run(() => decideReturn({ returnId, decision: 'APPROVE' }), 'Return approved')
              }
              className="bg-ink text-canvas rounded-sm px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {pending ? 'Working…' : 'Approve return'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setRejecting(true)}
              className="border-line-strong text-muted hover:border-ink hover:text-ink rounded-sm border px-3 py-1.5 text-xs transition-colors"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-line mt-4 border-t pt-4">
      <p className="text-faint text-2xs uppercase tracking-[0.12em]">
        Parcel arrived? Record the quality check
      </p>

      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => submitQualityCheck({ returnId, result: 'PASSED' }),
              'Passed. Stock restored and the refund is on its way.',
            )
          }
          className="bg-success-600 rounded-sm px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Working…' : 'Passed'}
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                submitQualityCheck({
                  returnId,
                  result: 'FAILED',
                  note: 'Item did not pass quality check on arrival.',
                }),
              'Marked as failed. The unit is written off, not restocked.',
            )
          }
          className="border-danger-300 text-danger-700 hover:bg-danger-50 rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
        >
          Failed
        </button>
      </div>

      <p className="text-faint mt-2 text-2xs">
        A pass puts the unit back on sale and refunds the customer. A fail writes it off and
        raises a dispute instead.
      </p>
    </div>
  );
}
