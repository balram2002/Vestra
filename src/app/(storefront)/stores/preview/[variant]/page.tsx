import { Eye } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import {
  STORES_PAGE_VARIANTS,
  storesPageDesign,
  type StoresPageSettings,
  type StoresPageVariant,
} from '@/domain/page-designs/stores';
import { getPreviewDesign } from '@/server/services/page-designs';

import { StoresFrame } from '../../stores-frame';

export const metadata: Metadata = {
  title: 'Sellers directory preview',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ variant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The directory in one layout, with the DRAFT settings. What the Sellers
 * directory designer frames. Staff only: `getPreviewDesign` asserts it.
 */
export default function StoresPagePreview({ params, searchParams }: PageProps) {
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
  const [{ variant: raw }, query, design] = await Promise.all([params, searchParams, getPreviewDesign('stores')]);
  if (!STORES_PAGE_VARIANTS.includes(raw as StoresPageVariant)) notFound();
  const variant = raw as StoresPageVariant;
  const meta = storesPageDesign.variantMeta[variant];

  return (
    <StoresFrame
      variant={variant}
      settings={design.settings[variant] as StoresPageSettings}
      banner={
        <div className="bg-inverse text-on-inverse mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-xs">
          <span className="inline-flex items-center gap-2">
            <Eye className="size-4" aria-hidden />
            Preview · Variant {meta.number} · {meta.name}
            {design.variant === variant ? '' : ' (not the layout in use)'}
          </span>
          {query.embed === '1' ? null : (
            <Link href="/admin/design/stores" className="font-semibold underline underline-offset-2">
              Back to the editor
            </Link>
          )}
        </div>
      }
    />
  );
}
