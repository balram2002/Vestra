import { Check } from 'lucide-react';

import { FORWARD_FLOW, FULFILLMENT_STATUS_META, type FulfillmentStatus } from '@/domain/enums';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import type { OrderEvent } from '@/domain/types';

/**
 * Order progress.
 *
 * Two different jobs, done by two different renderings:
 *
 *  - the FORWARD flow (placed → delivered) is a progress track, because the
 *    shopper's question is "where is it and how much further";
 *  - anything exceptional — cancelled, returned, refunded — is not a step on
 *    that track and must not be drawn as one. Showing "Refunded" as step 9 of 9
 *    implies the order completed normally. Those render as a plain event list
 *    instead.
 *
 * This is why the brief's requirement that every state "render distinctly" is
 * handled here rather than by a status label: the shape of the component
 * changes with the shape of what happened.
 */
export function OrderStatusTimeline({
  status,
  events,
}: {
  status: FulfillmentStatus;
  events: OrderEvent[];
}) {
  const onForwardPath = FORWARD_FLOW.includes(status);

  if (!onForwardPath) {
    return <EventList events={events} status={status} />;
  }

  const currentIndex = FORWARD_FLOW.indexOf(status);
  // Collapsed to the milestones a shopper actually tracks; the full event list
  // sits below for anyone who wants every courier scan.
  const milestones: FulfillmentStatus[] = [
    'PLACED',
    'CONFIRMED',
    'PACKED',
    'SHIPPED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
  ];

  return (
    <div>
      <ol className="flex" data-timeline>
        {milestones.map((milestone, index) => {
          const milestoneIndex = FORWARD_FLOW.indexOf(milestone);
          const reached = milestoneIndex <= currentIndex;
          const isCurrent = milestone === status;
          const event = events.find((e) => e.status === milestone);

          return (
            <li key={milestone} className="relative flex-1">
              {index > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute right-1/2 top-3 h-0.5 w-full',
                    reached ? 'bg-success-500' : 'bg-line',
                  )}
                />
              ) : null}

              <div className="relative flex flex-col items-center gap-2 text-center">
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full border-2 transition-colors',
                    reached
                      ? 'border-success-500 bg-success-500 text-white'
                      : 'border-line bg-canvas',
                    isCurrent && 'ring-success-500/25 ring-4',
                  )}
                  aria-hidden
                >
                  {reached ? <Check className="size-3.5" strokeWidth={3} /> : null}
                </span>

                <span
                  className={cn(
                    'text-2xs leading-tight',
                    isCurrent ? 'text-ink font-semibold' : reached ? 'text-muted' : 'text-faint',
                  )}
                >
                  {FULFILLMENT_STATUS_META[milestone].label}
                </span>

                {event ? (
                  <time
                    dateTime={event.occurredAt}
                    className="text-faint text-2xs tabular hidden sm:block"
                  >
                    {formatDateTime(event.occurredAt)}
                  </time>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="text-muted mt-5 text-center text-sm">
        {FULFILLMENT_STATUS_META[status].description}
      </p>
    </div>
  );
}

/** Exceptional flows: cancellation, return, refund, exchange. */
function EventList({ events, status }: { events: OrderEvent[]; status: FulfillmentStatus }) {
  const meta = FULFILLMENT_STATUS_META[status];
  const ordered = [...events].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );

  return (
    <div>
      <div
        className={cn(
          'rounded-md border p-3 text-sm',
          meta.tone === 'danger' && 'border-danger-100 bg-danger-50 text-danger-700',
          meta.tone === 'warning' && 'border-warning-100 bg-warning-50 text-warning-700',
          meta.tone === 'success' && 'border-success-100 bg-success-50 text-success-700',
          meta.tone === 'neutral' && 'border-line bg-sunken text-muted',
          meta.tone === 'info' && 'border-info-100 bg-info-50 text-info-700',
          meta.tone === 'accent' && 'border-accent-line bg-accent-soft text-accent-ink',
          meta.tone === 'brass' && 'border-brass-200 bg-brass-50 text-brass-700',
        )}
      >
        <p className="font-semibold">{meta.label}</p>
        <p className="mt-0.5">{meta.description}</p>
      </div>

      <ol className="mt-5 space-y-4" data-timeline>
        {ordered.map((event, index) => (
          <li key={event.id} className="relative flex gap-3 pl-1">
            {index < ordered.length - 1 ? (
              <span aria-hidden className="bg-line absolute left-[7px] top-4 h-full w-px" />
            ) : null}

            <span
              aria-hidden
              className={cn(
                'relative mt-1 size-3.5 shrink-0 rounded-full border-2',
                index === ordered.length - 1
                  ? 'border-ink bg-ink'
                  : 'border-line-bold bg-canvas',
              )}
            />

            <div className="min-w-0 flex-1">
              <p className="text-ink text-sm font-medium">{event.title}</p>
              {event.description ? (
                <p className="text-muted mt-0.5 text-sm">{event.description}</p>
              ) : null}
              <time dateTime={event.occurredAt} className="text-faint tabular text-2xs">
                {formatDateTime(event.occurredAt)}
                {event.location ? ` · ${event.location}` : ''}
              </time>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
