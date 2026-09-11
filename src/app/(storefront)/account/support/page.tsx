import { LifeBuoy } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { AccountNav } from '@/components/account/account-nav';
import { CustomerReply } from '@/components/account/customer-reply';
import { NewTicketDialog } from '@/components/account/new-ticket';
import { StatusBadge } from '@/components/ui/badge';
import { TICKET_STATUS_META } from '@/domain/enums';
import { SUPPORT_CATEGORY_LABEL } from '@/domain/types';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { requireUser } from '@/server/auth/session';
import { listOrders } from '@/server/services/orders';
import { listMyTickets } from '@/server/services/support';

export const metadata: Metadata = {
  title: 'Help and support',
  robots: { index: false, follow: false },
};

/**
 * Help and support.
 *
 * Every conversation with the support team, with a way to start one and a way
 * to answer one. Both were missing: the page could only show threads that an
 * agent had opened, and gave the customer no reply box under them.
 */
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
  const [tickets, orders] = await Promise.all([listMyTickets(user.id), listOrders(user.id, 20)]);

  const categories = Object.entries(SUPPORT_CATEGORY_LABEL).map(([value, label]) => ({
    value,
    label,
  }));
  const orderOptions = orders.map((order) => ({
    value: order.id,
    label: `${order.orderNumber} \u00b7 ${formatDate(order.placedAt)}`,
  }));

  return (
    <>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-ink text-2xl">Help and support</h1>
          <p className="text-muted mt-1 text-sm">Your conversations with our team, newest first.</p>
        </div>
        <NewTicketDialog categories={categories} orders={orderOptions} />
      </div>

      {tickets.length === 0 ? (
        <div className="border-line mt-6 rounded-xl border border-dashed p-12 text-center">
          <LifeBuoy className="text-faint mx-auto size-8" aria-hidden strokeWidth={1.5} />
          <p className="text-ink mt-4 text-lg font-medium">No conversations yet</p>
          <p className="text-muted mx-auto mt-1.5 max-w-sm text-sm">
            Start one with New request. Link the order it is about and the person who replies has
            it open already.
          </p>
          <Link
            href="/help/contact"
            className="text-ink mt-5 inline-block border-b border-current pb-0.5 text-sm font-medium"
          >
            Other ways to reach us
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {tickets.map((ticket) => (
            <li key={ticket.id} className="border-line bg-raised rounded-xl border p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-ink text-sm font-medium">{ticket.subject}</p>
                  <p className="text-faint mt-0.5 text-xs">
                    <span className="tabular">{ticket.ticketNumber}</span>
                    {' \u00b7 '}
                    {SUPPORT_CATEGORY_LABEL[ticket.category]}
                    {ticket.orderNumber ? (
                      <>
                        {' \u00b7 '}
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
                        ? 'border-line rounded-lg border p-3'
                        : 'border-accent-line bg-accent-soft/40 rounded-lg border p-3'
                    }
                  >
                    <p className="text-ink text-xs font-medium">
                      {message.authorKind === 'CUSTOMER' ? 'You' : message.authorName}
                      <span className="text-faint ml-2 font-normal">
                        {formatDateTime(message.createdAt)}
                      </span>
                    </p>
                    <p className="text-muted mt-1 whitespace-pre-line text-sm">{message.body}</p>
                  </li>
                ))}
              </ol>

              <p className="text-faint mt-3 text-2xs">
                {ticket.resolvedAt
                  ? `Resolved ${formatRelative(ticket.resolvedAt)}. If it comes back, start a new request.`
                  : ticket.firstRespondedAt
                    ? `Last update ${formatRelative(ticket.updatedAt)}`
                    : `Awaiting a first reply, due ${formatRelative(ticket.slaDueAt)}`}
              </p>

              {ticket.resolvedAt ? null : <CustomerReply ticketId={ticket.id} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}