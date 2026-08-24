import 'server-only';

import { SUPPORT } from '@/config/business';
import type { SupportCategory, SupportTicket, TicketMessage, TicketPriority } from '@/domain/types';
import { entityId } from '@/lib/ids';

import { collections, toEntities, toEntity } from '../db/collections';
import { nextTicketNumber } from '../db/sequences';
import { notifyQuietly } from './notifications';

/**
 * Support tickets.
 *
 * Two views of the same data with different rules:
 *
 *  - the CUSTOMER sees their own tickets and only the public messages;
 *  - an AGENT sees every ticket and the internal notes too.
 *
 * That split is enforced here rather than in the components, because an
 * internal note leaking into a customer view is the kind of mistake that is
 * invisible until it is very visible.
 */

export async function createTicket(input: {
  userId: string;
  requesterName: string;
  requesterEmail: string;
  subject: string;
  category: SupportCategory;
  body: string;
  orderId?: string | null;
  orderNumber?: string | null;
}): Promise<SupportTicket> {
  const now = new Date();
  const iso = now.toISOString();
  const ticketId = entityId('tkt');

  // Anything about money or a delivery that has gone wrong jumps the queue.
  const priority: TicketPriority =
    input.category === 'PAYMENT_ISSUE' || input.category === 'DELIVERY_ISSUE'
      ? 'HIGH'
      : 'NORMAL';

  const message: TicketMessage = {
    id: entityId('msg'),
    ticketId,
    authorKind: 'CUSTOMER',
    authorName: input.requesterName,
    body: input.body,
    attachments: [],
    internal: false,
    createdAt: iso,
  };

  const ticket: SupportTicket = {
    id: ticketId,
    ticketNumber: await nextTicketNumber(now),
    userId: input.userId,
    requesterName: input.requesterName,
    requesterEmail: input.requesterEmail,
    subject: input.subject,
    category: input.category,
    status: 'OPEN',
    priority,
    orderId: input.orderId ?? null,
    orderNumber: input.orderNumber ?? null,
    orderItemId: null,
    sellerId: null,
    assignedToUserId: null,
    assignedToName: null,
    messages: [message],
    firstRespondedAt: null,
    resolvedAt: null,
    slaDueAt: new Date(now.getTime() + SUPPORT.slaHours[priority] * 3_600_000).toISOString(),
    satisfactionRating: null,
    createdAt: iso,
    updatedAt: iso,
  };

  const tickets = await collections.supportTickets();
  await tickets.insertOne({ ...ticket, _id: ticket.id });

  notifyQuietly({
    userId: input.userId,
    category: 'SYSTEM',
    title: `We have your message (${ticket.ticketNumber})`,
    body: `Someone will reply within ${SUPPORT.slaHours[priority]} hours.`,
    href: '/account/support',
    entityType: 'ticket',
    entityId: ticket.id,
  });

  return ticket;
}

/** Add a message. `internal` notes are agent-only and never shown to customers. */
export async function replyToTicket(input: {
  ticketId: string;
  authorKind: TicketMessage['authorKind'];
  authorName: string;
  body: string;
  internal?: boolean;
  /** When set, the ticket is scoped to this user — the customer view. */
  asUserId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const tickets = await collections.supportTickets();

  const filter = input.asUserId
    ? { _id: input.ticketId, userId: input.asUserId }
    : { _id: input.ticketId };

  const ticket = toEntity(await tickets.findOne(filter));
  if (!ticket) return { ok: false, error: 'Ticket not found.' };

  const iso = new Date().toISOString();
  const fromAgent = input.authorKind === 'AGENT';

  const message: TicketMessage = {
    id: entityId('msg'),
    ticketId: ticket.id,
    authorKind: input.authorKind,
    authorName: input.authorName,
    body: input.body,
    attachments: [],
    internal: input.internal ?? false,
    createdAt: iso,
  };

  await tickets.updateOne(
    { _id: ticket.id },
    {
      $push: { messages: message },
      $set: {
        updatedAt: iso,
        // The first-response clock stops on the first PUBLIC agent reply. An
        // internal note is not a response to the customer.
        ...(fromAgent && !message.internal && !ticket.firstRespondedAt
          ? { firstRespondedAt: iso }
          : {}),
        status: fromAgent
          ? message.internal
            ? ticket.status
            : 'WAITING_ON_CUSTOMER'
          : 'IN_PROGRESS',
      },
    },
  );

  if (fromAgent && !message.internal) {
    notifyQuietly({
      userId: ticket.userId,
      category: 'SYSTEM',
      title: `Reply on ${ticket.ticketNumber}`,
      body: input.body.slice(0, 140),
      href: '/account/support',
      entityType: 'ticket',
      entityId: ticket.id,
    });
  }

  return { ok: true };
}

export async function setTicketStatus(
  ticketId: string,
  status: SupportTicket['status'],
): Promise<{ ok: boolean }> {
  const tickets = await collections.supportTickets();
  const iso = new Date().toISOString();

  await tickets.updateOne(
    { _id: ticketId },
    {
      $set: {
        status,
        updatedAt: iso,
        ...(status === 'RESOLVED' || status === 'CLOSED' ? { resolvedAt: iso } : {}),
      },
    },
  );

  return { ok: true };
}

/* ------------------------------------------------------------------ reads */

/** Customer view: own tickets, public messages only. */
export async function listMyTickets(userId: string): Promise<SupportTicket[]> {
  const tickets = await collections.supportTickets();
  const rows = toEntities(
    await tickets.find({ userId }).sort({ updatedAt: -1 }).limit(50).toArray(),
  );

  return rows.map((ticket) => ({
    ...ticket,
    messages: ticket.messages.filter((message) => !message.internal),
  }));
}

/** Agent view: every ticket, every message. */
export async function listAllTickets(
  options: { status?: string; limit?: number } = {},
): Promise<SupportTicket[]> {
  const filter: Record<string, unknown> = {};
  if (options.status && options.status !== 'ALL') filter.status = options.status;

  const tickets = await collections.supportTickets();
  return toEntities(
    await tickets
      // Urgent first, then oldest — the queue order an agent should work in.
      .find(filter)
      .sort({ priority: 1, createdAt: 1 })
      .limit(options.limit ?? 100)
      .toArray(),
  );
}
