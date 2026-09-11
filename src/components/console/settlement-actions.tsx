'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
        {/* A UTR is copied off a bank statement and compared digit by digit. */}
        <Input
          label="Bank UTR"
          value={utr}
          onChange={(event) => setUtr(event.target.value)}
          placeholder="HDFCR52025082512345678"
          className="ident"
        />
        <div className="mt-2.5 flex gap-2">
          <Button
            type="button"
            disabled={pending || utr.trim().length < 6}
            onClick={() =>
              run(
                () => markSettlementTransferred({ settlementId, utr: utr.trim() }),
                'Payout recorded and the seller notified',
              )
            }
            size="sm"
            loading={pending}
          >
            Confirm payout
          </Button>
          <Button
            type="button"
            onClick={() => setMode(null)}
            disabled={pending}
            size="sm"
            variant="ghost"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (mode === 'hold') {
    return (
      <div className="border-line bg-sunken mt-3 rounded-md border p-3">
        <Textarea
          label="Why is this on hold?"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={300}
          placeholder="The seller reads this, so be specific."
        />
        <div className="mt-2.5 flex gap-2">
          <Button
            type="button"
            disabled={pending || reason.trim().length < 8}
            onClick={() =>
              run(
                () => holdSettlementPayout({ settlementId, reason: reason.trim() }),
                'Payout held',
              )
            }
            size="sm"
            variant="secondary"
            loading={pending}
          >
            Hold payout
          </Button>
          <Button
            type="button"
            onClick={() => setMode(null)}
            disabled={pending}
            size="sm"
            variant="ghost"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {payable ? (
        <Button
          type="button"
          onClick={() => setMode('pay')}
          size="sm"
        >
          Record payout
        </Button>
      ) : null}
      {holdable ? (
        <Button
          type="button"
          onClick={() => setMode('hold')}
          variant="secondary"
          size="sm"
        >
          Hold
        </Button>
      ) : null}
    </div>
  );
}
