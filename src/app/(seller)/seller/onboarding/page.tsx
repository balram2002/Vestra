import { CheckCircle2, Circle, Clock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { PageHeader } from '@/components/console/page-header';
import { SellerApplicationForm } from '@/components/seller/application-form';
import { StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SELLER_STATUS_META } from '@/domain/enums';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { BUSINESS_TYPES } from '@/lib/validation/seller';
import { requireSellerAccount } from '@/server/auth/session';
import { collections, toEntity } from '@/server/db/collections';
import { sellableDepartments } from '@/server/services/onboarding';

export const metadata: Metadata = {
  title: 'Your application',
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="skeleton h-96 rounded-lg" aria-hidden />}>
      <Onboarding />
    </Suspense>
  );
}

/**
 * Where an application stands.
 *
 * The one screen an applicant can reach before their store is approved, so it
 * answers the only questions they have: is anything waiting on me, and what
 * happens next. A rejected application is corrected and resent right here.
 */
async function Onboarding() {
  const user = await requireSellerAccount();

  const sellers = await collections.sellers();
  const store = toEntity(await sellers.findOne({ _id: user.sellerId }));
  if (!store) redirect('/sell-with-us/apply');

  // An approved store has no business on this screen; the console is open.
  if (store.status === 'ACTIVE' || store.status === 'APPROVED') redirect('/seller');

  const departments = await sellableDepartments();
  const sells = departments
    .filter((department) => store.approvedCategoryIds.includes(department.id))
    .map((department) => department.name);

  const rejected = store.status === 'REJECTED';
  const paused = store.status === 'SUSPENDED' || store.status === 'ON_HOLD';
  const businessType =
    BUSINESS_TYPES.find((type) => type.value === store.kyc.businessType)?.label ?? store.kyc.businessType;

  return (
    <>
      <PageHeader
        title={store.displayName}
        description={`Applied ${formatDate(store.joinedAt)}`}
        actions={<StatusBadge meta={SELLER_STATUS_META[store.status]} size="lg" />}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-6">
          {rejected ? (
            <>
              <div role="status" className="border-danger-100 bg-danger-50 rounded-lg border p-4">
                <p className="text-danger-700 text-sm font-semibold">Your application needs a change</p>
                <p className="text-danger-700/90 mt-1 text-sm">
                  {store.kyc.rejectionReason ??
                    'Our team could not approve it as it stands. Check your details below and send it again.'}
                </p>
              </div>
              <Card as="section">
                <h2 className="text-ink text-md font-semibold">Correct your details and send them again</h2>
                <div className="mt-5">
                  <SellerApplicationForm
                    departments={departments}
                    initial={{
                      displayName: store.displayName,
                      businessType: store.kyc.businessType,
                      supportEmail: store.supportEmail,
                      supportPhone: store.supportPhone,
                      city: store.kyc.registeredAddress.city,
                      state: store.kyc.registeredAddress.state,
                      categoryIds: store.approvedCategoryIds,
                      gstin: store.kyc.gstin,
                    }}
                  />
                </div>
              </Card>
            </>
          ) : paused ? (
            <div role="status" className="border-warning-100 bg-warning-50 rounded-lg border p-4">
              <p className="text-warning-700 text-sm font-semibold">
                {SELLER_STATUS_META[store.status].label}
              </p>
              <p className="text-warning-700/90 mt-1 text-sm">
                {store.kyc.rejectionReason ??
                  'Your store is paused. Contact support and we will talk it through.'}{' '}
                <Link href="/account/support" className="underline underline-offset-2">
                  Contact support
                </Link>
              </p>
            </div>
          ) : (
            <div className="border-info-100 bg-info-50 flex items-start gap-3 rounded-lg border p-4">
              <Clock className="text-info-700 mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="text-info-700 text-sm font-semibold">We are reviewing your application</p>
                <p className="text-info-700/80 mt-0.5 text-sm">
                  Nothing is waiting on you. Most applications are answered within two working days,
                  and we let you know either way. This page changes as soon as there is news.
                </p>
              </div>
            </div>
          )}

          {rejected ? null : (
            <Card as="section">
              <h2 className="text-ink text-md font-semibold">What you told us</h2>
              <dl className="divide-line mt-3 divide-y text-sm">
                <Row label="Store name" value={store.displayName} />
                <Row label="Business type" value={businessType} />
                <Row label="Contact" value={`${store.supportEmail} · +91 ${store.supportPhone}`} />
                <Row
                  label="Location"
                  value={`${store.kyc.registeredAddress.city}, ${store.kyc.registeredAddress.state}`}
                />
                <Row label="Sells" value={sells.length > 0 ? sells.join(', ') : 'Not chosen'} />
                <Row label="GSTIN" value={store.kyc.gstin || 'Not added yet'} />
              </dl>
              <p className="text-faint mt-3 text-2xs">
                Something wrong?{' '}
                <Link href="/account/support" className="text-ink underline underline-offset-2">
                  Tell us
                </Link>{' '}
                and we will correct it.
              </p>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card as="section">
            <h2 className="text-ink text-sm font-semibold">What happens next</h2>
            <ol className="mt-3 space-y-3">
              <Step state="done" title="You applied" body={formatDate(store.joinedAt)} />
              <Step
                state={rejected ? 'todo' : 'current'}
                title="We review it"
                body="Usually within two working days."
              />
              <Step
                state="todo"
                title="You set up and sell"
                body="List products, and add your pickup address, GST and bank details as you need them."
              />
            </ol>
          </Card>

          <Card as="section">
            <h2 className="text-ink text-sm font-semibold">Good to have ready</h2>
            <p className="text-muted mt-1 text-xs">
              None of these is needed to apply. You add each one in your console after approval,
              when it is first needed.
            </p>
            <ul className="text-ink mt-3 list-disc space-y-1.5 pl-4 text-xs">
              <li>A pickup address, before your first order ships</li>
              <li>Your GSTIN and PAN, for your invoices</li>
              <li>A bank account, for your payouts</li>
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink break-words sm:text-right">{value}</dd>
    </div>
  );
}

function Step({
  state,
  title,
  body,
}: {
  state: 'done' | 'current' | 'todo';
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-2.5">
      {state === 'done' ? (
        <CheckCircle2 className="text-success-600 mt-0.5 size-4 shrink-0" aria-hidden />
      ) : state === 'current' ? (
        <Clock className="text-info-700 mt-0.5 size-4 shrink-0" aria-hidden />
      ) : (
        <Circle className="text-faint mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      <div>
        <p className={cn('text-sm', state === 'todo' ? 'text-muted' : 'text-ink font-medium')}>
          {title}
          {state === 'current' ? <span className="sr-only"> (in progress)</span> : null}
        </p>
        <p className="text-faint mt-0.5 text-2xs">{body}</p>
      </div>
    </li>
  );
}
