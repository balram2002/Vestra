'use client';

import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

import { markNotificationsRead } from '@/server/actions/account';

export function MarkAllRead() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markNotificationsRead();
          if (!result.ok) toast.error(result.error ?? 'That did not work.');
        })
      }
      variant="ghost"
      size="xs"
    >
      {pending ? 'Marking...' : 'Mark all as read'}
    </Button>
  );
}
