import { Eye } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { StorePageView } from '@/components/store/store-page-view';
import {
  STORE_PAGE_VARIANTS,
  storePageDesign,
  type StorePageSettings,
  type StorePageVariant,
} from '@/domain/page-designs/store';
import type { RawSearchParams } from '@/lib/product-query';
import { getSellerBySlug } from '@/server/services/catalog';
import { getPreviewDesign } from '@/server/services/page-designs';

export const metadata: Metadata = {
  title: 'Store page preview',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ slug: string; variant: string }>;
  searchParams: Promise<RawSearchParams>;
}

/**
 * One store, in one layout, with the DRAFT settings -- or the live ones when
 * nothing is drafted.
 *
 * This is what the designer's preview pane frames, so it sits inside the
 * storefront frame on purpose: the per-page header and footer rules apply
 * here exactly as they will on the real page. `?embed=1` drops the preview
 * bar's way back to the editor, which in a frame would open the console
 * inside itself.
 *
 * Staff only (`getPreviewDesign` asserts it). A draft is not for shoppers.
 */
export default function StorePagePreview({ params, searchParams }: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="gutter shell-max py-5">
          <div className="skeleton mt-3 h-64 rounded-3xl" />
        </div>
      }
    >
      <Preview params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Preview({ params, searchParams }: PageProps) {
  const [{ slug, variant: raw }, query, design] = await Promise.all([
    params,
    searchParams,
    getPreviewDesign('store'),
  ]);
  if (!STORE_PAGE_VARIANTS.includes(raw as StorePageVariant)) notFound();
  const variant = raw as StorePageVariant;

  const seller = await getSellerBySlug(slug);
  if (!seller) notFound();

  const meta = storePageDesign.variantMeta[variant];
  const embedded = query.embed === '1';

  return (
    <StorePageView
      seller={seller}
      variant={variant}
      settings={design.settings[variant] as StorePageSettings}
      searchParams={searchParams}
      basePath={`/store/${seller.slug}/preview/${variant}`}
      banner={
        <div className="bg-inverse text-on-inverse mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-xs">
          <span className="inline-flex items-center gap-2">
            <Eye className="size-4" aria-hidden />
            Preview · Variant {meta.number} · {meta.name}
            {design.variant === variant ? '' : ' (not the layout in use)'}
          </span>
          {embedded ? null : (
            <Link href="/admin/design/store" className="font-semibold underline underline-offset-2">
              Back to the editor
            </Link>
          )}
        </div>
      }
    />
  );
}
