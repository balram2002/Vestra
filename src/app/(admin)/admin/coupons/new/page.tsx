import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CouponEditor } from '@/components/console/coupons/coupon-editor';
import { PageHeader } from '@/components/console/page-header';
import { requirePermission } from '@/server/auth/session';
import {
  couponDraftFrom,
  couponTargetOptions,
  getCouponForDuplicate,
  newCouponDraft,
} from '@/server/services/coupons-admin';

export const metadata: Metadata = { title: 'New coupon' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * A new coupon, blank or copied. `?from=<id>` keeps another coupon's rules
 * and starts the code, dates and usage fresh.
 */
export default function NewCouponPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<div className="skeleton mt-6 h-[40rem] rounded-lg" aria-hidden />}>
      <Editor searchParams={searchParams} />
    </Suspense>
  );
}

async function Editor({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission('coupon:write');
  const params = await searchParams;
  const from = typeof params.from === 'string' ? params.from : null;

  const [source, targets] = await Promise.all([
    from ? getCouponForDuplicate(from) : Promise.resolve(null),
    couponTargetOptions(),
  ]);

  return (
    <>
      <PageHeader
        back={{ href: '/admin/coupons', label: 'Coupons' }}
        title={source ? `Duplicate ${source.code}` : 'New coupon'}
        description={
          source
            ? 'Same rules as the original, with a new code and fresh dates. Nothing is saved until you create it.'
            : 'A code shoppers type in the bag. It works from its start until it ends or runs out.'
        }
      />
      <CouponEditor
        id={null}
        initial={source ? couponDraftFrom(source, { duplicate: true }) : newCouponDraft()}
        targets={targets}
        usedCount={0}
      />
    </>
  );
}
