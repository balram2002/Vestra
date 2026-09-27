'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { z } from 'zod';

import { CONTENT_TEMPLATES, type ContentFields } from '@/domain/content-pages';
import type { CmsPage } from '@/domain/types';

import { requirePermission } from '../auth/session';
import * as audit from '../services/audit';
import { tags } from '../services/cache-tags';
import * as pages from '../services/content-pages';

/**
 * Editing content pages: drafts, publishing, put-back and visibility.
 *
 * A draft changes nothing shoppers can see, so it expires nothing. Publish,
 * put-back and the visibility switch expire the content tag with `updateTag`,
 * so the next visitor gets the page as published rather than a stale copy.
 */

export type ContentResult =
  | { ok: true; state: pages.ContentPageState }
  | { ok: false; error: string; field?: string };

const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === '' || value.startsWith('/') || /^https:\/\//.test(value), {
    message: 'Use an https:// address or a path starting with /.',
  });

const fieldsSchema = z.object({
  title: z.string().trim().min(2, 'Give the page a title.').max(120),
  body: z.string().trim().min(1, 'The page needs some text.').max(40_000, 'That is longer than a page should be.'),
  metaTitle: z.string().trim().max(90, 'Keep the search title under 90 characters.'),
  metaDescription: z.string().trim().max(300, 'Keep the search description under 300 characters.'),
  template: z.enum(CONTENT_TEMPLATES),
  summary: z.string().trim().max(300),
  heroImageUrl: imageUrl,
  noindex: z.boolean(),
}) satisfies z.ZodType<ContentFields>;

async function finish(page: CmsPage, action: string, actor: Awaited<ReturnType<typeof requirePermission>>, live: boolean): Promise<ContentResult> {
  await audit.record({
    actor,
    action: `cms.page.${action}`,
    entityType: 'cmsPage',
    entityId: page.id,
    entityLabel: page.slug,
    severity: live ? 'NOTICE' : 'INFO',
  });
  if (live) {
    updateTag(tags.content);
    revalidatePath(`/${page.slug}`);
  }
  // The list, not the editor itself: the editor applies the state returned
  // below, and refreshing it too could remount it mid-edit and drop a
  // pending autosave.
  revalidatePath('/admin/pages');
  const state = await pages.getContentPageState(page.id);
  return state ? { ok: true, state } : { ok: false, error: 'Page not found.' };
}

export async function saveContentDraft(input: { pageId: string; fields: unknown }): Promise<ContentResult> {
  const actor = await requirePermission('cms:write');
  const parsed = fieldsSchema.safeParse(input.fields);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? 'Check the page.', field: issue?.path[0]?.toString() };
  }
  const page = await pages.saveContentDraft(input.pageId, parsed.data, actor);
  if (!page) return { ok: false, error: 'Page not found.' };
  return finish(page, 'draft', actor, false);
}

export async function discardContentDraft(input: { pageId: string }): Promise<ContentResult> {
  const actor = await requirePermission('cms:write');
  const state = await pages.getContentPageState(input.pageId);
  if (!state) return { ok: false, error: 'Page not found.' };
  await pages.discardContentDraft(input.pageId);
  return finish({ id: state.page.id, slug: state.page.slug } as CmsPage, 'discard', actor, false);
}

export async function publishContent(input: { pageId: string; note: string | null }): Promise<ContentResult> {
  const actor = await requirePermission('cms:write');
  const note = z.string().trim().max(200).nullable().parse(input.note) || null;
  const page = await pages.publishContent(input.pageId, note, actor);
  if (!page) return { ok: false, error: 'There is nothing unpublished on this page.' };
  return finish(page, 'publish', actor, true);
}

export async function revertContent(input: { pageId: string; revisionId: string }): Promise<ContentResult> {
  const actor = await requirePermission('cms:write');
  const page = await pages.revertContent(input.pageId, input.revisionId, actor);
  if (!page) return { ok: false, error: 'That version is no longer in the history.' };
  return finish(page, 'revert', actor, true);
}

export async function setContentVisibility(input: { pageId: string; isPublished: boolean }): Promise<ContentResult> {
  const actor = await requirePermission('cms:write');
  const page = await pages.setContentVisibility(input.pageId, input.isPublished, actor);
  if (!page) return { ok: false, error: 'Page not found.' };
  return finish(page, input.isPublished ? 'show' : 'hide', actor, true);
}

/**
 * The shipped wording, as a DRAFT to review -- never straight to live. A
 * policy reset is a legal change; somebody reads it before it is published.
 */
export async function loadShippedContent(input: { pageId: string }): Promise<ContentResult> {
  const actor = await requirePermission('cms:write');
  const state = await pages.getContentPageState(input.pageId);
  if (!state) return { ok: false, error: 'Page not found.' };
  const { generateCmsPages } = await import('../seed/pages');
  const shipped = generateCmsPages(actor.id, new Date()).find((entry) => entry.slug === state.page.slug);
  if (!shipped) return { ok: false, error: 'This page has no shipped wording to go back to.' };
  const fields: ContentFields = {
    ...(state.draft ?? state.live),
    title: shipped.title,
    body: shipped.body,
    metaDescription: shipped.metaDescription ?? '',
  };
  const page = await pages.saveContentDraft(input.pageId, fields, actor);
  return finish(page!, 'draft.shipped', actor, false);
}
