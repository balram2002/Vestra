'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { SettlementStatus } from '@/domain/enums';
import { holdSettlementPayout, markSettlementTransferred } from '@/server/actions/admin';

/**
 * Finance actions on one settlement.
 *
 * Marking a payout sent requires the bank UTR, not a confirmation click. The
 * reference is what a seller quotes when the money has not landed, and a
 * settlement marked paid without one cannot be traced by anybody — which turns
 * a bank delay into an unanswerable dispute.
 */
export function SettlementActions({
  settlementId,
  status,
}: {
  settlementId: string;
  status: SettlementStatus;
}) {
  const [mode, setMode] = useState<'pay' | 'hold' | null>(null);
  const [utr, setUtr] = useState('');
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  const payable = status === 'PENDING' || status === 'PROCESSING' || status === 'ON_HOLD';
  const holdable = status === 'PENDING' || status === 'PROCESSING';

  if (!payable && !holdable) return null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(success);
        setMode(null);
        setUtr('');
        setReason('');
      } else {
        toast.error(result.error ?? 'That did not work.');
      }
    });
  };

  if (mode === 'pay') {
    return (
      <div className="border-line bg-sunken mt-3 rounded-md border p-3">
        <label className="block">
          <span className="text-faint text-2xs uppercase tracking-[0.12em]">Bank UTR</span>
          <input
            value={utr}
            onChange={(event) => setUtr(event.target.value)}
            placeholder="HDFCR52025082512345678"
            className="border-line-strong bg-raised text-ink mt-1 w-full rounded-sm border px-2 py-1.5 font-mono text-sm"
          />
        </label>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            disabled={pending || utr.trim().length < 6}
            onClick={() =>
              run(
                () => markSettlementTransferred({ settlementId, utr: utr.trim() }),
                'Payout recorded and the seller notified',
              )
            }
            className="bg-ink text-canvas disabled:bg-line-strong rounded-sm px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed"
          >
            {pending ? 'Saving…' : 'Confirm payout'}
          </button>
          <button
            type="button"
            onClick={() => setMode(null)}
            disabled={pending}
            className="text-muted hover:text-ink px-2 py-1.5 text-xs"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'hold') {
    return (
      <div className="border-line bg-sunken mt-3 rounded-md border p-3">
        <label className="block">
          <span className="text-faint text-2xs uppercase tracking-[0.12em]">
            Why is this on hold?
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            maxLength={300}
            placeholder="The seller reads this, so be specific."
            className="border-line-strong bg-raised text-ink mt-1 w-full rounded-sm border px-2 py-1.5 text-sm"
          />
        </label>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            disabled={pending || reason.trim().length < 8}
            onClick={() =>
              run(
                () => holdSettlementPayout({ settlementId, reason: reason.trim() }),
                'Payout held',
              )
            }
            className="bg-warning-700 disabled:bg-line-strong rounded-sm px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed"
          >
            {pending ? 'Saving…' : 'Hold payout'}
          </button>
          <button
            type="button"
            onClick={() => setMode(null)}
            disabled={pending}
            className="text-muted hover:text-ink px-2 py-1.5 text-xs"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {payable ? (
        <button
          type="button"
          onClick={() => setMode('pay')}
          className="bg-ink text-canvas rounded-sm px-3 py-1.5 text-xs font-medium"
        >
          Record payout
        </button>
      ) : null}
      {holdable ? (
        <button
          type="button"
          onClick={() => setMode('hold')}
          className="border-line-strong text-muted hover:border-ink hover:text-ink rounded-sm border px-3 py-1.5 text-xs transition-colors"
        >
          Hold
        </button>
      ) : null}
    </div>
  );
}
