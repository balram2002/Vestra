import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PasswordForm, ProfileForm } from '@/components/account/profile-forms';
import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { requireUser } from '@/server/auth/session';

export const metadata: Metadata = {
  title: 'Profile and security',
  robots: { index: false, follow: false },
};

/**
 * Profile and security.
 *
 * The account could be read but not changed: no way to fix a misspelt name,
 * add a phone number or change a password without going through "forgot
 * password" and pretending to have lost it.
 */
export default function ProfilePage() {
  return (
    <div className="gutter shell-max py-6">
      <Breadcrumbs
        items={[
          { href: '/account', label: 'Account' },
          { href: '/account/profile', label: 'Profile' },
        ]}
      />
      <h1 className="font-display text-ink mt-3 text-2xl">Profile and security</h1>

      <Suspense fallback={<div className="skeleton mt-6 h-96 max-w-3xl rounded-xl" aria-hidden />}>
        <Sections />
      </Suspense>
    </div>
  );
}

async function Sections() {
  const user = await requireUser();

  return (
    <div className="mt-6 grid max-w-3xl gap-5">
      <section className="border-line bg-raised rounded-xl border p-5 sm:p-6" aria-labelledby="details-title">
        <h2 id="details-title" className="text-ink text-md font-semibold">
          Your details
        </h2>
        <p className="text-muted mt-1 text-sm">
          How we address you, and a number support can reach you on.
        </p>
        <ProfileForm
          fullName={user.fullName}
          email={user.email}
          phone={user.phone ?? ''}
          emailVerified={user.emailVerified}
        />
      </section>

      <section className="border-line bg-raised rounded-xl border p-5 sm:p-6" aria-labelledby="password-title">
        <h2 id="password-title" className="text-ink text-md font-semibold">
          Password
        </h2>
        <p className="text-muted mt-1 text-sm">
          You need your current password to set a new one.
        </p>
        <PasswordForm email={user.email} />
      </section>
    </div>
  );
}