import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';

import {
  emptyArm,
  SPLIT_MAX,
  SPLIT_MIN,
  type Arm,
  type Experiment,
  type ExperimentOutcome,
  type RunningExperiment,
} from '@/domain/experiments';
import { designFor, PAGE_DESIGN_KEYS, type PageDesignKey } from '@/domain/page-designs';
import type { SessionUser } from '@/domain/types';
import { entityId } from '@/lib/ids';

import { requirePermission } from '../auth/session';
import { collections, toEntities, toEntity } from '../db/collections';
import { EXPERIMENT_INDEXES } from '../db/indexes';
import { tags } from './cache-tags';
import { getDesignState, publish } from './page-designs';

/**
 * A/B tests between two layouts of one designable page.
 *
 * One document per test, and every count is a single `$inc` on it, so two
 * shoppers converting at once cannot lose each other's numbers -- no
 * transaction needed. "One running test per page" is a partial unique index,
 * so it holds under a race rather than by a check that could interleave.
 */

let indexed: Promise<unknown> | null = null;

/** The constraint this service relies on, created once per process if the seeder never ran it. */
async function ensureIndexes() {
  indexed ??= collections.experiments().then((collection) => collection.createIndexes(EXPERIMENT_INDEXES)).catch((error) => {
    indexed = null;
    throw error;
  });
  await indexed;
}

/* ---------------------------------------------------------- storefront */

/**
 * The test running on a page, if any -- what a storefront route asks before
 * rendering. Cached under the page's design tag, which starting or ending a
 * test expires, so the page switches in and out of test mode immediately.
 */
export async function getRunningExperiment(page: PageDesignKey): Promise<RunningExperiment | null> {
  'use cache';
  cacheTag(tags.pageDesign(page));
  cacheLife('hours');

  const experiments = await collections.experiments();
  const found = await experiments.findOne({ page, status: 'RUNNING' }, { projection: { control: 1, challenger: 1, split: 1 } });
  return found ? { id: String(found._id), control: found.control, challenger: found.challenger, split: found.split } : null;
}

/** One visitor seen in one arm. Called once per visitor per test (the caller dedupes). */
export async function countVisitor(id: string, arm: Arm): Promise<boolean> {
  const experiments = await collections.experiments();
  const result = await experiments.updateOne({ _id: id, status: 'RUNNING' }, { $inc: { [`arms.${arm}.visitors`]: 1 } });
  return result.matchedCount === 1;
}

/** A conversion after exposure. Ignored once the test has ended. */
export async function countConversion(id: string, arm: Arm, kind: 'addedToBag' | 'order', revenue = 0): Promise<void> {
  const experiments = await collections.experiments();
  const inc =
    kind === 'order'
      ? { [`arms.${arm}.orders`]: 1, [`arms.${arm}.revenue`]: Math.max(0, Math.round(revenue)) }
      : { [`arms.${arm}.addedToBag`]: 1 };
  await experiments.updateOne({ _id: id, status: 'RUNNING' }, { $inc: inc });
}

/* --------------------------------------------------------------- admin */

export async function listExperiments(page: PageDesignKey): Promise<Experiment[]> {
  await requirePermission('cms:write');
  const experiments = await collections.experiments();
  return toEntities(await experiments.find({ page }).sort({ startedAt: -1 }).limit(20).toArray());
}

/** Every running test and the latest ended ones, for Analytics. */
export async function experimentOverview(): Promise<Experiment[]> {
  await requirePermission('analytics:read');
  const experiments = await collections.experiments();
  const docs = await experiments
    .find({ page: { $in: PAGE_DESIGN_KEYS } })
    .sort({ status: -1, startedAt: -1 })
    .limit(12)
    .toArray();
  return toEntities(docs);
}

export type StartResult = { ok: true; experiment: Experiment } | { ok: false; error: string };

export async function startExperiment(
  page: PageDesignKey,
  input: { challenger: string; split: number },
  actor: SessionUser,
): Promise<StartResult> {
  await ensureIndexes();
  const definition = designFor(page);
  const state = await getDesignState(page);
  const control = state.published.variant;

  if (!(definition.variants as readonly string[]).includes(input.challenger)) {
    return { ok: false, error: 'Choose a layout to test.' };
  }
  if (input.challenger === control) {
    return { ok: false, error: 'Test a layout other than the one shoppers see now.' };
  }
  if (state.scheduled) {
    return { ok: false, error: 'A publish is scheduled for this page. Cancel it, or let it go live, before starting a test.' };
  }
  const split = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(input.split)));

  const id = entityId('exp');
  const experiment: Experiment = {
    id,
    page,
    control,
    challenger: input.challenger,
    split,
    status: 'RUNNING',
    arms: { A: emptyArm(), B: emptyArm() },
    startedAt: new Date().toISOString(),
    startedByName: actor.fullName,
    endedAt: null,
    endedByName: null,
    outcome: null,
  };

  const experiments = await collections.experiments();
  try {
    await experiments.insertOne({ _id: id, ...experiment });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return { ok: false, error: 'A test is already running on this page. End it before starting another.' };
    }
    throw error;
  }
  return { ok: true, experiment };
}

export type EndResult = { ok: true; experiment: Experiment } | { ok: false; error: string };

/**
 * Stop a test. Keeping the control changes nothing shoppers see beyond the
 * test ending; publishing the challenger makes it the page's layout through
 * the ordinary publish, so it lands in History and can be put back.
 */
export async function endExperiment(
  page: PageDesignKey,
  id: string,
  outcome: ExperimentOutcome,
  actor: SessionUser,
): Promise<EndResult> {
  const experiments = await collections.experiments();
  const ended = await experiments.findOneAndUpdate(
    { _id: id, page, status: 'RUNNING' },
    { $set: { status: 'ENDED', endedAt: new Date().toISOString(), endedByName: actor.fullName, outcome } },
    { returnDocument: 'after' },
  );
  const experiment = toEntity(ended);
  if (!experiment) return { ok: false, error: 'That test has already ended.' };

  if (outcome === 'PUBLISHED_CHALLENGER') {
    const state = await getDesignState(page);
    const meta = designFor(page).variantMeta[experiment.challenger];
    await publish(
      page,
      { ...state.published, variant: experiment.challenger },
      null,
      actor,
      `Published ${meta.name} after an A/B test`,
    );
  }
  return { ok: true, experiment };
}
