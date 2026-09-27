import { Eye } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import {
  BRAND_PAGE_VARIANTS,
  brandPageDesign,
  type BrandPageSettings,
  type BrandPageVariant,
} from '@/domain/page-designs/brand';
import type { RawSearchParams } from '@/lib/product-query';
import { getBrandBySlug } from '@/server/services/catalog';
import { getPreviewDesign } from '@/server/services/page-designs';

import { BrandFrame } from '../../brand-frame';

export const metadata: Metadata = {
  title: 'Brand page preview',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ slug: string; variant: string }>;
  searchParams: Promise<RawSearchParams>;
}

/**
 * One brand in one layout, with the DRAFT settings -- or the live ones when
 * nothing is drafted. What the Brand page designer frames. Staff only:
 * `getPreviewDesign` asserts it. Filters and sort stay inside the preview,
 * because a layout is judged as much by its filtered states as its first view.
 */
export default function BrandPagePreview({ params, searchParams }: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="gutter shell-max py-5">
          <div className="skeleton h-64 rounded-3xl" />
        </div>
      }
    >
      <Preview params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Preview({ params, searchParams }: PageProps) {
  const [{ slug, variant: raw }, query, design] = await Promise.all([params, searchParams, getPreviewDesign('brand')]);
  if (!BRAND_PAGE_VARIANTS.includes(raw as BrandPageVariant)) notFound();
  const variant = raw as BrandPageVariant;

  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();

  const meta = brandPageDesign.variantMeta[variant];

  return (
    <BrandFrame
      brand={brand}
      variant={variant}
      settings={design.settings[variant] as BrandPageSettings}
      searchParams={searchParams}
      basePath={`/brand/${brand.slug}/preview/${variant}`}
      banner={
        <div className="bg-inverse text-on-inverse mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-xs">
          <span className="inline-flex items-center gap-2">
            <Eye className="size-4" aria-hidden />
            Preview · Variant {meta.number} · {meta.name}
            {design.variant === variant ? '' : ' (not the layout in use)'}
          </span>
          {query.embed === '1' ? null : (
            <Link href="/admin/design/brand" className="font-semibold underline underline-offset-2">
              Back to the editor
            </Link>
          )}
        </div>
      }
    />
  );
}
