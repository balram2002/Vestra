'use client';

import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
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

/**
 * Named for what the click actually does, not for the status it lands on.
 * From PACKED onward each of these performs real logistics work — booking the
 * parcel, burning an AWB, calling a courier — so "Mark packed" would have
 * understated it and left sellers surprised by an AWB they did not ask for.
 */
const LABEL: Partial<Record<FulfillmentStatus, string>> = {
  CONFIRMED: 'Accept',
  PROCESSING: 'Start packing',
  PACKED: 'Generate label',
  READY_FOR_PICKUP: 'Book pickup',
  SHIPPED: 'Hand over',
};

const DONE: Partial<Record<FulfillmentStatus, string>> = {
  CONFIRMED: 'Order accepted',
  PROCESSING: 'Packing started',
  PACKED: 'Label generated',
  READY_FOR_PICKUP: 'Pickup booked',
  SHIPPED: 'Handed to courier',
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
        toast.success(DONE[next] ?? `Moved to ${FULFILLMENT_STATUS_META[next].label.toLowerCase()}`);
      } else {
        toast.error(result.error ?? 'That did not work.');
      }
    });
  };

  return (
    <Button
      type="button"
      onClick={run}
      loading={pending}
      variant="secondary"
      size="xs"
      className="shrink-0"
    >
      {(LABEL[next] ?? 'Advance')}
    </Button>
  );
}
