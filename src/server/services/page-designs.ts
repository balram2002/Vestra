import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';

import { designFor, PAGE_DESIGN_KEYS, type PageDesignKey } from '@/domain/page-designs';
import { describeChange, effectiveConfig, sameConfig, withDesignDefaults } from '@/domain/page-designs/config';
import type {
  DesignConfig,
  DesignRevision,
  DesignSchedule,
  PageDesignState,
} from '@/domain/page-designs/types';
import type { SessionUser } from '@/domain/types';
import { entityId } from '@/lib/ids';

import { requirePermission } from '../auth/session';
import { COLLECTIONS, raw } from '../db/collections';
import { invalidate } from './cache-invalidation';
import { tags } from './cache-tags';

/**
 * Page designs: what each designable storefront page looks like.
 *
 * ONE DOCUMENT PER PAGE, and every change to it is one `updateOne`. There is no
 * transaction to lean on (see AGENTS.md), and none is needed: the published
 * config, the draft, the schedule and the history all live in the same
 * document, so publishing -- copy the draft over, clear it, push a revision --
 * is a single atomic write.
 *
 *   published   what shoppers see
 *   draft       what an editor is working on; null when nothing is pending
 *   scheduled   a config that becomes the published one at a set time
 *   revisions   the last twenty publishes, newest first, for revert
 *
 * A missing document is the normal state: the definition's defaults are what
 * the page ships with. The Store page predates this collection and kept its
 * settings in `siteContent.storePage`; that is read as the published config
 * until the first save here, so nothing changes for shoppers on migration.
 */

const HISTORY_LIMIT = 20;

interface StoredDesign {
  _id: string;
  published?: unknown;
  draft?: unknown;
  scheduled?: { at: string; byName: string; config: unknown } | null;
  revisions?: Array<Omit<DesignRevision, 'config'> & { config: unknown }>;
  updatedAt?: string;
  updatedByUserId?: string;
}

type Loose = Parameters<typeof withDesignDefaults>[1];

async function readStored(page: PageDesignKey): Promise<StoredDesign | null> {
  const collection = await raw(COLLECTIONS.pageDesigns);
  return (await collection.findOne({ _id: page as never })) as StoredDesign | null;
}

/** Settings saved before this collection existed. */
async function legacyPublished(page: PageDesignKey): Promise<unknown> {
  if (page !== 'store') return null;
  const site = await raw(COLLECTIONS.siteContent);
  const doc = await site.findOne({ _id: 'site' as never });
  return (doc as { storePage?: unknown } | null)?.storePage ?? null;
}

function toState(page: PageDesignKey, stored: StoredDesign | null, legacy: unknown): PageDesignState {
  const definition = designFor(page);
  const normalise = (value: unknown) => withDesignDefaults(definition, value as Loose);

  return {
    page,
    published: normalise(stored?.published ?? legacy),
    draft: stored?.draft ? normalise(stored.draft) : null,
    scheduled: stored?.scheduled
      ? { at: stored.scheduled.at, byName: stored.scheduled.byName, config: normalise(stored.scheduled.config) }
      : null,
    revisions: (stored?.revisions ?? []).map((revision) => ({ ...revision, config: normalise(revision.config) })),
    updatedAt: stored?.updatedAt ?? null,
  };
}

async function loadState(page: PageDesignKey): Promise<PageDesignState> {
  const stored = await readStored(page);
  return toState(page, stored, stored?.published ? null : await legacyPublished(page));
}

/* ------------------------------------------------------------ storefront */

/**
 * The design shoppers see, cached per page.
 *
 * Reads the clock to apply a due schedule, which is allowed inside a cached
 * scope. While a schedule is pending the entry is kept short enough to turn
 * over within a few minutes of the go-live time, without dropping below the
 * five-minute floor that would take it out of the prerendered shell.
 */
export async function getLiveDesign(page: PageDesignKey): Promise<DesignConfig> {
  'use cache';
  cacheTag(tags.pageDesign(page));

  const state = await loadState(page);
  const now = Date.now();

  if (state.scheduled && Date.parse(state.scheduled.at) > now) {
    const seconds = Math.ceil((Date.parse(state.scheduled.at) - now) / 1000);
    cacheLife({ stale: 300, revalidate: Math.max(300, seconds), expire: Math.max(3600, seconds + 3600) });
  } else {
    cacheLife('hours');
  }

  return effectiveConfig(state.published, state.scheduled, now);
}

/* ----------------------------------------------------------------- admin */

/**
 * The whole record, for the designer. Settles a schedule whose time has
 * passed into the published config first, so the screen never shows a
 * "scheduled" change that is already live.
 */
