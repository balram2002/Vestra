import { redirect } from 'next/navigation';

import { safeNext } from '@/lib/safe-next';
import { landingPathFor } from '@/server/auth/rbac';
import { getSessionUser } from '@/server/auth/session';

/**
 * Sends someone who is already signed in on from the sign-in and sign-up pages.
 *
 * Without it they are shown a form asking for a password they have already
 * given, and signing in "again" as someone else from there would quietly swap
 * accounts. They go where they were headed, or to their own console or the
 * shop, exactly as signing in would have sent them.
 *
 * Renders nothing, so it can sit in its own Suspense boundary beside a form
 * that stays in the static shell. A visitor with no session cookie costs no
 * database read.
 */
export async function SignedInRedirect({ next }: { next?: string }) {
  const user = await getSessionUser();
  if (user) redirect(safeNext(next) ?? landingPathFor(user.roles));
  return null;
}
