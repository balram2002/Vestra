import { LifeBuoy } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { AccountNav } from '@/components/account/account-nav';
import { StatusBadge } from '@/components/ui/badge';
import { TICKET_STATUS_META } from '@/domain/enums';
import { SUPPORT_CATEGORY_LABEL } from '@/domain/types';
import { formatDateTime, formatRelative } from '@/lib/format';
import { requireUser } from '@/server/auth/session';
import { listMyTickets } from '@/server/services/support';

export const metadata: Metadata = {
  title: 'Help and support',
  robots: { index: false, follow: false },
};

export default function AccountSupportPage() {
  return (
    <div className="gutter shell-max py-6">
      <AccountNav current="/account/support" />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <Tickets />
      </Suspense>
    </div>
  );
}

async function Tickets() {
  const user = await requireUser();
  const tickets = await listMyTickets(user.id);

  if (tickets.length === 0) {
    return (
      <div className="border-line mt-6 rounded-lg border border-dashed p-12 text-center">
        <LifeBuoy className="text-faint mx-auto size-8" aria-hidden strokeWidth={1.5} />
        <p className="text-ink mt-4 text-lg font-medium">No conversations</p>
        <p className="text-muted mx-auto mt-1.5 max-w-sm text-sm">
          If something goes wrong with an order you can raise it from the order itself, and the
          conversation will appear here.
        </p>
        <Link
          href="/orders"
          className="text-ink mt-5 inline-block border-b border-current pb-0.5 text-sm font-medium"
        >
          Go to your orders
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-6 space-y-3">
      {tickets.map((ticket) => (
        <li key={ticket.id} className="border-line rounded-lg border p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-ink text-sm font-medium">{ticket.subject}</p>
              <p className="text-faint mt-0.5 text-xs">
                <span className="tabular">{ticket.ticketNumber}</span> -{' '}
                {SUPPORT_CATEGORY_LABEL[ticket.category]}
                {ticket.orderNumber ? (
                  <>
                    {' - '}
                    <Link href={`/orders/${ticket.orderId}`} className="hover:underline">
                      {ticket.orderNumber}
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
            <StatusBadge meta={TICKET_STATUS_META[ticket.status]} size="sm" />
          </div>

          <ol className="mt-4 space-y-3">
            {ticket.messages.map((message) => (
              <li
                key={message.id}
                className={
                  message.authorKind === 'CUSTOMER'
                    ? 'border-line rounded-md border p-3'
                    : 'border-accent-line bg-accent-soft/40 rounded-md border p-3'
                }
              >
                <p className="text-ink text-xs font-medium">
                  {message.authorKind === 'CUSTOMER' ? 'You' : message.authorName}
                  <span className="text-faint ml-2 font-normal">
                    {formatDateTime(message.createdAt)}
                  </span>
                </p>
                <p className="text-muted mt-1 text-sm">{message.body}</p>
              </li>
            ))}
          </ol>

          <p className="text-faint mt-3 text-2xs">
            {ticket.resolvedAt
              ? `Resolved ${formatRelative(ticket.resolvedAt)}`
              : ticket.firstRespondedAt
                ? `Last update ${formatRelative(ticket.updatedAt)}`
                : `Awaiting a first reply - due ${formatRelative(ticket.slaDueAt)}`}
          </p>
        </li>
      ))}
    </ul>
  );
}
