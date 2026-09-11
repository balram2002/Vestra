import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { SellerApplicationForm } from '@/components/seller/application-form';
import { getSessionUser } from '@/server/auth/session';
import { getApplication, sellableDepartments } from '@/server/services/onboarding';

export const metadata: Metadata = {
  title: 'Apply to sell on VestraWAB',
  description:
    'Open a store on VestraWAB. Tell us about your business in two minutes; tax, bank and pickup details come later, when you need them.',
};

const STEPS = [
  { title: 'Apply', body: 'Your business details, in about two minutes. No documents yet.' },
  { title: 'We review', body: 'Usually within two working days. We let you know either way.' },
  {
    title: 'Set up and sell',
    body: 'List your products, and add a pickup address, GST and bank details from your console as you need them.',
  },
];

export default function ApplyPage() {
  return (
    <div className="gutter shell-max py-8 sm:py-10">
      <nav className="mb-4 text-2xs">
        <Link href="/sell-with-us" className="text-muted hover:text-ink">
          &larr; Selling on VestraWAB
        </Link>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="max-w-2xl">
          <h1 className="font-display text-ink text-2xl sm:text-3xl">Open your store</h1>
          <p className="text-muted mt-2 text-sm">
            Just your business details. Tax numbers, a pickup address and a bank account come later,
            in your seller console, when you need them.
          </p>

          <div className="mt-8">
            <Suspense fallback={<div className="skeleton h-96 rounded-lg" aria-hidden />}>
              <ApplyFlow />
            </Suspense>
          </div>
        </div>

        <aside className="lg:pt-16">
          <section className="border-line bg-raised rounded-xl border p-5">
            <h2 className="text-ink text-sm font-semibold">How it works</h2>
            <ol className="mt-4 space-y-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="bg-accent-soft text-accent-ink tabular grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-ink text-sm font-medium">{step.title}</p>
                    <p className="text-muted mt-0.5 text-xs">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
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

  const departments = await sellableDepartments();
  return <SellerApplicationForm departments={departments} email={user.email} />;
}
