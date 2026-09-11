import { Check, CircleAlert, Truck } from 'lucide-react';
import { Card } from '@/components/ui/card';

import { SHIPMENT_STATUS_META, type ShipmentStatus } from '@/domain/enums';
import type { Shipment } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatDateTime, formatDeliveryWindow } from '@/lib/format';

/**
 * Parcel tracking.
 *
 * A Server Component: the scan history is already on the shipment, so there is
 * nothing to fetch on the client and no reason to ship JavaScript for a list.
 *
 * The timeline shows what HAPPENED, newest last, rather than a fixed set of
 * stages with ticks. Real parcels fail a delivery, sit at a hub for two days
 * and occasionally go back to the seller; a five-step progress bar has to lie
 * about all of that. Where the journey did go wrong, the failed scans stay
 * visible — a customer whose parcel was missed twice is owed the detail, not a
 * tidied-up summary.
 */

const EXCEPTION: ShipmentStatus[] = ['DELIVERY_FAILED', 'RTO_INITIATED', 'RTO_DELIVERED', 'LOST', 'CANCELLED'];

export function ShipmentTracker({
  shipment,
  showHeader = true,
}: {
  shipment: Shipment;
  showHeader?: boolean;
}) {
  const events = [...shipment.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const current = shipment.status;
  const meta = SHIPMENT_STATUS_META[current];
  const delivered = current === 'DELIVERED';

  return (
    <Card as="section" pad="none">
      {showHeader ? (
        <header className="border-line flex flex-wrap items-start justify-between gap-3 border-b p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Truck className="text-muted size-4 shrink-0" aria-hidden />
              <h2 className="text-ink text-md font-semibold">{meta.label}</h2>
            </div>
            <p className="text-muted mt-1 text-sm">{meta.description}</p>
          </div>

          <dl className="text-2xs shrink-0 space-y-1 text-right">
            {shipment.awb ? (
              <div>
                <dt className="text-faint inline">AWB </dt>
                <dd className="text-ink tabular inline font-medium">{shipment.awb}</dd>
              </div>
            ) : null}
            {shipment.carrier ? (
              <div>
                <dt className="text-faint inline">Courier </dt>
                <dd className="text-ink inline">{shipment.carrier}</dd>
              </div>
            ) : null}
          </dl>
        </header>
      ) : null}

      {/*
        The promise is dropped once the parcel has actually arrived — a
        delivered parcel showing "arriving Tuesday" reads as a bug.
      */}
      {!delivered && shipment.estimatedDeliveryFrom && shipment.estimatedDeliveryTo ? (
        <p className="border-line text-muted border-b px-5 py-3 text-sm">
          Expected{' '}
          <span className="text-ink font-medium">
            {formatDeliveryWindow(shipment.estimatedDeliveryFrom, shipment.estimatedDeliveryTo)}
          </span>
        </p>
      ) : null}

      {events.length === 0 ? (
        <p className="text-muted p-5 text-sm">
          The courier has not scanned this parcel yet. Updates appear here as it moves.
        </p>
      ) : (
        <ol className="p-5">
          {events.map((event, index) => {
            const isLast = index === events.length - 1;
            const isException = EXCEPTION.includes(event.status);

            return (
              <li key={event.id} className="relative flex gap-3.5 pb-5 last:pb-0">
                {/* The rail, drawn between dots rather than behind them. */}
                {!isLast ? (
                  <span
                    aria-hidden
                    className="bg-line absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-px"
                  />
                ) : null}

                <span
                  aria-hidden
                  className={cn(
                    'relative z-10 mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full border-2',
                    isException
                      ? 'border-danger-600 bg-danger-50 text-danger-600'
                      : isLast
                        ? 'border-ink bg-ink text-canvas'
                        : 'border-success-600 bg-success-50 text-success-600',
                  )}
                >
                  {isException ? (
                    <CircleAlert className="size-3" />
                  ) : (
                    <Check className="size-3" strokeWidth={3} />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      isException ? 'text-danger-700' : 'text-ink',
                    )}
                  >
                    {event.title}
                  </p>
                  {event.description ? (
                    <p className="text-muted mt-0.5 text-sm">{event.description}</p>
                  ) : null}
                  <p className="text-faint mt-1 text-2xs">
                    {formatDateTime(event.occurredAt)}
                    {event.location ? ` · ${event.location}` : ''}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/** One-line summary for order cards, where a full timeline would not fit. */
export function ShipmentSummaryLine({ shipment }: { shipment: Shipment }) {
  const meta = SHIPMENT_STATUS_META[shipment.status];
  return (
    <p className="text-muted text-2xs">
      <span className="text-ink font-medium">{meta.label}</span>
      {shipment.awb ? <span className="tabular"> · AWB {shipment.awb}</span> : null}
      {shipment.carrier ? ` · ${shipment.carrier}` : ''}
    </p>
  );
}
