import { AlertTriangle, Copy } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { PromotionToggle } from '@/components/console/admin-actions';
import { CampaignBadge } from '@/components/console/campaigns/campaign-badge';
import { PageHeader } from '@/components/console/page-header';
import { PromotionArchive } from '@/components/console/promotions/promotion-archive';
import { PromotionEditor } from '@/components/console/promotions/promotion-editor';
import { Button } from '@/components/ui/button';
import { PROMOTION_TYPE_LABEL } from '@/domain/promotion-rules';
import { getPromotionEditor, promotionDraftFrom } from '@/server/services/promotions-admin';

export const metadata: Metadata = { title: 'Promotion' };

type Params = Promise<{ id: string }>;

/**
 * One automatic offer. Overlaps lead the page when there are any: they are
 * the thing most likely to be wrong, and the easiest to miss in a form.
 */
export default function PromotionPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="skeleton mt-6 h-[40rem] rounded-lg" aria-hidden />}>
      <Promotion params={params} />
    </Suspense>
  );
}

async function Promotion({ params }: { params: Params }) {
  const { id } = await params;
  const { promotion, row, overlaps, peers, targets } = await getPromotionEditor(id);
  if (!promotion || !row) notFound();

  const liveOverlaps = overlaps.filter((overlap) => peers.find((peer) => peer.id === overlap.other.id)?.isActive);

  return (
    <>
      <PageHeader
        back={{ href: '/admin/promotions', label: 'Promotions' }}
        eyebrow={`${PROMOTION_TYPE_LABEL[promotion.type]} · priority ${promotion.priority}`}
        title={promotion.title}
        description={row.summary}
        meta={<CampaignBadge status={row.status} archived={row.archived} />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!row.archived && row.status !== 'expired' ? (
              <PromotionToggle promotionId={promotion.id} title={promotion.title} isActive={promotion.isActive} />
            ) : null}
            <Button asChild size="sm" variant="secondary">
              <Link href={`/admin/promotions/new?from=${promotion.id}`}>
                <Copy className="size-4" aria-hidden />
                Duplicate
              </Link>
            </Button>
            <PromotionArchive promotionId={promotion.id} title={promotion.title} archived={row.archived} />
          </div>
        }
      />

      {liveOverlaps.length > 0 && promotion.isActive ? (
        <div className="border-warning-100 bg-warning-50 text-warning-700 mt-6 flex gap-3 rounded-lg border p-4 text-sm" role="note">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Live alongside {liveOverlaps.length} other live {liveOverlaps.length === 1 ? 'offer' : 'offers'} on some of the same items.
            Shoppers get whichever takes more off each item — see the overlap panel for which.
          </p>
        </div>
      ) : null}

      <PromotionEditor
        id={promotion.id}
        initial={promotionDraftFrom(promotion)}
        targets={targets}
        peers={peers}
        isLive={row.status === 'live'}
      />
    </>
  );
}
