import type { Metadata } from 'next';
import { Suspense } from 'react';

import {
  AvatarEditor,
  PasswordForm,
  PreferencesForm,
  ProfileForm,
} from '@/components/account/profile-forms';
import { TwoFactorSettings } from '@/components/account/two-factor-settings';
import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { requireUser } from '@/server/auth/session';
import { collections, toEntity } from '@/server/db/collections';

export const metadata: Metadata = {
  title: 'Profile and security',
  robots: { index: false, follow: false },
};

/**
 * Profile and security.
 *
 * Everything a person can change about their own account, in the order they
 * come looking for it: who they are, what they want from the shop, and how
 * they sign in. Each card saves on its own, so fixing a typo in a name never
 * asks for a password and changing a password never resubmits a phone number.
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

      <Suspense fallback={<ProfileSkeleton />}>
        <Sections />
      </Suspense>
    </div>
  );
}

async function Sections() {
  const session = await requireUser();

  // The session carries identity only; birthday, gender, preferences and the
  // two-step setting live on the account record.
  const users = await collections.users();
  const record = toEntity(await users.findOne({ _id: session.id }, { projection: { passwordHash: 0 } }));

  return (
    <div className="mt-6 grid max-w-3xl gap-5">
      <Card
        id="details"
        title="Your details"
        description="Your photo, how we address you, and a number support can reach you on."
      >
        <AvatarEditor name={session.fullName} avatarUrl={session.avatarUrl} />
        <div className="border-line my-5 border-t" />
        <ProfileForm
          fullName={session.fullName}
          email={session.email}
          phone={session.phone ?? ''}
          emailVerified={session.emailVerified}
          gender={record?.gender ?? ''}
          dateOfBirth={record?.dateOfBirth ?? ''}
        />
      </Card>

      <Card
        id="preferences"
        title="Preferences"
        description="What we send you, and the sizes you usually wear."
      >
        <PreferencesForm
          marketingOptIn={record?.preferences?.marketingOptIn ?? false}
          preferredSizes={record?.preferences?.preferredSizes ?? {}}
        />
      </Card>

      <Card
        id="security"
        title="Sign-in and security"
        description="How you prove it is you: your password, and an optional code by email."
      >
        <TwoFactorSettings
          key={record?.twoFactor?.enabled ? 'two-factor-on' : 'two-factor-off'}
          enabled={Boolean(record?.twoFactor?.enabled)}
          email={session.email}
        />
        <div className="border-line my-5 border-t" />
        <h3 className="text-ink text-sm font-medium">Change your password</h3>
        <p className="text-muted mt-0.5 text-xs">You need your current password to set a new one.</p>
        <PasswordForm email={session.email} />
      </Card>
    </div>
  );
}

function Card({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="border-line bg-raised scroll-mt-24 rounded-xl border p-5 sm:p-6"
    >
      <h2 id={`${id}-title`} className="text-ink text-md font-semibold">
        {title}
      </h2>
      <p className="text-muted mt-1 mb-5 text-sm">{description}</p>
      {children}
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="mt-6 grid max-w-3xl gap-5" aria-hidden>
      <div className="skeleton h-96 rounded-xl" />
      <div className="skeleton h-72 rounded-xl" />
      <div className="skeleton h-80 rounded-xl" />
    </div>
  );
}
