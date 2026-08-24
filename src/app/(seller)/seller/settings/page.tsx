import type { Metadata } from 'next';
import { Suspense } from 'react';

import { StatusBadge } from '@/components/ui/badge';
import { SELLER_STATUS_META } from '@/domain/enums';
import { formatDate, formatMoney } from '@/lib/format';
import { requireSeller } from '@/server/auth/session';
import { collections, toEntity } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Settings' };

export default function SellerSettingsPage() {
  return (
    <>
      <h1 className="font-display text-ink text-xl">Store settings</h1>
      <p className="text-muted mt-1 text-sm">Your store profile, policies and payout account.</p>

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  const user = await requireSeller();
  const sellerCol = await collections.sellers();
  const seller = toEntity(await sellerCol.findOne({ _id: user.sellerId }));
  if (!seller) return null;

  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-2">
      <Panel title="Store profile">
        <Field label="Display name" value={seller.displayName} />
        <Field label="Legal name" value={seller.legalName} />
        <Field label="Store code" value={seller.code} mono />
        <Field label="Public URL" value={`/store/${seller.slug}`} mono />
        <Field label="Support email" value={seller.supportEmail} />
        <Field label="Support phone" value={seller.supportPhone} />
      </Panel>

      <Panel
        title="Account status"
        accessory={<StatusBadge meta={SELLER_STATUS_META[seller.status]} size="sm" />}
      >
        <Field label="GSTIN" value={seller.kyc.gstin} mono />
        <Field label="PAN" value={seller.kyc.pan} mono />
        <Field label="Business type" value={seller.kyc.businessType.replace(/_/g, ' ')} />
        <Field label="Joined" value={formatDate(seller.joinedAt)} />
        <Field
          label="KYC verified"
          value={seller.kyc.verifiedAt ? formatDate(seller.kyc.verifiedAt) : 'Pending'}
        />
      </Panel>

      <Panel title="Policies">
        <Field label="Return window" value={`${seller.policies.returnWindowDays} days`} />
        <Field label="Exchange window" value={`${seller.policies.exchangeWindowDays} days`} />
        <Field label="Dispatch SLA" value={`${seller.policies.dispatchSlaHours} hours`} />
        <Field
          label="Cash on delivery"
          value={seller.policies.codEnabled ? 'Offered' : 'Not offered'}
        />
        <Field
          label="Free shipping above"
          value={
            seller.policies.freeShippingThreshold
              ? formatMoney(seller.policies.freeShippingThreshold)
              : 'Never'
          }
        />
      </Panel>

      <Panel title="Payout account">
        <Field label="Account holder" value={seller.bank.accountHolderName} />
        {/* Only the masked number is ever read out of the database. */}
        <Field label="Account number" value={seller.bank.accountNumberMasked} mono />
        <Field label="IFSC" value={seller.bank.ifsc} mono />
        <Field label="Bank" value={`${seller.bank.bankName}, ${seller.bank.branch}`} />
        <Field label="Verified" value={seller.bank.verified ? 'Yes' : 'Pending'} />
      </Panel>

      <Panel title="Scorecard">
        <Field label="Rating" value={`${seller.rating.average} from ${seller.rating.count} reviews`} />
        <Field label="Fulfilment score" value={`${seller.rating.fulfilmentScore}/100`} />
        <Field label="On-time dispatch" value={`${seller.rating.onTimeDispatchRate}%`} />
        <Field label="Cancellation rate" value={`${seller.rating.cancellationRate}%`} />
        <Field label="Return rate" value={`${seller.rating.returnRate}%`} />
      </Panel>
    </div>
  );
}

function Panel({
  title,
  accessory,
  children,
}: {
  title: string;
  accessory?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-line bg-raised rounded-lg border">
      <header className="border-line flex items-center justify-between border-b px-5 py-3.5">
        <h2 className="text-ink text-md font-semibold">{title}</h2>
        {accessory}
      </header>
      <dl className="divide-line divide-y">{children}</dl>
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-2.5">
      <dt className="text-muted text-xs">{label}</dt>
      <dd className={mono ? 'text-ink tabular text-xs' : 'text-ink text-xs'}>{value}</dd>
    </div>
  );
}
