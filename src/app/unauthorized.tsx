import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * Rendered by `requireUser()`.
 *
 * A 401 page rather than a redirect, so the visitor keeps the URL they asked
 * for and returns to it after signing in.
 */
export default function Unauthorized() {
  return (
    <div className="gutter shell-max flex min-h-[60dvh] flex-col items-center justify-center py-16 text-center">
      <h1 className="font-display text-ink text-2xl">Sign in to continue</h1>
      <p className="text-muted mt-2 max-w-md text-sm">
        This page is part of your account. Sign in and we will bring you straight back here.
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/register">Create an account</Link>
        </Button>
      </div>
    </div>
  );
}
