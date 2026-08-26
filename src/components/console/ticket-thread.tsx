'use client';

import { Lock, Send } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { TICKET_STATUSES, TICKET_STATUS_META, type TicketStatus } from '@/domain/enums';
import type { TicketMessage } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { changeTicketStatus, replyAsAgent } from '@/server/actions/support';

/**
 * The agent side of a support conversation.
 *
 * Two things it does that a plain message list does not:
 *
 *  - INTERNAL NOTES live on the same thread as the replies. Splitting them
 *    into a second system is how the context behind a decision gets lost; the
 *    customer view filters them out, and here they are unmistakably marked.
 *  - REPLYING MOVES THE TICKET. An agent who answers has, by definition,
 *    started work, so the status follows the action instead of asking them to
 *    remember a second click. A note is not an answer, so it does not.
 */
export function TicketThread({
  ticketId,
  status,
  messages,
}: {
  ticketId: string;
  status: TicketStatus;
  messages: TicketMessage[];
}) {
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [pending, startTransition] = useTransition();

  const send = () => {
    if (body.trim().length < 2) {
      toast.error('Write a message before sending');
      return;
    }

    startTransition(async () => {
      const result = await replyAsAgent({ ticketId, body, internal });
      if (!result.ok) {
        toast.error(result.error ?? 'That did not send.');
        return;
      }

      toast.success(internal ? 'Note added' : 'Reply sent to the customer');
      setBody('');

      // A public reply means work has started; a private note does not.
      if (!internal && status === 'OPEN') {
        await changeTicketStatus({ ticketId, status: 'IN_PROGRESS' });
      }
    });
  };

  const move = (next: TicketStatus) => {
    startTransition(async () => {
      const result = await changeTicketStatus({ ticketId, status: next });
      if (result.ok) toast.success(`Moved to ${TICKET_STATUS_META[next].label.toLowerCase()}`);
      else toast.error(result.error ?? 'That did not work.');
    });
  };

  return (
    <div className="space-y-5">
      <ol className="space-y-3">
        {messages.map((message) => {
          const fromAgent = message.authorKind === 'AGENT';

          return (
            <li
              key={message.id}
              className={cn(
                'rounded-lg border p-4',
                message.internal
                  ? 'border-warning-100 bg-warning-50'
                  : fromAgent
                    ? 'border-line bg-sunken'
                    : 'border-line bg-raised',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-ink text-xs font-semibold">{message.authorName}</span>
                <span className="text-faint text-2xs">
                  {message.authorKind === 'CUSTOMER'
                    ? 'Customer'
                    : message.authorKind === 'AGENT'
                      ? 'Support'
                      : message.authorKind === 'SELLER'
                        ? 'Seller'
                        : 'System'}
                </span>
                {message.internal ? (
                  <span className="text-warning-700 inline-flex items-center gap-1 text-2xs font-medium">
                    <Lock className="size-3" aria-hidden />
                    Internal note — the customer cannot see this
                  </span>
                ) : null}
                <span className="text-faint ml-auto text-2xs">
                  {formatDateTime(message.createdAt)}
                </span>
              </div>

              <p className="text-ink mt-2 whitespace-pre-wrap text-sm">{message.body}</p>
            </li>
          );
        })}
      </ol>

      {/* ------------------------------------------------------- compose */}

      <div className="border-line bg-raised rounded-lg border p-4">
        <label htmlFor="agent-reply" className="text-ink block text-xs font-medium">
          {internal ? 'Internal note' : 'Reply to the customer'}
        </label>
        <textarea
          id="agent-reply"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={4}
          maxLength={4000}
          placeholder={
            internal
              ? 'Context for whoever picks this up next.'
              : 'The customer reads this. Say what you are doing and by when.'
          }
          className="border-line-strong bg-canvas text-ink placeholder:text-faint mt-1.5 w-full rounded-sm border px-3 py-2 text-sm"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={internal}
              onChange={(event) => setInternal(event.target.checked)}
              className="accent-ink size-4"
            />
            <span className="text-muted text-xs">Internal note</span>
          </label>

          <button
            type="button"
            onClick={send}
            disabled={pending || body.trim().length < 2}
            className="bg-ink text-canvas disabled:bg-line-strong inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-medium disabled:cursor-not-allowed"
          >
            <Send className="size-3.5" aria-hidden />
            {pending ? 'Sending…' : internal ? 'Add note' : 'Send reply'}
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------- status */}

      <div className="border-line flex flex-wrap items-center gap-2 border-t pt-4">
        <span className="text-faint text-2xs uppercase tracking-[0.12em]">Move to</span>
        {TICKET_STATUSES.filter((value) => value !== status).map((value) => (
          <button
            key={value}
            type="button"
            disabled={pending}
            onClick={() => move(value)}
            className="border-line-strong text-muted hover:border-ink hover:text-ink rounded-sm border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50"
          >
            {TICKET_STATUS_META[value].label}
          </button>
        ))}
      </div>
    </div>
  );
}
