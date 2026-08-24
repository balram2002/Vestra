import { MapPin, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';

export const metadata: Metadata = {
  title: 'Your addresses',
  robots: { index: false, follow: false },
};

/**
 * Saved addresses.
 *
 * Scoped to the session's user id, never to a request parameter, so one
 * customer cannot read another's addresses by changing a URL.
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-ink text-2xl">Your addresses</h1>
        <Button size="sm" variant="secondary" disabled>
          <Plus className="size-4" />
          Add address
        </Button>
      </div>

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
    await addressCol.find({ userId: user.id }).sort({ isDefault: -1 }).toArray(),
  );

  return (
    <>

      {addresses.length === 0 ? (
        <div className="border-line mt-8 flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
          <MapPin className="text-faint size-8" aria-hidden />
          <h2 className="text-ink mt-4 text-md font-semibold">No addresses saved</h2>
          <p className="text-muted mt-1.5 max-w-sm text-sm">
            Add one here, or enter it during checkout and we will save it for next time.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {addresses.map((address) => (
            <li key={address.id} className="border-line rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <span className="text-faint text-2xs uppercase tracking-wider">
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
              <p className="text-muted text-sm">
                {address.city}, {address.state} {address.pincode}
              </p>
              <p className="text-faint mt-1.5 text-xs">{address.phone}</p>
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
        <div key={i} className="skeleton h-36 rounded-lg" />
      ))}
    </div>
  );
}
