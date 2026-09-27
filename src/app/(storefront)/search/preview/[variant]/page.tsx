import { Eye } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import {
  SEARCH_PAGE_VARIANTS,
  searchPageDesign,
  type SearchPageSettings,
  type SearchPageVariant,
} from '@/domain/page-designs/search';
import type { RawSearchParams } from '@/lib/product-query';
import { getPreviewDesign } from '@/server/services/page-designs';

import { SearchFrame } from '../../search-frame';

export const metadata: Metadata = {
  title: 'Search results preview',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ variant: string }>;
  searchParams: Promise<RawSearchParams>;
}

/**
 * One search in one layout, with the DRAFT settings. What the Search results
 * designer frames. Staff only: `getPreviewDesign` asserts it. The search box,
 * filters and sort stay inside the preview.
 */
export default function SearchPagePreview({ params, searchParams }: PageProps) {
  return (
    <div className="gutter shell-max py-6 sm:py-8">
      <Suspense fallback={<div className="skeleton h-64 rounded-3xl" />}>
        <Preview params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Preview({ params, searchParams }: PageProps) {
  const [{ variant: raw }, query, design] = await Promise.all([params, searchParams, getPreviewDesign('search')]);
  if (!SEARCH_PAGE_VARIANTS.includes(raw as SearchPageVariant)) notFound();
  const variant = raw as SearchPageVariant;
  const meta = searchPageDesign.variantMeta[variant];

  return (
    <SearchFrame
      variant={variant}
      settings={design.settings[variant] as SearchPageSettings}
      searchParams={searchParams}
      basePath={`/search/preview/${variant}`}
      banner={
        <div className="bg-inverse text-on-inverse mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-xs">
          <span className="inline-flex items-center gap-2">
            <Eye className="size-4" aria-hidden />
            Preview · Variant {meta.number} · {meta.name}
            {design.variant === variant ? '' : ' (not the layout in use)'}
          </span>
          {query.embed === '1' ? null : (
            <Link href="/admin/design/search" className="font-semibold underline underline-offset-2">
              Back to the editor
            </Link>
          )}
        </div>
      }
    />
  );
}
