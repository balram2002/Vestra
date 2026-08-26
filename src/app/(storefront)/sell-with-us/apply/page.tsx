import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { SellerApplicationForm } from '@/components/seller/application-form';
import { getSessionUser } from '@/server/auth/session';
import { applicableCategories, getApplication } from '@/server/services/onboarding';

export const metadata: Metadata = {
  title: 'Apply to sell on Vestra',
  description:
    'Open a store on Vestra. Tell us about your business, upload your documents, and start listing once you are verified.',
};

export default function ApplyPage() {
  return (
    <div className="gutter shell-max py-8">
      <nav className="text-2xs mb-3">
        <Link href="/sell-with-us" className="text-muted hover:text-ink">
          &larr; Selling on Vestra
        </Link>
      </nav>

      <h1 className="font-display text-ink text-2xl">Open your store</h1>
      <p className="text-muted mt-1 max-w-2xl text-sm">
        Everything below is what we need to verify your business and pay you. It takes about
        fifteen minutes if you have your GSTIN and bank details to hand.
      </p>

      <div className="mt-8 max-w-3xl">
        <Suspense fallback={<div className="skeleton h-96 rounded-lg" aria-hidden />}>
          <ApplyFlow />
        </Suspense>
      </div>
    </div>
  );
}

async function ApplyFlow() {
  const user = await getSessionUser();

  /*
   * A store belongs to an account, so applying requires one. Sent to sign-in
   * with a return path rather than being told to come back later.
   */
  if (!user) redirect('/login?next=/sell-with-us/apply');

  // Already applied: the status screen is the useful place, not a second form.
  const existing = await getApplication(user.id);
  if (existing) redirect('/seller/onboarding');

  const categories = await applicableCategories();
  return <SellerApplicationForm categories={categories} />;
}
