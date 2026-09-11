'use client';

import { Printer, Receipt, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { ShipmentStatus } from '@/domain/enums';
import { cancelShipmentAction, refreshTracking } from '@/server/actions/seller';

/**
 * What a seller can still do to a parcel.
 *
 * The set shrinks as the parcel moves, because most of these stop being
 * possible in the physical world: you cannot cancel a box a courier already
 * drove away with. Rather than showing disabled buttons for those, they are
 * removed — the server enforces the same rule, so a stale page fails safely
 * either way.
 */
export function ShipmentActions({
  shipmentId,
  status,
  hasLabel,
  invoiceId,
}: {
  shipmentId: string;
  status: ShipmentStatus;
  hasLabel: boolean;
  /** Raised at dispatch, so it is absent until the label exists. */
  invoiceId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');

  // Once the courier has it, cancellation is a conversation with support.
  const cancellable = !['PICKED_UP', 'IN_TRANSIT', 'REACHED_HUB', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RTO_DELIVERED', 'CANCELLED'].includes(
    status,
  );
  const trackable = hasLabel && !['CANCELLED'].includes(status);

  const sync = () => {
    startTransition(async () => {
      const result = await refreshTracking({ shipmentId });
      if (result.ok) toast.success('Tracking refreshed');
      else toast.error(result.error ?? 'Could not reach the courier.');
    });
  };

  const cancel = () => {
    startTransition(async () => {
      const result = await cancelShipmentAction({ shipmentId, reason });
      if (result.ok) {
        toast.success('Shipment cancelled');
        setConfirming(false);
        setReason('');
      } else {
        toast.error(result.error ?? 'Could not cancel the parcel.');
      }
    });
  };

  return (
    <div className="border-line mt-5 border-t pt-5">
      <div className="flex flex-wrap gap-2">
        {hasLabel ? (
          <a
            href={`/seller/shipments/${shipmentId}/label`}
            target="_blank"
            rel="noreferrer"
            className="border-line-strong text-ink hover:border-ink inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors"
          >
            <Printer className="size-3.5" aria-hidden />
            Print label
          </a>
        ) : null}

        {invoiceId ? (
          <a
            href={`/invoice/${invoiceId}`}
            target="_blank"
            rel="noreferrer"
            className="border-line-strong text-ink hover:border-ink inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors"
          >
            <Receipt className="size-3.5" aria-hidden />
            Tax invoice
          </a>
        ) : null}

        {trackable ? (
          <Button
            type="button"
            onClick={sync}
            loading={pending}
            variant="secondary"
            size="sm"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Refresh tracking
          </Button>
        ) : null}

        {cancellable && !confirming ? (
          <Button
            type="button"
            onClick={() => setConfirming(true)}
            variant="danger"
            size="sm"
          >
            <X className="size-3.5" aria-hidden />
            Cancel parcel
          </Button>
        ) : null}
      </div>

      {/*
        Cancelling releases the items back to be re-packed, so it asks for a
        reason rather than firing on one click — and the reason is what the
        customer and support see afterwards.
      */}
      {confirming ? (
        <div className="border-danger-100 bg-danger-50 mt-3 rounded-md border p-4">
          <label htmlFor="cancel-reason" className="text-ink block text-xs font-medium">
            Why is this parcel being cancelled?
          </label>
          <input
            id="cancel-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Courier missed pickup twice"
            className="border-line-strong bg-raised text-ink mt-2 w-full rounded-md border px-3 py-2 text-sm"
          />
          <p className="text-muted mt-2 text-2xs">
            The items go back into the queue and can be packed into a new parcel.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              onClick={cancel}
              loading={pending}
              disabled={reason.trim().length < 3}
              variant="danger"
              size="sm"
            >
              Cancel parcel
            </Button>
            <Button
              type="button"
              onClick={() => setConfirming(false)}
              variant="ghost"
              size="sm"
            >
              Keep it
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
