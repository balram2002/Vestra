import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';

import {
  DEFAULT_SITE_CONTENT,
  liveAnnouncements,
  VERSIONED_BLOCKS,
  withDefaults,
  type SiteContent,
  type SiteContentVersion,
} from '@/domain/site-content';
import { entityId } from '@/lib/ids';

import { COLLECTIONS, raw } from '../db/collections';
import { invalidate } from './cache-invalidation';
import { tags } from './cache-tags';

/**
 * The shop's own words.
 *
 * ONE DOCUMENT, not a collection of blocks. Everything here is edited from one
 * screen and read by every page, so a single row keeps the read to one lookup
 * and makes "what does this shop say about itself" answerable in one place.
 *
 * A missing document is the normal state, not an error: the defaults in
 * `domain/site-content` are what the shop ships with, and nothing is written
 * until somebody changes something.
 */

const DOCUMENT_ID = 'site';
const HISTORY_LIMIT = 10;

export async function getSiteContent(): Promise<SiteContent> {
  'use cache';
  cacheTag(tags.content);
  cacheLife('hours');

  const collection = await raw(COLLECTIONS.siteContent);
  const stored = await collection.findOne({ _id: DOCUMENT_ID as never });

  return withDefaults(stored as Partial<SiteContent> | null);
}

/**
 * Save one part of it.
 *
 * A patch of whole blocks: the editor sends the complete list of
 * announcements, never a diff, so removing the last item is expressible.
 *
 * Each versioned block's PREVIOUS value is pushed onto its history in the
 * same write -- one document, one update -- so every save can be put back.
 */
export async function saveSiteContent(
  patch: Partial<SiteContent>,
  actor: { id: string; fullName: string },
): Promise<{ ok: boolean; error?: string }> {
  const collection = await raw(COLLECTIONS.siteContent);
  const current = withDefaults(
    (await collection.findOne({ _id: DOCUMENT_ID as never })) as Partial<SiteContent> | null,
  );

  const at = new Date().toISOString();
  const $push: Record<string, unknown> = {};
  for (const block of Object.keys(patch) as Array<keyof SiteContent>) {
    if (!(VERSIONED_BLOCKS as readonly string[]).includes(block)) continue;
    if (JSON.stringify(current[block]) === JSON.stringify(patch[block])) continue;
    const version: SiteContentVersion = { id: entityId('scv'), at, byName: actor.fullName, value: current[block] };
    $push[`history.${block}`] = { $each: [version], $position: 0, $slice: HISTORY_LIMIT };
  }

  await collection.updateOne(
    { _id: DOCUMENT_ID as never },
    {
      $set: { ...patch, updatedAt: at, updatedByUserId: actor.id },
      $setOnInsert: { _id: DOCUMENT_ID as never },
      ...(Object.keys($push).length ? { $push } : {}),
    } as never,
    { upsert: true },
  );

  // The header, the footer and the homepage all read this, and all three are
  // cached under the same tag.
  invalidate([tags.content]);

  return { ok: true };
}

/** Put a block back to what the shop ships with. */
export async function resetSiteContentBlock(
  block: keyof SiteContent,
  actor: { id: string; fullName: string },
): Promise<{ ok: boolean; error?: string }> {
  return saveSiteContent({ [block]: DEFAULT_SITE_CONTENT[block] } as Partial<SiteContent>, actor);
}

/** Earlier values of one block, newest first. For the editor, uncached. */
export async function getBlockHistory(block: (typeof VERSIONED_BLOCKS)[number]): Promise<SiteContentVersion[]> {
  const collection = await raw(COLLECTIONS.siteContent);
  const stored = (await collection.findOne({ _id: DOCUMENT_ID as never })) as
    | { history?: Partial<Record<string, SiteContentVersion[]>> }
    | null;
  return stored?.history?.[block] ?? [];
}

/**
 * The strip's lines as shoppers should see them now: switched on and inside
 * their window. Cached like everything else here, but while a line is waiting
 * to start or to end, the entry turns over within a few minutes of that
 * moment -- never faster than five, which would drop it out of the static
 * shell.
 */
export async function getLiveAnnouncements(): Promise<string[]> {
  'use cache';
  cacheTag(tags.content);

  const content = await getSiteContent();
  const now = Date.now();
  if (!content.visibility.announcements) {
    cacheLife('hours');
    return [];
  }

  const upcoming = content.announcements
    .flatMap((item) => [item.startsAt, item.endsAt])
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter((time) => time > now)
    .sort((a, b) => a - b)[0];

  if (upcoming) {
    const seconds = Math.ceil((upcoming - now) / 1000);
    cacheLife({ stale: 300, revalidate: Math.max(300, seconds), expire: Math.max(3600, seconds + 3600) });
  } else {
    cacheLife('hours');
  }

  return liveAnnouncements(content.announcements, now).map((item) => item.text);
}
