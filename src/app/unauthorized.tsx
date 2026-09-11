import { UserCircle } from 'lucide-react';
import Link from 'next/link';

import { StatusPage } from '@/components/layout/status-page';
import { Button } from '@/components/ui/button';

/**
 * Rendered by `requireUser()`.
 *
 * A 401 page rather than a redirect, so the visitor keeps the URL they asked
 * for and returns to it after signing in.
 */
export default function Unauthorized() {
  return (
    <StatusPage
      icon={UserCircle}
      title="Sign in to continue"
      body="This page is part of your account. Sign in and we will bring you straight back here."
      actions={
        <>
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/register">Create an account</Link>
          </Button>
        </>
      }
    />
  );
}
