import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageHeader } from '@/components/console/page-header';
import { PromotionEditor } from '@/components/console/promotions/promotion-editor';
import { getPromotion, getPromotionEditor, newPromotionDraft, promotionDraftFrom } from '@/server/services/promotions-admin';

export const metadata: Metadata = { title: 'New promotion' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** A new automatic offer, blank or copied from another (`?from=<id>`). Saved paused. */
export default function NewPromotionPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<div className="skeleton mt-6 h-[40rem] rounded-lg" aria-hidden />}>
      <Editor searchParams={searchParams} />
    </Suspense>
  );
}

async function Editor({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const from = typeof params.from === 'string' ? params.from : null;
  // Asserts promotion:write before anything else is read.
  const { peers, targets } = await getPromotionEditor(null);
  const source = from ? await getPromotion(from) : null;

  return (
    <>
      <PageHeader
        back={{ href: '/admin/promotions', label: 'Promotions' }}
        title={source ? `Duplicate “${source.title}”` : 'New promotion'}
        description="Saved paused. Check it in the list and calendar, then switch it on — an automatic offer reprices every matching item the moment it is live."
      />
      <PromotionEditor
        id={null}
        initial={source ? promotionDraftFrom(source, { duplicate: true }) : newPromotionDraft()}
        targets={targets}
        peers={peers}
        isLive={false}
      />
    </>
  );
}
