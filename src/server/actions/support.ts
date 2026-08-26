'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { TICKET_STATUSES } from '@/domain/enums';

import { requirePermission, requireUser } from '../auth/session';
import { replyToTicket, setTicketStatus } from '../services/support';

/**
 * Support conversation actions.
 *
 * Two audiences, two entry points, and the difference is the SCOPE rather than
 * the operation: a customer may only reply to their own ticket, so their action
 * passes `asUserId` and the service filters on it; an agent may reply to any,
 * but needs `support:write` to do so.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const bodySchema = z
  .string()
  .trim()
  .min(2, 'Write a message before sending')
  .max(4000, 'That message is too long');

/* ------------------------------------------------------------- customer */

export async function replyAsCustomer(input: {
  ticketId: string;
  body: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = bodySchema.safeParse(input.body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const result = await replyToTicket({
    ticketId: input.ticketId,
    authorKind: 'CUSTOMER',
    authorName: user.fullName,
    body: parsed.data,
    // Scopes the ticket to them: another customer's id simply finds nothing.
    asUserId: user.id,
  });

  revalidatePath('/account/support');
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/* ---------------------------------------------------------------- agent */

export async function replyAsAgent(input: {
  ticketId: string;
  body: string;
  internal?: boolean;
}): Promise<ActionResult> {
  const agent = await requirePermission('support:write');

  const parsed = bodySchema.safeParse(input.body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const result = await replyToTicket({
    ticketId: input.ticketId,
    authorKind: 'AGENT',
    authorName: agent.fullName,
    body: parsed.data,
    /*
     * An internal note is for the next agent, not the customer. It lives on the
     * same thread so the context is not split across two systems, and the
     * customer view filters it out.
     */
    internal: input.internal ?? false,
  });

  revalidatePath('/admin/support');
  revalidatePath(`/admin/support/${input.ticketId}`);
  revalidatePath('/account/support');
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function changeTicketStatus(input: {
  ticketId: string;
  status: string;
}): Promise<ActionResult> {
  const agent = await requirePermission('support:write');

  const parsed = z.enum(TICKET_STATUSES).safeParse(input.status);
  if (!parsed.success) return { ok: false, error: 'That is not a valid status.' };

  const result = await setTicketStatus(input.ticketId, parsed.data, {
    id: agent.id,
    name: agent.fullName,
  });

  revalidatePath('/admin/support');
  revalidatePath(`/admin/support/${input.ticketId}`);
  revalidatePath('/account/support');
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
