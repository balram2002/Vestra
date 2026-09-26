import 'server-only';

import {
  COMPOSITION_PAGES,
  compositionChanges,
  visibleNow,
  type CompositionPage,
  type CompositionSnapshot,
} from '@/domain/compositions';
import type { Banner, HomeSection, SessionUser } from '@/domain/types';
import { entityId } from '@/lib/ids';

import { requirePermission } from '../auth/session';
import { collections, COLLECTIONS, raw, toDoc, toEntities } from '../db/collections';

/**
 * Composed pages, published as a whole.
 *
 *   working copy   `homeSections` + `banners` -- what the builders edit
 *   published      a snapshot in `compositions`, which shoppers read
 *   revisions      the last twenty published snapshots, for put-back
 *
 * THE FIRST OPEN SETS THE BASELINE. Until a page has a record here the
 * storefront keeps reading the working copy, exactly as before; the first time
 * the builder is opened, what is live becomes the published snapshot. From
 * then on edits are drafts. Nothing a shopper sees changes on the switch.
 *
 * Publishing is one write to one document. Put-back also rewrites the working
 * copy so the builder shows what is live again; that spans documents, so the
 * published snapshot is written FIRST -- if restoring the working copy fails
 * part-way, shoppers are already seeing the right page and the builder can
 * simply be restored again.
 */

const HISTORY_LIMIT = 20;

interface StoredRevision {
  id: string;
  at: string;
  byName: string;
  action: string;
  note: string | null;
  snapshot: CompositionSnapshot;
}

interface StoredComposition {
  _id: string;
  published: CompositionSnapshot & { at: string; byName: string };
  revisions: StoredRevision[];
}

export interface CompositionRevision {
  id: string;
  at: string;
  byName: string;
  action: string;
  note: string | null;
  sectionCount: number;
  bannerCount: number;
}

export interface CompositionState {
  page: CompositionPage;
  publishedAt: string;
  publishedBy: string;
  /** What Publish would change, in sentences. Empty when nothing is pending. */
  changes: string[];
  revisions: CompositionRevision[];
}

function sectionScope(page: CompositionPage) {
  // Sections written before pages could be composed have no page: they are
  // the homepage's. Every read has always treated them that way.
  return page === 'home' ? { $or: [{ page: 'home' }, { page: { $exists: false } }] } : { page };
}

async function readStored(page: CompositionPage): Promise<StoredComposition | null> {
  const collection = await raw(COLLECTIONS.compositions);
  return (await collection.findOne({ _id: page as never })) as StoredComposition | null;
}

/** The working copy, as the builders see it: every section and banner, on or off. */
async function readWorking(page: CompositionPage): Promise<CompositionSnapshot> {
  const [sectionCol, bannerCol] = await Promise.all([collections.homeSections(), collections.banners()]);
  const placements = COMPOSITION_PAGES[page].placements;
  const [sections, banners] = await Promise.all([
    sectionCol.find(sectionScope(page)).sort({ position: 1 }).toArray(),
    placements.length
      ? bannerCol.find({ placement: { $in: placements } }).sort({ position: 1, createdAt: 1 }).toArray()
      : Promise.resolve([]),
  ]);
  return { sections: toEntities(sections), banners: toEntities(banners) };
}

/* ------------------------------------------------------------ storefront */

/**
 * The published snapshot for the storefront, or null when the page has never
 * been published (then the working copy IS the live page, as it always was).
 * Called from inside the cached content reads, which carry the content tag.
 */
export async function publishedComposition(page: CompositionPage): Promise<CompositionSnapshot | null> {
  const stored = await readStored(page);
  return stored ? { sections: stored.published.sections, banners: stored.published.banners } : null;
}

/* --------------------------------------------------------------- preview */

/** The working copy as a shopper would see it right now: for the draft preview. */
export async function draftComposition(page: CompositionPage): Promise<CompositionSnapshot> {
  await requirePermission('cms:write');
  const working = await readWorking(page);
  const now = Date.now();
  return { sections: visibleNow(working.sections, now), banners: visibleNow(working.banners, now) };
}

