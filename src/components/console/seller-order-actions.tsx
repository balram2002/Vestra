'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';

import { FULFILLMENT_TRANSITIONS, FULFILLMENT_STATUS_META, type FulfillmentStatus } from '@/domain/enums';
import { advanceSellerOrder } from '@/server/actions/seller';

/**
 * The next step on a fulfilment queue row.
 *
 * Offers exactly ONE action: the next forward move the state machine allows.
 * A row with five buttons makes the seller decide what to do; a row with one
 * button lets them clear a queue without reading it. Cancellation is
 * deliberately not here — it is a decision, not a queue action, and belongs on
 * the order itself.
 */

/** The forward move for each status a seller can act on. */
const NEXT: Partial<Record<FulfillmentStatus, FulfillmentStatus>> = {
  PLACED: 'CONFIRMED',
  CONFIRMED: 'PROCESSING',
  PROCESSING: 'PACKED',
  PACKED: 'READY_FOR_PICKUP',
  READY_FOR_PICKUP: 'SHIPPED',
};

const LABEL: Partial<Record<FulfillmentStatus, string>> = {
  CONFIRMED: 'Accept',
  PROCESSING: 'Start packing',
  PACKED: 'Mark packed',
  READY_FOR_PICKUP: 'Book pickup',
  SHIPPED: 'Mark shipped',
};

export function SellerOrderActions({
  sellerOrderId,
  status,
  itemIds,
}: {
  sellerOrderId: string;
  status: FulfillmentStatus;
  itemIds: string[];
}) {
  const [pending, startTransition] = useTransition();

  const next = NEXT[status];
  // Belt and braces: the button only renders if the transition is legal, so a
  // stale page cannot offer a move the server will reject.
  const allowed = next ? (FULFILLMENT_TRANSITIONS[status] ?? []).includes(next) : false;

  if (!next || !allowed || itemIds.length === 0) {
    return <span className="text-faint text-2xs">—</span>;
  }

  const run = () => {
    startTransition(async () => {
      const result = await advanceSellerOrder({ sellerOrderId, to: next });
      if (result.ok) {
        toast.success(`Moved to ${FULFILLMENT_STATUS_META[next].label.toLowerCase()}`);
      } else {
        toast.error(result.error ?? 'That did not work.');
      }
    });
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className="border-line-strong text-ink hover:border-ink disabled:text-faint shrink-0 rounded-sm border px-2.5 py-1 text-2xs font-medium transition-colors disabled:cursor-wait"
    >
      {pending ? 'Working…' : (LABEL[next] ?? 'Advance')}
    </button>
  );
}
