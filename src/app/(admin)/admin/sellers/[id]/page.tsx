import { ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { SellerStatusActions } from '@/components/console/admin-actions';
import { PageHeader } from '@/components/console/page-header';
import { StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SELLER_STATUS_META } from '@/domain/enums';
import { formatDate, formatMoneyCompact } from '@/lib/format';
import { BUSINESS_TYPES, VERIFICATION_DOCUMENTS } from '@/lib/validation/seller';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntities, toEntity } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Seller' };

export default function AdminSellerPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="skeleton h-96 rounded-lg" aria-hidden />}>
      <SellerDetail params={params} />
    </Suspense>
  );
}

const PENDING = ['ONBOARDING', 'KYC_SUBMITTED', 'KYC_PENDING'];

/**
 * One store, or one application.
 *
 * Everything a reviewer needs to decide, on one screen: who applied, how to
 * reach them, what they want to sell, and how far their set-up has got. The
 * decision itself is the same control as in the list, so approving from here
 * or from there cannot behave differently.
 */
async function SellerDetail({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }] = await Promise.all([params, requirePermission('seller:read')]);

  const [sellers, users, categoryCol, locations] = await Promise.all([
    collections.sellers(),
    collections.users(),
    collections.categories(),
    collections.sellerLocations(),
  ]);

  const seller = toEntity(await sellers.findOne({ _id: id }));
  if (!seller) notFound();

  const [owner, categories, pickup] = await Promise.all([
    users.findOne({ _id: seller.ownerUserId }).then(toEntity),
    categoryCol.find({ _id: { $in: seller.approvedCategoryIds } }).toArray().then(toEntities),
    locations
      .find({ sellerId: seller.id })
      .sort({ isPrimary: -1 })
      .limit(1)
      .toArray()
      .then((rows) => toEntities(rows)[0] ?? null),
  ]);

  const pending = PENDING.includes(seller.status);
  const live = seller.status === 'ACTIVE' || seller.status === 'APPROVED';
  const businessType =
    BUSINESS_TYPES.find((type) => type.value === seller.kyc.businessType)?.label ?? seller.kyc.businessType;

  return (
    <>
      <PageHeader
        back={{ href: '/admin/sellers', label: 'All sellers' }}
        title={seller.displayName}
        description={
          <>
            Applied {formatDate(seller.joinedAt)} · store code <span className="tabular">{seller.code}</span>
          </>
        }
        meta={<StatusBadge meta={SELLER_STATUS_META[seller.status]} size="sm" />}
        actions={<SellerStatusActions sellerId={seller.id} name={seller.displayName} status={seller.status} />}
      />

      {pending ? (
        <p className="border-info-100 bg-info-50 text-info-700 mt-4 rounded-md border p-3 text-sm">
          Waiting for a decision. Approving opens the seller console; the seller then adds a pickup
          address, tax details and a bank account as they need them. Rejecting sends your reason to
          the applicant, who can correct the application and send it again.
        </p>
      ) : null}

      {seller.status === 'REJECTED' && seller.kyc.rejectionReason ? (
        <p className="border-danger-100 bg-danger-50 text-danger-700 mt-4 rounded-md border p-3 text-sm">
          Sent back: {seller.kyc.rejectionReason}
        </p>
      ) : null}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Panel title="Application">
          <Field label="Store name" value={seller.displayName} />
          <Field label="Business type" value={businessType} />
          <Field label="Registered name" value={seller.legalName} />
          <Field
            label="Sells"
            value={categories.length > 0 ? categories.map((category) => category.name).join(', ') : 'Not chosen'}
          />
          <Field label="GSTIN" value={seller.kyc.gstin || 'Not added yet'} mono={Boolean(seller.kyc.gstin)} />
          <Field label="PAN" value={seller.kyc.pan || 'Not added yet'} mono={Boolean(seller.kyc.pan)} />
        </Panel>

        <Panel title="Contact">
          <Field label="Account" value={owner ? `${owner.fullName} (${owner.email})` : 'Account not found'} />
          <Field label="Store email" value={seller.supportEmail} />
          <Field label="Store phone" value={`+91 ${seller.supportPhone}`} />
          <Field
            label="Location"
            value={`${seller.kyc.registeredAddress.city}, ${seller.kyc.registeredAddress.state}`}
          />
        </Panel>

        <Panel title="Set-up">
          <Field
            label="Pickup address"
            value={
              pickup
                ? [pickup.line1, pickup.line2, `${pickup.city}, ${pickup.state} ${pickup.pincode}`]
                    .filter(Boolean)
                    .join(', ')
                : 'Not added yet'
            }
          />
          <Field
            label="Payout account"
            value={
              seller.bank.accountNumberMasked
                ? `${seller.bank.accountNumberMasked} · ${seller.bank.bankName} (${seller.bank.ifsc})`
                : 'Not added yet'
            }
          />
          <div className="px-5 py-2.5">
            <p className="text-muted text-xs">Documents</p>
            {seller.kyc.documents.length === 0 ? (
              <p className="text-ink mt-1 text-xs">None uploaded yet.</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {seller.kyc.documents.map((document) => (
                  <li key={document.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-ink">
                      {VERIFICATION_DOCUMENTS.find((entry) => entry.type === document.type)?.label ??
                        document.type.replace(/_/g, ' ').toLowerCase()}
                    </span>
                    <a
                      href={document.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent-ink inline-flex items-center gap-1 font-medium"
                    >
                      Open
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <Panel title="Trading">
          <Field label="Approved" value={seller.approvedAt ? formatDate(seller.approvedAt) : 'Not yet'} />
          <Field label="Live listings" value={String(seller.metrics.liveProductCount)} />
          <Field label="Orders" value={String(seller.metrics.orderCount)} />
          <Field label="Lifetime sales" value={formatMoneyCompact(seller.metrics.lifetimeGmv)} />
          <Field
            label="Rating"
            value={seller.rating.count > 0 ? `${seller.rating.average} from ${seller.rating.count} reviews` : 'No reviews yet'}
          />
          {live ? (
            <div className="px-5 py-2.5">
              <Link
                href={`/store/${seller.slug}`}
                className="text-accent-ink inline-flex items-center gap-1 text-xs font-medium"
              >
                Open the store page
                <ExternalLink className="size-3" aria-hidden />
              </Link>
            </div>
          ) : null}
        </Panel>
      </div>
    </>
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

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 px-5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-muted shrink-0 text-xs">{label}</dt>
      <dd className={mono ? 'text-ink tabular break-all text-xs sm:text-right' : 'text-ink break-words text-xs sm:text-right'}>
        {value}
      </dd>
    </div>
  );
}
