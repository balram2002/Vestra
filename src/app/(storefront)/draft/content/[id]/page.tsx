import { Eye } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { CmsPageView } from '@/components/cms/cms-page-view';
import { getContentPagePreview } from '@/server/services/content-pages';

export const metadata: Metadata = {
  title: 'Draft preview',
  robots: { index: false, follow: false },
};

type Params = Promise<{ id: string }>;

/**
 * A content page with its draft applied, through the same `CmsPageView` the
 * live page uses. Staff only: `getContentPagePreview` asserts it.
 */
export default function ContentDraftPreview({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <div className="gutter shell-max py-6">
          <div className="skeleton h-72 rounded-2xl" />
        </div>
      }
    >
      <Preview params={params} />
    </Suspense>
  );
}

async function Preview({ params }: { params: Params }) {
  const { id } = await params;
  const page = await getContentPagePreview(id);
  if (!page) notFound();
  const contact = page.slug === 'legal/grievance' ? 'grievance' : page.slug === 'help/contact' ? 'support' : undefined;

  return (
    <>
      <div className="gutter shell-max pt-4">
        <div className="bg-inverse text-on-inverse flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-xs">
          <span className="inline-flex items-center gap-2">
            <Eye className="size-4" aria-hidden />
            Draft preview · /{page.slug}
            {page.draft ? ' — unpublished changes' : ' — same as live'}
          </span>
          <Link href={`/admin/pages/${page.id}`} className="font-semibold underline underline-offset-2">
            Back to the editor
          </Link>
        </div>
      </div>
      <CmsPageView
        page={page}
        contact={contact}
        breadcrumbs={[
          { href: '/', label: 'Home' },
          { href: `/${page.slug}`, label: page.title },
        ]}
      />
    </>
  );
}
