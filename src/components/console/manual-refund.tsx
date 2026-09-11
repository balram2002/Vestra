'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

import { formatMoney } from '@/lib/format';
import { toRupees } from '@/lib/money';
import { refundOrderManually } from '@/server/actions/admin';

/**
 * Refund an order by hand.
 *
 * Deliberately awkward to fire by accident: it is collapsed behind a link, the
 * reason is required, and the confirm button stays disabled until both fields
 * are filled. Moving money should take a moment of deliberate intent, and the
 * refundable ceiling is stated so nobody has to work it out.
 */
export function ManualRefund({
  orderId,
  refundable,
}: {
  orderId: string;
  /** What is still refundable on this order, in paise. */
  refundable: number;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(toRupees(refundable));
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  if (refundable <= 0) {
    return (
      <p className="text-faint text-2xs">This order has already been refunded in full.</p>
    );
  }

  const submit = () => {
    startTransition(async () => {
      const result = await refundOrderManually({ orderId, amountRupees: amount, reason });
      if (result.ok) {
        toast.success('Refund raised. The customer has been notified.');
        setOpen(false);
        setReason('');
      } else {
        toast.error(result.error ?? 'That did not work.');
      }
    });
  };

  if (!open) {
    return (
      <Button
        type="button"
        onClick={() => setOpen(true)}
        variant="ghost"
        size="sm"
      >
        Refund this order
      </Button>
    );
  }

  return (
    <div className="border-danger-100 bg-danger-50 rounded-md border p-4">
      <p className="text-ink text-xs font-medium">Refund this order</p>
      <p className="text-muted mt-0.5 text-2xs">
        Up to {formatMoney(refundable)} is still refundable. The customer is notified and the
        action is recorded against your name.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <label className="block">
          <span className="text-faint block text-2xs">Amount (₹)</span>
          <input
            type="number"
            min={1}
            max={toRupees(refundable)}
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
            className="border-line-strong bg-raised text-ink tabular mt-1 h-9 w-full rounded-sm border px-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-faint block text-2xs">Reason</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Courier lost the parcel in transit"
            className="border-line-strong bg-raised text-ink mt-1 h-9 w-full rounded-sm border px-2 text-sm"
          />
        </label>
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          onClick={submit}
          loading={pending}
          disabled={reason.trim().length < 4 || amount <= 0}
          variant="danger"
          size="sm"
        >
          {`Refund ${formatMoney(Math.round(amount * 100))}`}
        </Button>
        <Button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          variant="ghost"
          size="sm"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
