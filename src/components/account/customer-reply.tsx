'use client';

import { Send } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { replyAsCustomer } from '@/server/actions/support';

/**
 * A reply box under one support conversation.
 *
 * The action already existed and scoped the reply to its owner; nothing on
 * the storefront called it, so a customer could read an agent's question and
 * had no way to answer it.
 */
export function CustomerReply({ ticketId }: { ticketId: string }) {
  const [body, setBody] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;

    startTransition(async () => {
      const result = await replyAsCustomer({ ticketId, body: text });
      if (result.ok) {
        setBody('');
        toast.success('Reply sent');
      } else {
        toast.error(result.error ?? 'Could not send your reply.');
      }
    });
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-2">
      <Textarea
        label="Reply"
        hideLabel
        rows={2}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={4000}
        placeholder="Add a reply"
      />
      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          loading={pending}
          disabled={body.trim() === ''}
        >
          <Send className="size-3.5" aria-hidden />
          Send reply
        </Button>
      </div>
    </form>
  );
}