'use client';

import { LogOut } from 'lucide-react';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { clearPreferredSizes } from '@/hooks/use-preferred-size';

import { signOut } from '@/server/actions/auth';

/**
 * Sign out.
 *
 * A form-free button wrapped in `useTransition` so the click shows a pending
 * state in the same tick rather than sitting inert while the cookie is cleared
 * and the redirect resolves.
 */
export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          // The size hint on product pages belongs to the account, not to this
          // browser, so it leaves with the session.
          clearPreferredSizes();
          await signOut();
        })
      }
      variant="secondary"
      size="sm"
      className="shrink-0"
    >
      <LogOut className="size-4" aria-hidden />
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
