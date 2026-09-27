import 'server-only';

import { contentFieldsOf, sameContent, type ContentFields, type ContentRevision } from '@/domain/content-pages';
import type { CmsPage, SessionUser } from '@/domain/types';
import { entityId } from '@/lib/ids';

import { requirePermission } from '../auth/session';
import { collections, toEntities, toEntity } from '../db/collections';

/**
 * Content pages as Marketing edits them: live fields on the page document,
 * a draft beside them, and the last ten published versions -- all in the one
 * document, so publishing is a single write.
 */

const HISTORY_LIMIT = 10;

export interface ContentPageRow {
  id: string;
  slug: string;
  title: string;
  section: 'Legal' | 'Help' | 'Company';
  isPublished: boolean;
  hasDraft: boolean;
  template: ContentFields['template'];
  noindex: boolean;
  updatedAt: string;
}

export function sectionOf(slug: string): ContentPageRow['section'] {
  if (slug.startsWith('legal/')) return 'Legal';
  if (slug.startsWith('help/')) return 'Help';
  return 'Company';
}

export async function listContentPages(): Promise<ContentPageRow[]> {
  await requirePermission('cms:write');
  const pageCol = await collections.cmsPages();
  const pages = toEntities(await pageCol.find({}).sort({ slug: 1 }).toArray());
  return pages.map((page) => ({
    id: page.id,
    slug: page.slug,
    title: page.draft?.title ?? page.title,
    section: sectionOf(page.slug),
    isPublished: page.isPublished,
    hasDraft: Boolean(page.draft),
    template: page.template ?? 'PLAIN',
    noindex: page.noindex ?? false,
    updatedAt: page.updatedAt,
  }));
}

export interface ContentPageState {
  page: Pick<CmsPage, 'id' | 'slug' | 'isPublished' | 'updatedAt'>;
  live: ContentFields;
  draft: ContentFields | null;
  revisions: ContentRevision[];
}

function stateOf(page: CmsPage): ContentPageState {
  return {
    page: { id: page.id, slug: page.slug, isPublished: page.isPublished, updatedAt: page.updatedAt },
    live: contentFieldsOf(page),
    draft: page.draft ?? null,
    revisions: page.revisions ?? [],
  };
}

async function load(id: string): Promise<CmsPage | null> {
  const pageCol = await collections.cmsPages();
  return toEntity(await pageCol.findOne({ _id: id }));
}

export async function getContentPageState(id: string): Promise<ContentPageState | null> {
  await requirePermission('cms:write');
  const page = await load(id);
  return page ? stateOf(page) : null;
}

/** The page as the draft would make it: for the staff-only preview. */
export async function getContentPagePreview(id: string): Promise<CmsPage | null> {
  await requirePermission('cms:write');
  const page = await load(id);
  if (!page) return null;
  const fields = page.draft ?? contentFieldsOf(page);
  return { ...page, ...liveFields(fields) };
}

/** Draft fields as the columns the storefront reads. */
export function liveFields(fields: ContentFields) {
  return {
    title: fields.title,
    body: fields.body,
    metaTitle: fields.metaTitle || `${fields.title} | VestraWAB`,
    metaDescription: fields.metaDescription || null,
    template: fields.template,
    summary: fields.summary || null,
    heroImageUrl: fields.heroImageUrl || null,
    noindex: fields.noindex,
  };
}

export async function saveContentDraft(id: string, fields: ContentFields, actor: SessionUser) {
  const page = await load(id);
  if (!page) return null;
  // A draft identical to what is live is no draft at all.
  const draft = sameContent(fields, contentFieldsOf(page)) ? null : fields;
  const pageCol = await collections.cmsPages();
  await pageCol.updateOne({ _id: id }, { $set: { draft, updatedByUserId: actor.id } });
  return page;
}

export async function discardContentDraft(id: string) {
  const pageCol = await collections.cmsPages();
  await pageCol.updateOne({ _id: id }, { $set: { draft: null } });
}

async function publishFields(page: CmsPage, fields: ContentFields, note: string | null, actor: SessionUser) {
  const now = new Date().toISOString();
  const revision: ContentRevision = { id: entityId('prev'), at: now, byName: actor.fullName, note, content: fields };
  const pageCol = await collections.cmsPages();
  await pageCol.updateOne(
    { _id: page.id },
    {
      $set: { ...liveFields(fields), draft: null, updatedAt: now, updatedByUserId: actor.id },
      $push: { revisions: { $each: [revision], $position: 0, $slice: HISTORY_LIMIT } },
    },
  );
}

export async function publishContent(id: string, note: string | null, actor: SessionUser) {
  const page = await load(id);
  if (!page?.draft) return null;
  await publishFields(page, page.draft, note, actor);
  return page;
}

export async function revertContent(id: string, revisionId: string, actor: SessionUser) {
  const page = await load(id);
  const target = page?.revisions?.find((revision) => revision.id === revisionId);
  if (!page || !target) return null;
  const when = new Date(target.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  await publishFields(page, target.content, `Put back the version from ${when}`, actor);
  return page;
}

export async function setContentVisibility(id: string, isPublished: boolean, actor: SessionUser) {
  const page = await load(id);
  if (!page) return null;
  const pageCol = await collections.cmsPages();
  await pageCol.updateOne({ _id: id }, { $set: { isPublished, updatedAt: new Date().toISOString(), updatedByUserId: actor.id } });
  return page;
}
