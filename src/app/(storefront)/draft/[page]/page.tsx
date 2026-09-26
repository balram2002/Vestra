import { Eye } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { PageSections } from '@/components/home/page-sections';
import { COMPOSITION_PAGES, isCompositionPage } from '@/domain/compositions';
import { draftComposition } from '@/server/services/compositions';

export const metadata: Metadata = {
  title: 'Draft preview',
  robots: { index: false, follow: false },
};

type Params = Promise<{ page: string }>;

/**
 * A composed page as it WILL look: the builder's working copy, rendered by the
 * very same `PageSections` the live page uses, inside the storefront frame.
 *
 * Staff only -- `draftComposition` asserts it. A draft is not for shoppers.
 */
export default function DraftPreviewPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="gutter shell-max py-6"><div className="skeleton h-72 rounded-2xl" /></div>}>
      <Draft params={params} />
    </Suspense>
  );
}

async function Draft({ params }: { params: Params }) {
  const { page } = await params;
  if (!isCompositionPage(page)) notFound();
  const { sections, banners } = await draftComposition(page);
  const meta = COMPOSITION_PAGES[page];
  const editor = page === 'home' ? '/admin/cms' : '/admin/categories-page';

  return (
    <>
      <div className="gutter shell-max pt-4">
        <div className="bg-inverse text-on-inverse flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-xs">
          <span className="inline-flex items-center gap-2">
            <Eye className="size-4" aria-hidden />
            Draft preview · {meta.title} — shoppers see the published version
          </span>
          <Link href={editor} className="font-semibold underline underline-offset-2">
            Back to the editor
          </Link>
        </div>
      </div>
      {sections.length ? (
        <PageSections sections={sections} banners={banners} />
      ) : (
        <p className="gutter shell-max text-muted py-12">Nothing is switched on in the draft.</p>
      )}
    </>
  );
}
