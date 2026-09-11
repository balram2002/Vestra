import { CheckCircle2, CircleDashed, ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { PageHeader } from '@/components/console/page-header';
import { KycDocuments } from '@/components/seller/kyc-documents';
import {
  BankAccountForm,
  BusinessDetailsForm,
  PickupAddressForm,
  StoreProfileForm,
} from '@/components/seller/profile-forms';
import { StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SELLER_STATUS_META } from '@/domain/enums';
import { formatDate, formatMoney } from '@/lib/format';
import { requireSeller } from '@/server/auth/session';
import { collections, toEntity } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Settings' };

export default function SellerSettingsPage() {
  return (
    <>
      <PageHeader
        title="Store settings"
        description="Your store profile, business details, pickup address and payout account. Each section saves on its own."
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  const user = await requireSeller();
  const [sellerCol, locationCol] = await Promise.all([
    collections.sellers(),
    collections.sellerLocations(),
  ]);

  const seller = toEntity(await sellerCol.findOne({ _id: user.sellerId }));
  if (!seller) return null;

  const pickup =
    toEntity(await locationCol.findOne({ sellerId: seller.id, isPrimary: true })) ??
    toEntity(await locationCol.findOne({ sellerId: seller.id }));
  const hasBank = Boolean(seller.bank.accountNumberMasked);

  return (
    <div className="mt-6 space-y-6">
      <Card as="section" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
        <StatusBadge meta={SELLER_STATUS_META[seller.status]} size="sm" />
        <span className="text-muted">
          Store code <span className="text-ink tabular">{seller.code}</span>
        </span>
        <span className="text-muted">Joined {formatDate(seller.joinedAt)}</span>
        <Link
          href={`/store/${seller.slug}`}
          className="text-accent-ink inline-flex items-center gap-1 font-medium sm:ml-auto"
        >
          View your store page
          <ExternalLink className="size-3" aria-hidden />
        </Link>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          id="profile"
          title="Store profile"
          description="What shoppers see on your store page."
          done={Boolean(seller.about)}
        >
          <StoreProfileForm
            initial={{
              tagline: seller.tagline ?? '',
              about: seller.about,
              supportEmail: seller.supportEmail,
              supportPhone: seller.supportPhone,
            }}
          />
        </Section>

        <Section
          id="business"
          title="Business and tax"
          description="Printed on the invoice for every order you sell."
          done={Boolean(seller.kyc.gstin)}
        >
          <BusinessDetailsForm
            initial={{
              legalName: seller.legalName,
              businessType: seller.kyc.businessType,
              gstin: seller.kyc.gstin,
              pan: seller.kyc.pan,
            }}
          />
        </Section>

        <Section
          id="pickup"
          title="Pickup address"
          description="Where couriers collect your parcels, and where returns come back to. Needed before your first order ships."
          done={Boolean(pickup)}
        >
          <PickupAddressForm
            initial={{
              contactName: pickup?.contactName ?? user.fullName,
              phone: pickup?.phone ?? seller.supportPhone,
              line1: pickup?.line1 ?? '',
              line2: pickup?.line2 ?? '',
              city: pickup?.city ?? seller.kyc.registeredAddress.city,
              state: pickup?.state ?? seller.kyc.registeredAddress.state,
              pincode: pickup?.pincode ?? '',
            }}
          />
        </Section>

        <Section
          id="bank"
          title="Payout account"
          description="Your earnings are paid here once each order clears its return window."
          done={hasBank}
        >
          <BankAccountForm
            current={
              hasBank
                ? {
                    holder: seller.bank.accountHolderName,
                    masked: seller.bank.accountNumberMasked,
                    ifsc: seller.bank.ifsc,
                    bankName: seller.bank.bankName,
                  }
                : null
            }
          />
        </Section>
      </div>

      <div id="documents" className="scroll-mt-24">
        <KycDocuments status={seller.status} documents={seller.kyc.documents} rejectionReason={null} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Policies">
          <Field label="Return window" value={`${seller.policies.returnWindowDays} days`} />
          <Field label="Exchange window" value={`${seller.policies.exchangeWindowDays} days`} />
          <Field label="Dispatch promise" value={`${seller.policies.dispatchSlaHours} hours`} />
          <Field label="Cash on delivery" value={seller.policies.codEnabled ? 'Offered' : 'Not offered'} />
          <Field
            label="Free shipping above"
            value={
              seller.policies.freeShippingThreshold
                ? formatMoney(seller.policies.freeShippingThreshold)
                : 'Never'
            }
          />
        </Panel>

        <Panel title="Scorecard">
          {seller.metrics.orderCount === 0 ? (
            <p className="text-muted px-5 py-4 text-xs">
              Your scorecard fills in after your first orders: ratings, on-time dispatch,
              cancellations and returns.
            </p>
          ) : (
            <>
              <Field
                label="Rating"
                value={
                  seller.rating.count > 0
                    ? `${seller.rating.average} from ${seller.rating.count} reviews`
                    : 'No reviews yet'
                }
              />
              <Field label="Fulfilment score" value={`${seller.rating.fulfilmentScore}/100`} />
              <Field label="On-time dispatch" value={`${seller.rating.onTimeDispatchRate}%`} />
              <Field label="Cancellation rate" value={`${seller.rating.cancellationRate}%`} />
              <Field label="Return rate" value={`${seller.rating.returnRate}%`} />
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  description,
  done,
  children,
}: {
  id: string;
  title: string;
  description: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-24">
      <Card as="section" className="h-full">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-ink text-md font-semibold">{title}</h2>
            <p className="text-muted mt-0.5 text-xs">{description}</p>
          </div>
          {done ? (
            <span className="text-success-700 inline-flex shrink-0 items-center gap-1 text-2xs font-medium">
              <CheckCircle2 className="size-3.5" aria-hidden />
              Done
            </span>
          ) : (
            <span className="text-warning-700 inline-flex shrink-0 items-center gap-1 text-2xs font-medium">
              <CircleDashed className="size-3.5" aria-hidden />
              To do
            </span>
          )}
        </header>
        {children}
      </Card>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card as="section" pad="none">
      <header className="border-line border-b px-5 py-3.5">
        <h2 className="text-ink text-md font-semibold">{title}</h2>
      </header>
      <dl className="divide-line divide-y">{children}</dl>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-2.5">
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="text-ink text-xs">{value}</dd>
    </div>
  );
}
