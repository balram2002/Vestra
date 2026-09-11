import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageHeader } from '@/components/console/page-header';
import { ListingForm } from '@/components/seller/listing-form';
import { requireSeller } from '@/server/auth/session';
import { authoringOptions } from '@/server/services/authoring';

export const metadata: Metadata = { title: 'New listing' };

/**
 * A new listing starts as a DRAFT and nothing else.
 *
 * Sizes and photography come after the draft exists, because both need
 * something to attach to. Asking for all three at once is how a seller ends up
 * losing twenty minutes of typing to a failed upload.
 */
export default function NewListingPage() {
  return (
    <>
      <PageHeader
        back={{ href: '/seller/products', label: 'All products' }}
        title="New listing"
        description="Start with the details. You can add sizes and photos once it is saved."
      />

      <div className="mt-6 max-w-3xl">
        <Suspense fallback={<div className="skeleton h-96 rounded-lg" aria-hidden />}>
          <NewForm />
        </Suspense>
      </div>
    </>
  );
}

async function NewForm() {
  const user = await requireSeller();
  const options = await authoringOptions(user.sellerId);

  return <ListingForm product={null} brands={options.brands} categories={options.categories} />;
}
