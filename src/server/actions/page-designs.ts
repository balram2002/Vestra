'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { z } from 'zod';

import { designFor, isPageDesignKey, type PageDesignKey } from '@/domain/page-designs';
import { designConfigSchema } from '@/domain/page-designs/schema';
import type { DesignConfig, PageDesignState } from '@/domain/page-designs/types';

import { requirePermission } from '../auth/session';
import * as audit from '../services/audit';
import { tags } from '../services/cache-tags';
import * as designs from '../services/page-designs';

/**
 * Editing page designs.
 *
 * `cms:write` throughout -- the same people who arrange the homepage. Every
 * action names its page by key and is checked against that page's own
 * definition, so one set of actions serves every designer screen without
 * becoming an untyped bag.
 *
 * Each returns the fresh state, so the screen shows exactly what was stored
 * rather than what it hoped was stored.
 */

export type DesignResult = { ok: true; state: PageDesignState } | { ok: false; error: string };

type Actor = Awaited<ReturnType<typeof requirePermission>>;

async function run(
  page: string,
  action: string,
  work: (key: PageDesignKey, actor: Actor) => Promise<string | void>,
): Promise<DesignResult> {
  const actor = await requirePermission('cms:write');
  if (!isPageDesignKey(page)) return { ok: false, error: 'Unknown page.' };

  const failure = await work(page, actor);
  if (typeof failure === 'string') return { ok: false, error: failure };

  await audit.record({
    actor,
    action: `design.${action}`,
    entityType: 'pageDesign',
    entityId: page,
    entityLabel: designFor(page).title,
    severity: action === 'draft' ? 'INFO' : 'NOTICE',
  });

  // Publish means NOW: the next shopper request waits for the new design
  // rather than being served the old one while it refreshes. A draft changes
  // nothing shoppers can see, so it expires nothing.
  if (action !== 'draft') updateTag(tags.pageDesign(page));

  revalidatePath(`/admin/design/${page}`);
  revalidatePath('/admin/marketing');
  return { ok: true, state: await designs.getDesignState(page) };
}

function parse(page: PageDesignKey, value: unknown): DesignConfig | string {
  const parsed = designConfigSchema(designFor(page)).safeParse(value);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Check the highlighted settings.';
  return parsed.data as DesignConfig;
}

export async function saveDesignDraft(input: { page: string; config: unknown }) {
  return run(input.page, 'draft', async (page, actor) => {
    const config = parse(page, input.config);
    if (typeof config === 'string') return config;
    await designs.saveDraft(page, config, actor);
  });
}

export async function discardDesignDraft(input: { page: string }) {
  return run(input.page, 'discard', (page, actor) => designs.discardDraft(page, actor));
}

const note = z.string().trim().max(200).nullable();

export async function publishDesign(input: { page: string; config: unknown; note: string | null }) {
  return run(input.page, 'publish', async (page, actor) => {
    const config = parse(page, input.config);
    if (typeof config === 'string') return config;
    await designs.publish(page, config, note.parse(input.note) || null, actor);
  });
}

export async function scheduleDesign(input: { page: string; config: unknown; at: string }) {
  return run(input.page, 'schedule', async (page, actor) => {
    const config = parse(page, input.config);
    if (typeof config === 'string') return config;
    const at = Date.parse(input.at);
    if (!Number.isFinite(at)) return 'Pick a date and time.';
    if (at <= Date.now() + 60_000) return 'Pick a time at least a minute from now, or publish now instead.';
    await designs.schedule(page, config, new Date(at).toISOString(), actor);
  });
}

export async function cancelDesignSchedule(input: { page: string }) {
  return run(input.page, 'unschedule', (page, actor) => designs.cancelSchedule(page, actor));
}

export async function revertDesign(input: { page: string; revisionId: string }) {
  return run(input.page, 'revert', async (page, actor) => {
    const revision = await designs.revertTo(page, input.revisionId, actor);
    if (!revision) return 'That version is no longer in the history.';
  });
}
