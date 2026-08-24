import { Bell, MapPin, Package, RotateCcw, Star, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import { signOut } from '@/server/actions/auth';
import { requireUser } from '@/server/auth/session';

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
};

/**
 * Account home.
 *
 * `requireUser` renders the nearest `unauthorized.tsx` rather than redirecting,
 * so the visitor keeps the URL they asked for and lands back here after signing
 * in. `proxy.ts` will usually have redirected first; this is the real guard.
 */
export default function AccountPage() {
  // The session read is what makes this dynamic, so it lives inside the
  // boundary; the page shell itself still prerenders.
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <AccountDetail />
    </Suspense>
  );
}

async function AccountDetail() {
  const user = await requireUser();

  const links = [
    { href: '/orders', icon: Package, title: 'Your orders', body: 'Track, cancel, return or exchange' },
    { href: '/account/addresses', icon: MapPin, title: 'Addresses', body: 'Delivery and billing addresses' },
    { href: '/account/returns', icon: RotateCcw, title: 'Returns and refunds', body: 'Requests in progress' },
    { href: '/account/reviews', icon: Star, title: 'Your reviews', body: 'Ratings you have written' },
    { href: '/account/notifications', icon: Bell, title: 'Notifications', body: 'Email, SMS and app preferences' },
  ];

  return (
    <div className="gutter shell-max py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-ink text-2xl">{user.fullName}</h1>
          <p className="text-muted mt-0.5 text-sm">{user.email}</p>
          {!user.emailVerified ? (
            <p className="text-warning-700 mt-1 text-xs">Email not verified yet</p>
          ) : null}
        </div>

        <form action={signOut}>
          <Button type="submit" variant="secondary" size="sm">
            Sign out
          </Button>
        </form>
      </div>

      {user.creditBalance > 0 ? (
        <div className="border-accent-line bg-accent-soft mt-6 flex items-center gap-3 rounded-lg border p-4">
          <Wallet className="text-accent-ink size-5 shrink-0" aria-hidden />
          <p className="text-sm">
            <span className="text-ink font-semibold">
              {formatMoney(user.creditBalance)} in Vestra Credit
            </span>
            <span className="text-muted"> — applied automatically at checkout.</span>
          </p>
        </div>
      ) : null}

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map(({ href, icon: Icon, title, body }) => (
          <li key={href}>
            <Link
              href={href}
              className="border-line bg-raised hover:border-accent-line flex h-full gap-3 rounded-lg border p-4 transition-colors"
            >
              <Icon className="text-accent-ink mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="text-ink text-sm font-semibold">{title}</p>
                <p className="text-muted mt-0.5 text-xs">{body}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="gutter shell-max py-6" aria-hidden>
      <div className="skeleton h-8 w-48 rounded-sm" />
      <div className="skeleton mt-2 h-4 w-64 rounded-xs" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton h-20 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
