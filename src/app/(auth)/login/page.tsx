import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LoginForm } from '@/components/auth/login-form';

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
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Resolved searchParams={searchParams} />
    </Suspense>
  );
}

async function Resolved({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <LoginForm next={next} />;
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
