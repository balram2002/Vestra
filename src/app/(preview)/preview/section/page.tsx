import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageSections } from '@/components/home/page-sections';
import type { HomeSection } from '@/domain/types';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntity } from '@/server/db/collections';

export const metadata: Metadata = {
  title: 'Section preview',
  robots: { index: false, follow: false },
};

/**
 * One section, rendered by the real storefront.
 *
 * The admin section editor loads this in a frame. It renders the SAVED section
 * by default, and the editor's UNSAVED draft when one is passed -- through the
 * very same `PageSections` the homepage uses, against the live catalogue. That
 * is the point: an editor choosing eight products sees those eight products,
 * with their real photographs and prices, before anything is published.
 *
 * THE DRAFT IS A PREVIEW, NEVER A WRITE. It arrives in the URL, is laid over
 * the stored section in memory, and is rendered once. Nothing here saves, so a
 * forged draft can only ever change what the person forging it sees -- and only
 * someone who can edit the homepage can load the route at all.
 */

const PREVIEWABLE: Array<keyof HomeSection> = [
  'title',
  'subtitle',
  'href',
  'ctaLabel',
  'startsAt',
  'endsAt',
  'config',
];

/** base64url JSON, from the editor. Anything malformed previews the saved section. */
function readDraft(encoded: string | undefined): Partial<HomeSection> {
  if (!encoded) return {};
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return {};

    // Only the fields an editor edits. The kind, the page and the id are
    // properties of the section, not of a draft of it.
    const draft: Partial<HomeSection> = {};
    for (const key of PREVIEWABLE) {
      if (key in parsed) (draft as Record<string, unknown>)[key] = (parsed as Record<string, unknown>)[key];
    }
    return draft;
  } catch {
    return {};
  }
}

export default function SectionPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; draft?: string }>;
}) {
  return (
    <Suspense fallback={<div className="skeleton m-6 h-64 rounded-xl" aria-hidden />}>
      <Preview searchParams={searchParams} />
    </Suspense>
  );
}

async function Preview({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; draft?: string }>;
}) {
  const [params] = await Promise.all([searchParams, requirePermission('cms:write')]);
  if (!params.id) return <Empty>Choose a section to preview.</Empty>;

  const sections = await collections.homeSections();
  const saved = toEntity(await sections.findOne({ _id: params.id }));
  if (!saved) return <Empty>That section no longer exists.</Empty>;

  const draft = readDraft(params.draft);
  const shown: HomeSection = {
    ...saved,
    ...draft,
    config: { ...saved.config, ...(draft.config ?? {}) },
    // A hidden or scheduled section is still worth seeing while it is edited:
    // the frame shows it as it WILL look, on every screen size it is shown on.
    isActive: true,
    visibleOn: 'ALL',
    startsAt: null,
  };

  return (
    <>
      <PageSections sections={[shown]} />
      {/* A section with nothing to show renders nothing on the shop, which in a
          frame looks exactly like a broken preview. Say so instead. */}
      <p className="text-faint px-6 pb-6 text-center text-xs">
        If the frame above is empty, this section has nothing to show yet: its products,
        categories or reviews come back empty, so the shop leaves it out.
      </p>
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted p-10 text-center text-sm">{children}</p>;
}
