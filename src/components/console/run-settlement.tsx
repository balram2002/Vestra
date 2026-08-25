'use client';

import { Play } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { runSellerSettlement } from '@/server/actions/admin';

/**
 * Start a payout run for one seller.
 *
 * Per seller rather than "run everything", because a payout run is an
 * irreversible financial event and the person doing it should be naming who
 * they are paying. The run itself is idempotent — it claims the orders it
 * settles — so a double click produces an empty second run, not a double
 * payment.
 */
export function RunSettlement({ sellers }: { sellers: Array<{ id: string; name: string }> }) {
  const [sellerId, setSellerId] = useState('');
  const [pending, startTransition] = useTransition();

  const run = () => {
    if (!sellerId) {
      toast.error('Choose a seller to settle');
      return;
    }

    startTransition(async () => {
      const result = await runSellerSettlement({ sellerId });
      if (result.ok) {
        toast.success('Settlement created');
        setSellerId('');
      } else {
        // "Nothing has cleared the hold" is a normal answer, not a failure, so
        // it is shown as information rather than as an error.
        toast.message(result.error ?? 'Nothing to settle.');
      }
    });
  };

  return (
    <section className="border-line bg-raised rounded-lg border p-5">
      <h2 className="text-ink text-md font-semibold">Run a payout</h2>
      <p className="text-muted mt-1 text-sm">
        Settles every delivered order that has cleared the hold and is not already on a statement.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Seller</span>
          <select
            value={sellerId}
            onChange={(event) => setSellerId(event.target.value)}
            className="border-line-strong bg-canvas text-ink h-9 w-full min-w-48 rounded-sm border px-2 text-sm"
          >
            <option value="">Choose a seller…</option>
            {sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={run}
          disabled={pending || !sellerId}
          className="bg-ink text-canvas disabled:bg-line-strong inline-flex shrink-0 items-center gap-1.5 rounded-sm px-3 py-2 text-xs font-medium disabled:cursor-not-allowed"
        >
          <Play className="size-3.5" aria-hidden />
          {pending ? 'Running…' : 'Run settlement'}
        </button>
      </div>
    </section>
  );
}
