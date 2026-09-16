import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LoginForm } from '@/components/auth/login-form';
import { GoogleSignIn } from '@/components/auth/google-sign-in';
import { SignedInRedirect } from '@/components/auth/signed-in-redirect';
import { SessionExpiredDialog } from '@/components/auth/session-expired-dialog';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

/**
 * `next` carries where the visitor was headed before `proxy.ts` intercepted
 * them, so signing in returns them there instead of dumping them on the home
 * page. Reading it makes this dynamic, hence the boundary.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; session?: string }>;
}) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Resolved searchParams={searchParams} />
    </Suspense>
  );
}

async function Resolved({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; session?: string }> }) {
  const { next, error, session } = await searchParams;
  const messages: Record<string, string> = {
    'google-unavailable': 'Google sign-in is not configured yet. Please use your email.',
    'google-cancelled': 'Google sign-in was cancelled. You can try again.',
    'google-existing': 'An account already uses this email. Sign in with your password, or reset it to regain access.',
    'google-inactive': 'This account is not active. Please contact support.',
    'google-failed': 'Google sign-in could not be completed. Please try again.',
  };
  return (
    <>
      <SignedInRedirect next={next} />
      {session === 'expired' ? <SessionExpiredDialog /> : null}
      {error && messages[error] ? <p role="alert" className="bg-danger-50 text-danger-700 mb-4 rounded-xl p-3 text-sm">{messages[error]}</p> : null}
      <GoogleSignIn next={next} />
      <LoginForm next={next} />
    </>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="skeleton h-8 w-32 rounded-sm" />
      <div className="skeleton h-16 w-full rounded-md" />
      <div className="skeleton h-16 w-full rounded-md" />
      <div className="skeleton h-12 w-full rounded-md" />
    </div>
  );
}