export async function getDesignState(page: PageDesignKey): Promise<PageDesignState> {
  await requirePermission('cms:write');
  const state = await loadState(page);

  if (state.scheduled && Date.parse(state.scheduled.at) <= Date.now()) {
    const due = state.scheduled;
    const revision = newRevision(page, state.published, due.config, 'Scheduled publish', null, {
      id: 'system',
      fullName: due.byName,
    });
    const collection = await raw(COLLECTIONS.pageDesigns);
    await collection.updateOne(
      { _id: page as never, 'scheduled.at': due.at },
      {
        $set: { published: due.config, scheduled: null, updatedAt: new Date().toISOString() },
        $push: { revisions: { $each: [revision], $position: 0, $slice: HISTORY_LIMIT } },
      } as never,
    );
    return loadState(page);
  }

  return state;
}

/** Draft if there is one, otherwise what is live: what a preview should show. */
export async function getPreviewDesign(page: PageDesignKey): Promise<DesignConfig> {
  await requirePermission('cms:write');
  const state = await loadState(page);
  return state.draft ?? effectiveConfig(state.published, state.scheduled, Date.now());
}

function newRevision(
  page: PageDesignKey,
  before: DesignConfig,
  config: DesignConfig,
  action: string,
  note: string | null,
  actor: Pick<SessionUser, 'id' | 'fullName'>,
): DesignRevision {
  return {
    id: entityId('rev'),
    at: new Date().toISOString(),
    byUserId: actor.id,
    byName: actor.fullName,
    action: `${action} — ${describeChange(designFor(page), before, config)}`,
    note,
    config,
  };
}

async function write(
  page: PageDesignKey,
  update: Record<string, unknown>,
  actor: SessionUser,
  { live = true }: { live?: boolean } = {},
) {
  const collection = await raw(COLLECTIONS.pageDesigns);
  const $set = { ...(update.$set as object), updatedAt: new Date().toISOString(), updatedByUserId: actor.id };
  await collection.updateOne(
    { _id: page as never },
    { ...update, $set, $setOnInsert: { _id: page } } as never,
    { upsert: true },
  );
  // The server actions expire the tag immediately with `updateTag`; this is
  // the fallback for any caller outside one.
  if (live) invalidate([tags.pageDesign(page)]);
}

export async function saveDraft(page: PageDesignKey, config: DesignConfig, actor: SessionUser) {
  const state = await loadState(page);
  // A draft identical to what is live is no draft at all.
  const draft = sameConfig(config, state.published) ? null : config;
  // The legacy config is written through on first save, so the document is
  // complete from then on and the fallback is never read again.
  await write(page, { $set: { draft, published: state.published } }, actor, { live: false });
  return draft;
}

export async function discardDraft(page: PageDesignKey, actor: SessionUser) {
  await write(page, { $set: { draft: null } }, actor, { live: false });
}

export async function publish(
  page: PageDesignKey,
  config: DesignConfig,
  note: string | null,
  actor: SessionUser,
  action = 'Published',
) {
  const state = await loadState(page);
  const revision = newRevision(page, state.published, config, action, note, actor);
  await write(
    page,
    {
      $set: { published: config, draft: null, scheduled: null },
      $push: { revisions: { $each: [revision], $position: 0, $slice: HISTORY_LIMIT } },
    },
    actor,
  );
  return revision;
}

export async function schedule(page: PageDesignKey, config: DesignConfig, at: string, actor: SessionUser) {
  const state = await loadState(page);
  const scheduled: DesignSchedule = { at, byName: actor.fullName, config };
  await write(page, { $set: { scheduled, draft: null, published: state.published } }, actor);
}

export async function cancelSchedule(page: PageDesignKey, actor: SessionUser) {
  await write(page, { $set: { scheduled: null } }, actor);
}

export async function revertTo(page: PageDesignKey, revisionId: string, actor: SessionUser) {
  const state = await loadState(page);
  const target = state.revisions.find((revision) => revision.id === revisionId);
  if (!target) return null;
  const when = new Date(target.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  return publish(page, target.config, null, actor, `Reverted to ${when}`);
}

/* -------------------------------------------------------------- overview */

export interface DesignSummary {
  page: PageDesignKey;
  title: string;
  route: string;
  live: { number: number; name: string };
  hasDraft: boolean;
  scheduledAt: string | null;
  lastPublishedAt: string | null;
  lastPublishedBy: string | null;
}

/** One line per designable page, for the Marketing overview. */
export async function designSummaries(): Promise<DesignSummary[]> {
  await requirePermission('cms:write');

  return Promise.all(
    PAGE_DESIGN_KEYS.map(async (page) => {
      const definition = designFor(page);
      const state = await loadState(page);
      const live = effectiveConfig(state.published, state.scheduled, Date.now());
      const meta = definition.variantMeta[live.variant];
      const last = state.revisions[0] ?? null;
      return {
        page,
        title: definition.title,
        route: definition.route,
        live: { number: meta.number, name: meta.name },
        hasDraft: state.draft !== null,
        scheduledAt: state.scheduled && Date.parse(state.scheduled.at) > Date.now() ? state.scheduled.at : null,
        lastPublishedAt: last?.at ?? null,
        lastPublishedBy: last?.byName ?? null,
      };
    }),
  );
}
