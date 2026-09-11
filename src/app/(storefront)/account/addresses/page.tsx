import { MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AddressCardActions, AddressFormDialog } from '@/components/account/address-form';
import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { requireUser } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';

export const metadata: Metadata = {
  title: 'Your addresses',
  robots: { index: false, follow: false },
};

/**
 * The address book.
 *
 * Addresses are read with the user id IN the query, so a customer cannot read
 * another's by changing a URL, and every change goes through actions that
 * scope the same way. The default comes first, because it is the one checkout
 * picks.
 */
export default function AddressesPage() {
  return (
    <div className="gutter shell-max py-6">
      <Breadcrumbs
        items={[
          { href: '/account', label: 'Account' },
          { href: '/account/addresses', label: 'Addresses' },
        ]}
      />

      <h1 className="font-display text-ink mt-3 text-2xl">Your addresses</h1>

      <Suspense fallback={<AddressSkeleton />}>
        <AddressList />
      </Suspense>
    </div>
  );
}

async function AddressList() {
  const user = await requireUser();

  const addressCol = await collections.addresses();
  const addresses = toEntities(
    await addressCol.find({ userId: user.id }).sort({ isDefault: -1, updatedAt: -1 }).toArray(),
  );

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted text-sm">
          {addresses.length === 0
            ? 'Save one now and checkout takes a single tap.'
            : `${addresses.length} of 10 saved`}
        </p>
        <AddressFormDialog defaultName={user.fullName} defaultPhone={user.phone ?? ''} />
      </div>

      {addresses.length === 0 ? (
        <div className="border-line mt-6 flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
          <MapPin className="text-faint size-8" aria-hidden />
          <h2 className="text-ink mt-4 text-md font-semibold">No addresses saved</h2>
          <p className="text-muted mt-1.5 max-w-sm text-sm">
            Add one here, or during checkout, and it is ready for next time.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="border-line bg-raised flex flex-col rounded-xl border p-4"
            >
              <div className="flex items-center gap-2">
                <span className="text-faint text-2xs font-semibold uppercase tracking-wider">
                  {address.label}
                </span>
                {address.isDefault ? (
                  <Badge tone="accent" size="sm">
                    Default
                  </Badge>
                ) : null}
              </div>

              <p className="text-ink mt-1.5 text-sm font-medium">{address.fullName}</p>
              <p className="text-muted mt-0.5 text-sm">
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ''}
              </p>
              {address.landmark ? (
                <p className="text-muted text-sm">{address.landmark}</p>
              ) : null}
              <p className="text-muted text-sm">
                {address.city}, {address.state} {address.pincode}
              </p>
              <p className="text-faint mt-1.5 text-xs">{address.phone}</p>

              <div className="mt-auto">
                <AddressCardActions address={address} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function AddressSkeleton() {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="skeleton h-44 rounded-xl" />
      ))}
    </div>
  );
}