import { Eye } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { StorePageView } from '@/components/store/store-page-view';
import { STORE_PAGE_VARIANT_META, STORE_PAGE_VARIANTS, type StorePageVariant } from '@/domain/store-page';
import type { RawSearchParams } from '@/lib/product-query';
import { requirePermission } from '@/server/auth/session';
import { getSellerBySlug } from '@/server/services/catalog';
import { getSiteContent } from '@/server/services/site-content';

export const metadata: Metadata = {
  title: 'Store page preview',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ slug: string; variant: string }>;
  searchParams: Promise<RawSearchParams>;
}

/**
 * One store, in one layout, with that layout's SAVED switches -- live or not.
 *
 * Opened from Admin › Store page, so Marketing can see Spotlight on a real
 * store before making it the page every shopper gets. Inside the storefront
 * frame on purpose: the per-page header and footer rules apply here exactly
 * as they will on the real page.
 *
 * Staff only. The layouts are all public presentations of public data, but a
 * page that is not live yet is a draft, and drafts are not for shoppers.
 */
export default function StorePagePreview({ params, searchParams }: PageProps) {
  return (
    <Suspense fallback={<div className="gutter shell-max py-5"><div className="skeleton mt-3 h-64 rounded-3xl" /></div>}>
      <Preview params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Preview({ params, searchParams }: PageProps) {
  await requirePermission('cms:write');
  const { slug, variant: raw } = await params;
  if (!STORE_PAGE_VARIANTS.includes(raw as StorePageVariant)) notFound();
  const variant = raw as StorePageVariant;

  const [seller, { storePage }] = await Promise.all([getSellerBySlug(slug), getSiteContent()]);
  if (!seller) notFound();

  const meta = STORE_PAGE_VARIANT_META[variant];
  const live = storePage.variant === variant;

  return (
    <StorePageView
      seller={seller}
      variant={variant}
      settings={storePage.settings[variant]}
      searchParams={searchParams}
      basePath={`/store/${seller.slug}/preview/${variant}`}
      banner={
        <div className="bg-inverse text-on-inverse mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-xs">
          <span className="inline-flex items-center gap-2">
            <Eye className="size-4" aria-hidden />
            Previewing Variant {meta.number} · {meta.name}
            {live ? ' — this is the live layout' : ' — not live yet'}
          </span>
          <Link href="/admin/store-page" className="font-semibold underline underline-offset-2">
            Back to the editor
          </Link>
        </div>
      }
    />
  );
}
