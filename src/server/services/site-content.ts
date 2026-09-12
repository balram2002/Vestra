import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';

import { DEFAULT_SITE_CONTENT, withDefaults, type SiteContent } from '@/domain/site-content';

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
 */
export async function saveSiteContent(
  patch: Partial<SiteContent>,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const collection = await raw(COLLECTIONS.siteContent);

  await collection.updateOne(
    { _id: DOCUMENT_ID as never },
    {
      $set: { ...patch, updatedAt: new Date().toISOString(), updatedByUserId: userId },
      $setOnInsert: { _id: DOCUMENT_ID as never },
    },
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
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  return saveSiteContent({ [block]: DEFAULT_SITE_CONTENT[block] } as Partial<SiteContent>, userId);
}
