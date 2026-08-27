import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
};

/**
 * The page the reset link lands on.
 *
 * Reading `searchParams` makes this dynamic, so the form sits inside a
 * `<Suspense>` boundary and the shell around it still prerenders.
 */
export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden />}>
      <Resolve searchParams={searchParams} />
    </Suspense>
  );
}

async function Resolve({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-ink text-2xl">That link is incomplete</h1>
        <p className="text-muted text-sm">
          Some mail clients break long links across lines. Ask for a new one and open it in a single
          click.
        </p>
        <Link
          href="/forgot-password"
          className="text-accent-ink text-sm font-medium underline underline-offset-2"
        >
          Send me a new link
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
