import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * Rendered by `requirePermission()` when a signed-in user lacks the grant.
 *
 * Deliberately distinct from the 401: telling someone to sign in when they are
 * already signed in sends them round a loop.
 */
export default function Forbidden() {
  return (
    <div className="gutter shell-max flex min-h-[60dvh] flex-col items-center justify-center py-16 text-center">
      <h1 className="font-display text-ink text-2xl">You do not have access to this</h1>
      <p className="text-muted mt-2 max-w-md text-sm">
        Your account is signed in, but this area needs a permission it does not have. If you think
        that is wrong, ask an administrator to check your role.
      </p>

      <div className="mt-7">
        <Button asChild variant="secondary">
          <Link href="/">Go to the home page</Link>
        </Button>
      </div>
    </div>
  );
}
