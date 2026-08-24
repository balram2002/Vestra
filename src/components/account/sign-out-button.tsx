'use client';

import { LogOut } from 'lucide-react';
import { useTransition } from 'react';

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
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => { await signOut(); })}
      className="border-line-strong text-muted hover:border-ink hover:text-ink inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-60"
    >
      <LogOut className="size-4" aria-hidden />
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
