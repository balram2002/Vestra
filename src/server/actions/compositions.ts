'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { z } from 'zod';

import { COMPOSITION_PAGES, isCompositionPage, type CompositionPage } from '@/domain/compositions';

import { requirePermission } from '../auth/session';
import * as audit from '../services/audit';
import { tags } from '../services/cache-tags';
import * as compositions from '../services/compositions';

/**
 * Publishing composed pages. `cms:write`, like the builders themselves.
 *
 * Publish and put-back expire the content tag with `updateTag`: the next
 * shopper request waits for the new page instead of being served the old one
 * while it refreshes. Discarding changes only the working copy, which no
 * shopper reads, so it expires nothing.
 */

export type CompositionResult =
  | { ok: true; state: compositions.CompositionState }
  | { ok: false; error: string };

async function run(
  page: string,
  action: 'publish' | 'discard' | 'revert',
  work: (key: CompositionPage, actor: Awaited<ReturnType<typeof requirePermission>>) => Promise<string | void>,
): Promise<CompositionResult> {
  const actor = await requirePermission('cms:write');
  if (!isCompositionPage(page)) return { ok: false, error: 'Unknown page.' };

  const failure = await work(page, actor);
  if (typeof failure === 'string') return { ok: false, error: failure };

  await audit.record({
    actor,
    action: `composition.${action}`,
    entityType: 'composition',
    entityId: page,
    entityLabel: COMPOSITION_PAGES[page].title,
    severity: 'NOTICE',
  });

  if (action !== 'discard') updateTag(tags.content);
  revalidatePath(page === 'home' ? '/admin/cms' : '/admin/categories-page');
  revalidatePath('/admin/marketing');
  return { ok: true, state: await compositions.getCompositionState(page) };
}

const note = z.string().trim().max(200).nullable();

export async function publishComposition(input: { page: string; note: string | null }) {
  return run(input.page, 'publish', (page, actor) =>
    compositions.publishComposition(page, note.parse(input.note) || null, actor),
  );
}

export async function discardCompositionDraft(input: { page: string }) {
  return run(input.page, 'discard', (page) => compositions.discardCompositionDraft(page));
}

export async function revertComposition(input: { page: string; revisionId: string }) {
  return run(input.page, 'revert', async (page, actor) => {
    if (!(await compositions.revertComposition(page, input.revisionId, actor))) {
      return 'That version is no longer in the history.';
    }
  });
}
