'use client';

import { useState, useTransition } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
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
            <Textarea
          label="Why are you rejecting this?"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                maxLength={400}
                placeholder="The customer sees this, so be specific."
        />

            <div className="mt-2.5 flex gap-2">
              <Button
                type="button"
                loading={pending}
                disabled={reason.trim().length < 8}
                onClick={() =>
                  run(
                    () => decideReturn({ returnId, decision: 'REJECT', reason: reason.trim() }),
                    'Return rejected',
                  )
                }
                variant="danger"
                size="sm"
              >
                Confirm rejection
              </Button>
              <Button
                type="button"
                onClick={() => setRejecting(false)}
                disabled={pending}
                variant="ghost"
                size="sm"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              loading={pending}
              onClick={() =>
                run(() => decideReturn({ returnId, decision: 'APPROVE' }), 'Return approved')
              }
              size="sm"
            >
              Approve return
            </Button>
            <Button
              type="button"
              loading={pending}
              onClick={() => setRejecting(true)}
              variant="secondary"
              size="sm"
            >
              Reject
            </Button>
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
        <Button
          type="button"
          loading={pending}
          onClick={() =>
            run(
              () => submitQualityCheck({ returnId, result: 'PASSED' }),
              'Passed. Stock restored and the refund is on its way.',
            )
          }
          variant="ghost"
          size="sm"
        >
          Passed
        </Button>

        <Button
          type="button"
          loading={pending}
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
          variant="danger"
          size="sm"
        >
          Failed
        </Button>
      </div>

      <p className="text-faint mt-2 text-2xs">
        A pass puts the unit back on sale and refunds the customer. A fail writes it off and
        raises a dispute instead.
      </p>
    </div>
  );
}
