'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  CANCELLATION_REASONS,
  CANCELLATION_REASON_LABEL,
  isCustomerCancellable,
  RETURN_REASONS,
  RETURN_REASON_LABEL,
  type FulfillmentStatus,
} from '@/domain/enums';
import { cancelOrderItems, submitReturn } from '@/server/actions/checkout';

/**
 * Per-item cancel and return.
 *
 * Deliberately on the ITEM, not the order. A bag of four things where one no
 * longer fits is the common case, and an order-level "cancel" button forces
 * the shopper to contact support for the thing the system could have done
 * itself.
 *
 * Which action is offered is derived from the item's own status via the state
 * machine in `domain/enums` — the UI never invents a transition, so a button
 * can never appear for a move the server would reject.
 */
export function OrderItemActions({
  orderId,
  itemId,
  status,
  returnable,
  returnWindowOpen,
  productTitle,
}: {
  orderId: string;
  itemId: string;
  status: FulfillmentStatus;
  returnable: boolean;
  /**
   * Computed on the SERVER. Deriving it here from `Date.now()` would be an
   * impure render — the answer would silently change between renders, and the
   * server is the only clock that should decide whether a window has closed
   * anyway, since it is the one that will enforce it.
   */
  returnWindowOpen: boolean;
  productTitle: string;
}) {
  const [open, setOpen] = useState<'cancel' | 'return' | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();

  const canCancel = isCustomerCancellable(status);
  const canReturn = status === 'DELIVERED' && returnable && returnWindowOpen;

  if (!canCancel && !canReturn) return null;

  const submit = () => {
    if (!reason) {
      toast.error('Choose a reason to continue');
      return;
    }

    startTransition(async () => {
      const result =
        open === 'cancel'
          ? await cancelOrderItems({ orderId, itemIds: [itemId], reason, note })
          : await submitReturn({
              orderId,
              items: [{ orderItemId: itemId, quantity: 1 }],
              reason,
              note,
            });

      if (result.ok) {
        toast.success(
          open === 'cancel'
            ? 'Item cancelled. Your refund is on its way.'
            : 'Return requested. We will arrange a pickup.',
        );
        setOpen(null);
        setReason('');
        setNote('');
      } else {
        toast.error(result.error ?? 'That did not work.');
      }
    });
  };

  const reasons =
    open === 'cancel'
      ? CANCELLATION_REASONS.map((r) => ({ value: r, label: CANCELLATION_REASON_LABEL[r] }))
      : RETURN_REASONS.map((r) => ({ value: r, label: RETURN_REASON_LABEL[r] }));

  return (
    <div className="mt-3">
      {open === null ? (
        <div className="flex flex-wrap gap-2">
          {canCancel ? (
            <button
              type="button"
              onClick={() => setOpen('cancel')}
              className="border-line-strong text-muted hover:border-ink hover:text-ink rounded-sm border px-3 py-1.5 text-xs transition-colors"
            >
              Cancel item
            </button>
          ) : null}

          {canReturn ? (
            <button
              type="button"
              onClick={() => setOpen('return')}
              className="border-line-strong text-muted hover:border-ink hover:text-ink rounded-sm border px-3 py-1.5 text-xs transition-colors"
            >
              Return or exchange
            </button>
          ) : null}
        </div>
      ) : (
        <div className="border-line bg-sunken rounded-md border p-3">
          <p className="text-ink text-xs font-medium">
            {open === 'cancel' ? 'Cancel' : 'Return'} “{productTitle}”
          </p>

          <label className="mt-2.5 block">
            <span className="sr-only">Reason</span>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="border-line-strong bg-raised text-ink h-9 w-full rounded-sm border px-2 text-sm"
            >
              <option value="">Choose a reason…</option>
              {reasons.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-2 block">
            <span className="sr-only">Anything else we should know</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Anything else we should know? (optional)"
              className="border-line-strong bg-raised text-ink placeholder:text-faint w-full rounded-sm border px-2 py-1.5 text-sm"
            />
          </label>

          {open === 'return' ? (
            <p className="text-faint mt-2 text-2xs">
              Reverse pickup is free when the fault is ours. Refunds reach your original payment
              method within 5 working days of the item passing our quality check.
            </p>
          ) : null}

          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={submit} loading={pending}>
              {open === 'cancel' ? 'Cancel item' : 'Request return'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpen(null);
                setReason('');
              }}
              disabled={pending}
            >
              Keep it
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
