'use server';

import { cookies } from 'next/headers';
import { updateTag } from 'next/cache';
import { z } from 'zod';

import {
  armFor,
  EXPOSURE_COOKIE,
  parseExposures,
  serialiseExposures,
  VISITOR_COOKIE,
  type Experiment,
} from '@/domain/experiments';
import { designFor, isPageDesignKey } from '@/domain/page-designs';

import { requirePermission } from '../auth/session';
import { collections } from '../db/collections';
import { clientIp, hit, LIMITS } from '../security/rate-limit';
import * as audit from '../services/audit';
import { tags } from '../services/cache-tags';
import { EXPOSURE_MAX_AGE } from '../services/experiment-visitor';
import { countVisitor, endExperiment, listExperiments, startExperiment } from '../services/experiments';
import { getDesignState } from '../services/page-designs';

type Result = { ok: true; experiments: Experiment[]; published?: boolean } | { ok: false; error: string };

/* --------------------------------------------------------------- admin */

export async function startTest(input: { page: string; challenger: string; split: number }): Promise<Result> {
  const actor = await requirePermission('cms:write');
  if (!isPageDesignKey(input.page)) return { ok: false, error: 'Unknown page.' };
  const parsed = z.object({ challenger: z.string().max(40), split: z.number().int().min(5).max(95) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Choose a layout and a share between 5% and 95%.' };

  const result = await startExperiment(input.page, parsed.data, actor);
  if (!result.ok) return result;

  const meta = designFor(input.page).variantMeta;
  await audit.record({
    actor,
    action: 'design.experiment.start',
    entityType: 'PageDesign',
    entityId: input.page,
    entityLabel: designFor(input.page).title,
    changes: [
      {
        field: 'experiment',
        before: null,
        after: `${meta[result.experiment.control].name} vs ${meta[result.experiment.challenger].name}, ${result.experiment.split}% to ${meta[result.experiment.challenger].name}`,
      },
    ],
  });
  // The page switches into test mode now, not when its cache entry expires.
  updateTag(tags.pageDesign(input.page));
  return { ok: true, experiments: await listExperiments(input.page) };
}

export async function endTest(input: { page: string; id: string; publishChallenger: boolean }): Promise<Result> {
  const actor = await requirePermission('cms:write');
  if (!isPageDesignKey(input.page)) return { ok: false, error: 'Unknown page.' };

  const result = await endExperiment(input.page, input.id, input.publishChallenger ? 'PUBLISHED_CHALLENGER' : 'KEPT_CONTROL', actor);
  if (!result.ok) return result;

  const meta = designFor(input.page).variantMeta;
  await audit.record({
    actor,
    action: 'design.experiment.end',
    entityType: 'PageDesign',
    entityId: input.page,
    entityLabel: designFor(input.page).title,
    changes: [
      {
        field: 'experiment',
        before: 'running',
        after: input.publishChallenger ? `ended, ${meta[result.experiment.challenger].name} published` : 'ended, layout kept',
      },
    ],
  });
  updateTag(tags.pageDesign(input.page));
  return { ok: true, experiments: await listExperiments(input.page), published: input.publishChallenger };
}

/** Fresh numbers for the designer's A/B panel. */
export async function experimentsFor(page: string): Promise<Experiment[]> {
  await requirePermission('cms:write');
  if (!isPageDesignKey(page)) return [];
  return listExperiments(page);
}

/** The designer re-reads the published config after a test publishes its challenger. */
export async function designStateAfterTest(page: string) {
  await requirePermission('cms:write');
  if (!isPageDesignKey(page)) return null;
  return getDesignState(page);
}

/* ---------------------------------------------------------- storefront */

/**
 * Count this visitor in the test they were just shown -- once.
 *
 * Public, so nothing from the request is trusted: the arm is recomputed from
 * the visitor's own cookie, the test must be running, a visitor already
 * counted is skipped, and each address is rate limited.
 */
export async function recordExposure(input: { experimentId: string }): Promise<void> {
  const parsed = z.object({ experimentId: z.string().min(1).max(64) }).safeParse(input);
  if (!parsed.success) return;

  const jar = await cookies();
  const visitor = jar.get(VISITOR_COOKIE)?.value;
  if (!visitor) return;
  const exposures = parseExposures(jar.get(EXPOSURE_COOKIE)?.value);
  if (exposures.some((exposure) => exposure.i === parsed.data.experimentId)) return;

  const experiments = await collections.experiments();
  const running = await experiments.findOne(
    { _id: parsed.data.experimentId, status: 'RUNNING' },
    { projection: { split: 1 } },
  );
  if (!running) return;
  if (!(await hit(LIMITS.exposure, await clientIp())).allowed) return;

  const arm = armFor(visitor, parsed.data.experimentId, running.split);
  if (!(await countVisitor(parsed.data.experimentId, arm))) return;

  jar.set(EXPOSURE_COOKIE, serialiseExposures([...exposures, { i: parsed.data.experimentId, a: arm }]), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: EXPOSURE_MAX_AGE,
  });
}