/* ----------------------------------------------------------------- admin */

function summarise(revision: StoredRevision): CompositionRevision {
  return {
    id: revision.id,
    at: revision.at,
    byName: revision.byName,
    action: revision.action,
    note: revision.note,
    sectionCount: revision.snapshot.sections.filter((section) => section.isActive).length,
    bannerCount: revision.snapshot.banners.filter((banner) => banner.isActive).length,
  };
}

export async function getCompositionState(page: CompositionPage): Promise<CompositionState> {
  const actor = await requirePermission('cms:write');
  let stored = await readStored(page);
  const working = await readWorking(page);

  if (!stored) {
    // The baseline: what shoppers see today becomes the published page.
    const at = new Date().toISOString();
    const baseline: StoredRevision = {
      id: entityId('crev'),
      at,
      byName: actor.fullName,
      action: 'Publishing switched on — the page as it was live',
      note: null,
      snapshot: working,
    };
    const collection = await raw(COLLECTIONS.compositions);
    await collection.updateOne(
      { _id: page as never },
      {
        $setOnInsert: {
          _id: page,
          published: { ...working, at, byName: actor.fullName },
          revisions: [baseline],
        },
      } as never,
      { upsert: true },
    );
    stored = await readStored(page);
  }

  return {
    page,
    publishedAt: stored!.published.at,
    publishedBy: stored!.published.byName,
    changes: compositionChanges(stored!.published, working),
    revisions: stored!.revisions.map(summarise),
  };
}

async function writePublished(
  page: CompositionPage,
  snapshot: CompositionSnapshot,
  action: string,
  note: string | null,
  actor: SessionUser,
) {
  const at = new Date().toISOString();
  const revision: StoredRevision = { id: entityId('crev'), at, byName: actor.fullName, action, note, snapshot };
  const collection = await raw(COLLECTIONS.compositions);
  await collection.updateOne(
    { _id: page as never },
    {
      $set: { published: { ...snapshot, at, byName: actor.fullName } },
      $push: { revisions: { $each: [revision], $position: 0, $slice: HISTORY_LIMIT } },
    } as never,
    { upsert: true },
  );
}

/** Replace the working copy with a snapshot, so the builder shows it. */
async function restoreWorking(page: CompositionPage, snapshot: CompositionSnapshot) {
  const [sectionCol, bannerCol] = await Promise.all([collections.homeSections(), collections.banners()]);
  await sectionCol.deleteMany(sectionScope(page));
  if (snapshot.sections.length) await sectionCol.insertMany(snapshot.sections.map((section) => toDoc<HomeSection>(section)));

  const placements = COMPOSITION_PAGES[page].placements;
  if (placements.length) {
    await bannerCol.deleteMany({ placement: { $in: placements } });
    if (snapshot.banners.length) await bannerCol.insertMany(snapshot.banners.map((banner) => toDoc<Banner>(banner)));
  }
}

export async function publishComposition(page: CompositionPage, note: string | null, actor: SessionUser) {
  const [stored, working] = await Promise.all([readStored(page), readWorking(page)]);
  const changes = stored ? compositionChanges(stored.published, working) : [];
  const action = changes.length
    ? `Published — ${changes.slice(0, 2).join('; ')}${changes.length > 2 ? `; and ${changes.length - 2} more` : ''}`
    : 'Published';
  await writePublished(page, working, action, note, actor);
}

export async function discardCompositionDraft(page: CompositionPage) {
  const stored = await readStored(page);
  if (!stored) return;
  await restoreWorking(page, stored.published);
}

export async function revertComposition(page: CompositionPage, revisionId: string, actor: SessionUser): Promise<boolean> {
  const stored = await readStored(page);
  const target = stored?.revisions.find((revision) => revision.id === revisionId);
  if (!target) return false;

  const when = new Date(target.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  // Shoppers first: the published page is right the moment this returns.
  await writePublished(page, target.snapshot, `Put back the version from ${when}`, null, actor);
  await restoreWorking(page, target.snapshot);
  return true;
}
