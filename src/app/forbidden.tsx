import { Lock } from 'lucide-react';
import Link from 'next/link';

import { StatusPage } from '@/components/layout/status-page';
import { Button } from '@/components/ui/button';

/**
 * Rendered by `requirePermission()` when a signed-in user lacks the grant.
 *
 * Deliberately distinct from the 401: telling someone to sign in when they are
 * already signed in sends them round a loop.
 */
export default function Forbidden() {
  return (
    <StatusPage
      icon={Lock}
      tone="warning"
      title="You do not have access to this"
      body="Your account is signed in, but this area needs a permission it does not have. If you think that is wrong, ask an administrator to check your role."
      actions={
        <Button asChild variant="secondary">
          <Link href="/">Go to the home page</Link>
        </Button>
      }
    />
  );
}
