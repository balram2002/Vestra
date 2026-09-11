'use client';

import { Play } from 'lucide-react';
import { Card } from '@/components/ui/card';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
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
    <Card as="section">
      <h2 className="text-ink text-md font-semibold">Run a payout</h2>
      <p className="text-muted mt-1 text-sm">
        Settles every delivered order that has cleared the hold and is not already on a statement.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Select
            label="Seller"
            hideLabel
            value={sellerId}
            onChange={(event) => setSellerId(event.target.value)}
          >
            <option value="">Choose a seller…</option>
            {sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </Select>
        </div>

        {/*
          `loading` keeps the label mounted and the width stable, so the row does
          not reflow the moment this is pressed — which matters more here than
          most places, because the button sits beside a select that would jump
          with it.
        */}
        <Button type="button" onClick={run} disabled={!sellerId} loading={pending} className="shrink-0">
          <Play className="size-3.5" aria-hidden />
          Run settlement
        </Button>
      </div>
    </Card>
  );
}
