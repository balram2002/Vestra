import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AppearanceEditor } from '@/components/console/appearance-editor';
import { PageHeader } from '@/components/console/page-header';
import { requirePermission } from '@/server/auth/session';
import { getSiteContent } from '@/server/services/site-content';

export const metadata: Metadata = { title: 'Appearance' };

/**
 * The shop's own words.
 *
 * Everything here used to be an array halfway down a component: the promises in
 * the strip, the three near the footer, the footer's own columns, and which
 * actions the header offers at all. None of it is a deploy any more.
 *
 * What is NOT here is anything a page composes -- sections, rails and banners
 * live under Homepage, because those are about arranging a page rather than
 * about what the shop says everywhere.
 */
export default function AdminAppearancePage() {
  return (
    <>
      <PageHeader
        title="Appearance"
        description="The words and switches that apply to every page: the strip, the promises, the footer, and which actions shoppers get."
      />

      <Suspense fallback={<EditorSkeleton />}>
        <Editor />
      </Suspense>
    </>
  );
}

async function Editor() {
  await requirePermission('cms:write');
  return <AppearanceEditor content={await getSiteContent()} />;
}

function EditorSkeleton() {
  return (
    <div className="mt-6 space-y-6" aria-hidden>
      {[0, 1, 2].map((index) => (
        <div key={index} className="border-line bg-raised rounded-lg border">
          <div className="border-line flex items-center justify-between border-b px-5 py-3">
            <div className="skeleton h-5 w-44 rounded" />
            <div className="skeleton h-7 w-28 rounded-md" />
          </div>
          <div className="space-y-3 p-5">
            <div className="skeleton h-14 w-full rounded-md" />
            <div className="skeleton h-14 w-full rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
