import { CheckCircle2, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { verifyEmail } from '@/server/actions/auth';

export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false, follow: false },
};

/**
 * Where the confirmation link lands.
 *
 * The token is spent on arrival rather than behind a button. A confirmation
 * link is not a destructive action — the worst a prefetching mail client can do
 * is confirm an address its owner asked us to confirm — and adding a "click
 * here to really confirm" step doubles the work for no protection.
 */
export default function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <Suspense fallback={<div className="skeleton h-48 rounded-lg" aria-hidden />}>
      <Verify searchParams={searchParams} />
    </Suspense>
  );
}

async function Verify({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const result = token ? await verifyEmail(token) : { ok: false, error: 'That link is incomplete.' };

  if (result.ok) {
    return (
      <div className="space-y-4">
        <CheckCircle2 className="text-success-600 size-8" aria-hidden />
        <div>
          <h1 className="font-display text-ink text-2xl">Email confirmed</h1>
          <p className="text-muted mt-2 text-sm">
            Order confirmations, delivery updates and refund receipts will reach you at this
            address.
          </p>
        </div>
        <Link
          href="/account"
          className="bg-ink text-canvas inline-flex items-center justify-center rounded-md px-5 py-3 text-sm font-medium"
        >
          Go to your account
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <XCircle className="text-danger-600 size-8" aria-hidden />
      <div>
        <h1 className="font-display text-ink text-2xl">That link did not work</h1>
        <p className="text-muted mt-2 text-sm">{result.error}</p>
      </div>
      <p className="text-muted text-sm">
        <Link href="/account" className="text-accent-ink font-medium underline underline-offset-2">
          Open your account
        </Link>{' '}
        to send yourself a new one.
      </p>
    </div>
  );
}
