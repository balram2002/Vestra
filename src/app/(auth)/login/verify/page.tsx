import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { TwoFactorForm } from '@/components/auth/two-factor-form';
import { maskEmail } from '@/server/auth/one-time-code';
import { readPendingSignIn, resendAvailableAt } from '@/server/auth/two-factor';

export const metadata: Metadata = {
  title: 'Enter your code',
  robots: { index: false, follow: false },
};

/**
 * Where a correct password on a two-step account lands.
 *
 * It trusts only the signed cookie the password step set, and re-reads the
 * challenge and the account on every visit: a code already used, a sign-in
 * that has timed out, or an account suspended in the last minute all end here
 * with an honest "sign in again", never with a form that cannot succeed.
 */
export default function VerifySignInPage() {
  return (
    <Suspense fallback={<CodeSkeleton />}>
      <Pending />
    </Suspense>
  );
}

async function Pending() {
  const pending = await readPendingSignIn();

  if (!pending) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-ink text-2xl">This sign-in has timed out</h1>
        <p className="text-muted text-sm">
          A code works for 10 minutes. Enter your password again and we will send you a new one.
        </p>
        <Link
          href="/login"
          className="bg-ink text-canvas inline-flex min-h-11 items-center justify-center rounded-md px-5 py-3 text-sm font-medium"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <TwoFactorForm
      sentTo={maskEmail(pending.user.email)}
      sentAt={pending.challenge.sentAt}
      resendAt={resendAvailableAt(pending.challenge)}
    />
  );
}

function CodeSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="skeleton size-11 rounded-full" />
      <div className="skeleton h-8 w-48 rounded-sm" />
      <div className="skeleton h-10 w-full rounded-md" />
      <div className="skeleton h-14 w-full rounded-lg" />
      <div className="skeleton h-12 w-full rounded-md" />
    </div>
  );
}
