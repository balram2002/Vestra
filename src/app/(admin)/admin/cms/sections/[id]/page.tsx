import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { SectionEditorPage } from '@/components/console/section-editor-page';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntity } from '@/server/db/collections';
import { stripCategories } from '@/server/services/section-items';

export const metadata: Metadata = { title: 'Edit section' };

/**
 * One section of a page, being edited.
 *
 * The same route whichever page the section sits on: a section knows its own
 * page, and the way back is worked out from that -- the homepage screen, or the
 * landing page it belongs to.
 */
export default function SectionEditRoute({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }] = await Promise.all([params, requirePermission('cms:write')]);

  const sections = await collections.homeSections();
  const section = toEntity(await sections.findOne({ _id: id }));
  if (!section) notFound();

  const page = section.page ?? 'home';
  let back = { href: '/admin/cms', label: 'Homepage' };

  if (page === 'categories') back = { href: '/admin/categories-page', label: 'Shop page' };
  else if (page !== 'home') {
    const pages = await collections.cmsPages();
    const owner = await pages.findOne({ slug: page });
    if (owner) back = { href: '/admin/pages/' + owner._id, label: owner.title };
  }

  // Keyed by the last write, so a save, a reset or a visibility change
  // remounts the editor from what is now stored rather than from a stale draft.
  const displayedCategories = section.kind === 'CATEGORY_STRIP'
    ? (await stripCategories({ ...section, config: { ...section.config, categoryMode: 'AUTO' } })).map(({ id, name, imageUrl }) => ({ id, label: name, imageUrl }))
    : [];
  return <SectionEditorPage key={section.updatedAt} section={section} back={back} displayedCategories={displayedCategories} />;
}

function EditorSkeleton() {
  return (
    <div aria-hidden>
      <div className="border-line flex items-center justify-between gap-3 border-b pb-3">
        <div className="space-y-2">
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-6 w-56 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-8 w-20 rounded-md" />
          <div className="skeleton h-8 w-20 rounded-md" />
          <div className="skeleton h-8 w-16 rounded-md" />
        </div>
      </div>
      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          {[0, 1, 2].map((card) => (
            <div key={card} className="skeleton h-40 rounded-lg" />
          ))}
        </div>
        <div className="skeleton h-[28rem] rounded-lg" />
      </div>
    </div>
  );
}
