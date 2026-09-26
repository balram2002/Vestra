import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageHeader } from '@/components/console/page-header';
import { StorePageEditor } from '@/components/console/store-page-editor';
import { requirePermission } from '@/server/auth/session';
import { listSellers } from '@/server/services/catalog';
import { getSiteContent } from '@/server/services/site-content';

export const metadata: Metadata = { title: 'Store page' };

/**
 * The public store page (`/store/[slug]`), for every store at once.
 *
 * Three layouts, one live, and a switch for each piece of whichever one is
 * being edited. Per-store customisation belongs to the seller's own storefront
 * settings; this is the shape of the page all of them share.
 */
export default function AdminStorePagePage() {
  return (
    <>
      <PageHeader
        title="Store page"
        description="Choose the layout every seller’s store page uses, and switch each of its sections and buttons on or off."
      />

      <Suspense fallback={<EditorSkeleton />}>
        <Editor />
      </Suspense>
    </>
  );
}

async function Editor() {
  await requirePermission('cms:write');
  const [{ storePage }, sellers] = await Promise.all([getSiteContent(), listSellers(30)]);

  return (
    <StorePageEditor
      config={storePage}
      sellers={sellers
        .filter((seller) => ['ACTIVE', 'APPROVED'].includes(seller.status))
        .map((seller) => ({ slug: seller.slug, name: seller.displayName }))}
    />
  );
}

function EditorSkeleton() {
  return (
    <div className="mt-6 space-y-6" aria-hidden>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="skeleton h-64 rounded-lg" />
        ))}
      </div>
      <div className="skeleton h-96 rounded-lg" />
    </div>
  );
}
