import type { Metadata } from 'next';
import { PageHeader } from '@/components/console/page-header';
import { Card } from '@/components/ui/card';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { TicketThread } from '@/components/console/ticket-thread';
import { StatusBadge } from '@/components/ui/badge';
import { TICKET_PRIORITY_META, TICKET_STATUS_META } from '@/domain/enums';
import { SUPPORT_CATEGORY_LABEL } from '@/domain/types';
import { formatDateTime, formatRelative, maskEmail } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntity } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Ticket' };

export default function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="skeleton h-96 rounded-lg" aria-hidden />}>
      <Ticket params={params} />
    </Suspense>
  );
}

/**
 * One conversation.
 *
 * Everything an agent needs to answer without opening a second tab: what was
 * asked, which order it is about, how long it has been waiting, and whether
 * the SLA has already been missed. The order link matters most — the majority
 * of support questions are answerable only by looking at the order.
 */
async function Ticket({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }] = await Promise.all([params, requirePermission('support:read')]);

  const tickets = await collections.supportTickets();
  const ticket = toEntity(await tickets.findOne({ _id: id }));
  if (!ticket) notFound();

  const breached = ticket.slaDueAt < new Date().toISOString() && !ticket.resolvedAt;

  return (
    <>
      <PageHeader
        back={{ href: '/admin/support', label: 'All tickets' }}
        title={ticket.subject}
        description={
          <>
            <span className="tabular">{ticket.ticketNumber}</span> ·{' '}
            {SUPPORT_CATEGORY_LABEL[ticket.category]} · raised{' '}
            {formatRelative(ticket.createdAt)}
          </>
        }
        meta={
          <>
            <StatusBadge meta={TICKET_PRIORITY_META[ticket.priority]} size="sm" />
            <StatusBadge meta={TICKET_STATUS_META[ticket.status]} size="sm" />
          </>
        }
      />

      {breached ? (
        <p className="border-danger-100 bg-danger-50 text-danger-700 mt-4 rounded-md border p-3 text-sm">
          Past its SLA — this was due {formatDateTime(ticket.slaDueAt)}.
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <TicketThread
            ticketId={ticket.id}
            status={ticket.status}
            messages={ticket.messages}
          />
        </div>

        <aside className="space-y-4">
          <Card as="section">
            <h2 className="text-faint text-2xs uppercase tracking-[0.12em]">Raised by</h2>
            <p className="text-ink mt-2 text-sm font-medium">{ticket.requesterName}</p>
            {/*
              Masked by default. An agent rarely needs the full address to
              answer, and a support console open on a shared screen is the most
              common place customer contact details leak.
            */}
            <p className="text-muted text-sm">{maskEmail(ticket.requesterEmail)}</p>
          </Card>

          {ticket.orderNumber ? (
            <Card as="section">
              <h2 className="text-faint text-2xs uppercase tracking-[0.12em]">About</h2>
              <Link
                href={`/admin/orders/${ticket.orderNumber}`}
                className="text-ink tabular mt-2 block text-sm font-medium underline-offset-2 hover:underline"
              >
                {ticket.orderNumber}
              </Link>
            </Card>
          ) : null}

          <Card as="section">
            <h2 className="text-faint text-2xs uppercase tracking-[0.12em]">Handling</h2>
            <dl className="mt-2 space-y-1.5 text-sm">
              <Row label="Assigned to" value={ticket.assignedToName ?? 'Unassigned'} />
              <Row
                label="First reply"
                value={
                  ticket.firstRespondedAt ? formatRelative(ticket.firstRespondedAt) : 'Not yet'
                }
              />
              <Row label="SLA due" value={formatDateTime(ticket.slaDueAt)} />
              {ticket.resolvedAt ? (
                <Row label="Resolved" value={formatRelative(ticket.resolvedAt)} />
              ) : null}
            </dl>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink text-right">{value}</dd>
    </div>
  );
}
