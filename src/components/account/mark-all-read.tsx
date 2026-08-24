'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';

import { markNotificationsRead } from '@/server/actions/account';

export function MarkAllRead() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markNotificationsRead();
          if (!result.ok) toast.error(result.error ?? 'That did not work.');
        })
      }
      className="text-muted hover:text-ink text-xs underline-offset-2 hover:underline disabled:opacity-50"
    >
      {pending ? 'Marking...' : 'Mark all as read'}
    </button>
  );
}
