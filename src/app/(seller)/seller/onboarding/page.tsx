import { CheckCircle2, Clock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { KycDocuments } from '@/components/seller/kyc-documents';
import { StatusBadge } from '@/components/ui/badge';
import { SELLER_STATUS_META } from '@/domain/enums';
import { formatDate } from '@/lib/format';
import { requireSellerAccount } from '@/server/auth/session';
import { collections, toEntity } from '@/server/db/collections';

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
 * has to answer the only question they have: what happens next, and is
 * anything waiting on me. Each state says which of those it is.
 */
async function Onboarding() {
  const user = await requireSellerAccount();

  const sellers = await collections.sellers();
  const store = toEntity(await sellers.findOne({ _id: user.sellerId }));
  if (!store) redirect('/sell-with-us/apply');

  // An approved store has no business on this screen; the console is open.
  if (store.status === 'ACTIVE' || store.status === 'APPROVED') redirect('/seller');

  const inReview = store.status === 'KYC_SUBMITTED' || store.status === 'KYC_PENDING';

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-ink text-xl">{store.displayName}</h1>
          <p className="text-muted mt-1 text-sm">
            Applied {formatDate(store.joinedAt)} · store code{' '}
            <span className="tabular">{store.code}</span>
          </p>
        </div>
        <StatusBadge meta={SELLER_STATUS_META[store.status]} size="lg" />
      </div>

      <div className="mt-6 max-w-2xl space-y-6">
        {inReview ? (
          <div className="border-info-100 bg-info-50 flex items-start gap-3 rounded-lg border p-4">
            <Clock className="text-info-700 mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="text-info-700 text-sm font-semibold">With our team</p>
              <p className="text-info-700/80 mt-0.5 text-sm">
                Nothing is waiting on you. We check the documents against the GSTIN and the bank
                account, and usually come back within two working days.
              </p>
            </div>
          </div>
        ) : null}

        {store.status === 'SUSPENDED' || store.status === 'ON_HOLD' ? (
          <div className="border-warning-100 bg-warning-50 rounded-lg border p-4">
            <p className="text-warning-700 text-sm font-semibold">
              {SELLER_STATUS_META[store.status].label}
            </p>
            <p className="text-warning-700/80 mt-0.5 text-sm">
              {store.kyc.rejectionReason ??
                'Your store is paused. Contact support and we will talk it through.'}
            </p>
          </div>
        ) : null}

        <KycDocuments
          status={store.status}
          documents={store.kyc.documents}
          rejectionReason={store.kyc.rejectionReason}
        />

        {/* What we already hold, so an applicant can check it before we do. */}
        <section className="border-line bg-raised rounded-lg border p-5">
          <h2 className="text-ink text-md font-semibold">What you told us</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Registered name" value={store.legalName} />
            <Row label="GSTIN" value={store.kyc.gstin} />
            <Row label="PAN" value={store.kyc.pan} />
            <Row
              label="Pickup"
              value={`${store.kyc.registeredAddress.city}, ${store.kyc.registeredAddress.state} ${store.kyc.registeredAddress.pincode}`}
            />
            <Row label="Payouts to" value={store.bank.accountNumberMasked} />
            <Row label="Support" value={store.supportEmail} />
          </dl>
          <p className="text-faint mt-3 text-2xs">
            Something wrong?{' '}
            <Link href="/account/support" className="text-ink underline underline-offset-2">
              Tell us
            </Link>{' '}
            and we will correct it before review.
          </p>
        </section>

        <section className="border-line rounded-lg border border-dashed p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="text-faint mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="text-ink text-sm font-medium">Once you are approved</p>
              <p className="text-muted mt-0.5 text-sm">
                Your console unlocks and you can list products, set stock and start taking orders.
                Money settles {7} days after each delivery, once its return window has closed.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink tabular text-right">{value}</dd>
    </div>
  );
}
