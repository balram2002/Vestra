import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { ConsoleTabs } from '@/components/console/console-tabs';
import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { TICKET_PRIORITY_META, TICKET_STATUS_META } from '@/domain/enums';
import { SUPPORT_CATEGORY_LABEL } from '@/domain/types';
import type { SupportTicket } from '@/domain/types';
import { formatRelative } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { listAllTickets } from '@/server/services/support';

export const metadata: Metadata = { title: 'Support' };

const TABS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'ALL', label: 'All' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'WAITING_ON_CUSTOMER', label: 'Waiting on customer' },
  { value: 'RESOLVED', label: 'Resolved' },
];

/**
 * Agent queue.
 *
 * Defaults to open tickets and sorts urgent-first then oldest — the order an
 * agent should actually work in. A ticket past its SLA is called out, because
 * the SLA is the promise the platform made when it accepted the message.
 */
export default function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  return (
    <>
      <h1 className="font-display text-ink text-xl">Support</h1>
      <p className="text-muted mt-1 text-sm">
        Urgent first, then oldest. Anything past its SLA is flagged.
      </p>

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <TicketQueue searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function TicketQueue({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const [params] = await Promise.all([searchParams, requirePermission('support:read')]);
  const status = params.status ?? 'OPEN';

  const tickets = await listAllTickets({ status });
  const nowIso = new Date().toISOString();

  const columns: Column<SupportTicket>[] = [
    {
      key: 'ticket',
      header: 'Ticket',
      render: (ticket) => (
        <div className="min-w-0">
          <p className="text-ink truncate text-xs font-medium">{ticket.subject}</p>
          <p className="text-faint truncate text-2xs">
            <span className="tabular">{ticket.ticketNumber}</span> - {ticket.requesterName}
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'About',
      secondary: true,
      render: (ticket) => (
        <div className="min-w-0">
          <p className="text-muted truncate text-xs">
            {SUPPORT_CATEGORY_LABEL[ticket.category]}
          </p>
          {ticket.orderNumber ? (
            <Link
              href={`/admin/orders?status=ALL`}
              className="text-faint tabular text-2xs hover:underline"
            >
              {ticket.orderNumber}
            </Link>
          ) : null}
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (ticket) => (
        <StatusBadge meta={TICKET_PRIORITY_META[ticket.priority]} size="sm" />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (ticket) => <StatusBadge meta={TICKET_STATUS_META[ticket.status]} size="sm" />,
    },
    {
      key: 'sla',
      header: 'SLA',
      numeric: true,
      render: (ticket) => {
        const breached =
          !ticket.firstRespondedAt && ticket.slaDueAt < nowIso && ticket.status === 'OPEN';
        return (
          <span
            className={breached ? 'text-danger-600 text-2xs font-semibold' : 'text-faint text-2xs'}
          >
            {breached ? 'Overdue' : formatRelative(ticket.slaDueAt)}
          </span>
        );
      },
    },
    {
      key: 'agent',
      header: 'Agent',
      numeric: true,
      secondary: true,
      render: (ticket) => (
        <span className="text-muted text-2xs">{ticket.assignedToName ?? 'Unassigned'}</span>
      ),
    },
  ];

  return (
    <div className="mt-6">
      <ConsoleTabs basePath="/admin/support" param="status" current={status} tabs={TABS} />

      <p className="text-faint mt-4 text-xs">
        {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}
      </p>

      <DataTable
        className="mt-2"
        columns={columns}
        rows={tickets}
        rowKey={(ticket) => ticket.id}
        caption="Support tickets"
        empty={
          <TableEmpty
            title={status === 'OPEN' ? 'Queue is clear' : 'Nothing here'}
            body={
              status === 'OPEN'
                ? 'Every ticket has been picked up. New ones arrive at the top of this list.'
                : 'No tickets match this filter.'
            }
          />
        }
      />
    </div>
  );
}
