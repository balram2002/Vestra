import 'server-only';

import { randomUUID } from 'node:crypto';

import { getDb } from './client';
import { COLLECTIONS } from './collections';

/**
 * Compensating units of work.
 *
 * MongoDB offers multi-document transactions only on a replica set, and this
 * deployment targets a standalone server. Rather than pretend a rollback
 * exists, cross-document units of work are modelled explicitly as a sequence of
 * steps, each paired with the action that undoes it.
 *
 * That is not a downgrade from transactions -- for order placement it is
 * closer to correct. Reserving stock, charging a gateway and creating an order
 * span systems that no database transaction could cover anyway: a payment
 * capture cannot be rolled back by aborting a Mongo session, it has to be
 * refunded. Writing the compensation down makes that real work visible instead
 * of assumed.
 *
 * Guarantees this runner provides:
 *
 *  - steps run in order; the first failure stops forward progress;
 *  - completed steps are compensated in strict reverse order;
 *  - the whole attempt is journalled, so a step that fails to compensate
 *    (a network blip mid-refund) is left on disk for the recovery scan and for
 *    a human to see, rather than vanishing into a swallowed catch;
 *  - a compensation that itself throws never masks the original error.
 */

export interface SagaStep<TContext> {
  /** Stable, human-readable. Appears in the journal and in ops tooling. */
  name: string;
  /** Do the work. Anything it returns is merged into the shared context. */
  run: (context: TContext) => Promise<Partial<TContext> | void>;
  /**
   * Undo `run`. Omit only when the step genuinely has no external effect.
   * Must be idempotent: recovery may invoke it a second time.
   */
  compensate?: (context: TContext) => Promise<void>;
}

export type SagaStatus = 'RUNNING' | 'COMPLETED' | 'COMPENSATED' | 'COMPENSATION_FAILED';

interface SagaRecord {
  _id: string;
  name: string;
  correlationId: string | null;
  status: SagaStatus;
  completedSteps: string[];
  compensatedSteps: string[];
  failedStep: string | null;
  error: string | null;
  /** Steps whose compensation threw. These need a human. */
  orphanedSteps: string[];
  createdAt: string;
  updatedAt: string;
}

export class SagaFailure extends Error {
  readonly sagaId: string;
  readonly step: string;
  readonly compensated: boolean;
  readonly orphanedSteps: string[];

  constructor(options: {
    message: string;
    sagaId: string;
    step: string;
    compensated: boolean;
    orphanedSteps: string[];
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'SagaFailure';
    this.sagaId = options.sagaId;
    this.step = options.step;
    this.compensated = options.compensated;
    this.orphanedSteps = options.orphanedSteps;
  }
}

async function journal(record: SagaRecord): Promise<void> {
  try {
    const db = await getDb();
    await db
      .collection<SagaRecord>(COLLECTIONS.sagas)
      .replaceOne({ _id: record._id }, record, { upsert: true });
  } catch (error) {
    // The journal is an observability aid. Losing it must never turn a
    // successful order into a failed one.
    console.error('[vestrawab:saga] journal write failed', error);
  }
}

/**
 * Run `steps` as one unit of work.
 *
 * On success the accumulated context is returned. On failure every completed
 * step is compensated in reverse and a `SagaFailure` is thrown carrying enough
 * detail for the caller to render a specific, recoverable message.
 */
export async function runSaga<TContext extends object>(
  name: string,
  initial: TContext,
  steps: SagaStep<TContext>[],
  options: { correlationId?: string } = {},
): Promise<TContext> {
  const sagaId = randomUUID();
  const now = () => new Date().toISOString();

  const record: SagaRecord = {
    _id: sagaId,
    name,
    correlationId: options.correlationId ?? null,
    status: 'RUNNING',
    completedSteps: [],
    compensatedSteps: [],
    failedStep: null,
    error: null,
    orphanedSteps: [],
    createdAt: now(),
    updatedAt: now(),
  };
  await journal(record);

  let context = initial;
  const done: SagaStep<TContext>[] = [];

  for (const step of steps) {
    try {
      const patch = await step.run(context);
      if (patch) context = { ...context, ...patch };
      done.push(step);
      record.completedSteps.push(step.name);
      record.updatedAt = now();
    } catch (error) {
      record.status = 'COMPENSATED';
      record.failedStep = step.name;
      record.error = error instanceof Error ? error.message : String(error);
      record.updatedAt = now();

      // Unwind in reverse. Each compensation is isolated so one failure does
      // not abandon the remaining ones.
      for (const completed of [...done].reverse()) {
        if (!completed.compensate) continue;
        try {
          await completed.compensate(context);
          record.compensatedSteps.push(completed.name);
        } catch (compensationError) {
          record.status = 'COMPENSATION_FAILED';
          record.orphanedSteps.push(completed.name);
          console.error(
            `[vestrawab:saga] "${name}" could not compensate step "${completed.name}"`,
            compensationError,
          );
        }
      }

      record.updatedAt = now();
      await journal(record);

      throw new SagaFailure({
        message: `${name} failed at step "${step.name}": ${record.error}`,
        sagaId,
        step: step.name,
        compensated: record.status === 'COMPENSATED',
        orphanedSteps: record.orphanedSteps,
        cause: error,
      });
    }
  }

  record.status = 'COMPLETED';
  record.updatedAt = now();
  await journal(record);

  return context;
}

/**
 * Sagas that need a human: compensation failed, or the process died mid-run
 * and left a record stuck in RUNNING. Surfaced on the admin operations screen.
 */
export async function findStuckSagas(olderThanMinutes = 15): Promise<SagaRecord[]> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();

  return db
    .collection<SagaRecord>(COLLECTIONS.sagas)
    .find({
      $or: [
        { status: 'COMPENSATION_FAILED' },
        { status: 'RUNNING', updatedAt: { $lt: cutoff } },
      ],
    })
    .sort({ createdAt: 1 })
    .limit(200)
    .toArray();
}

/** Mark a stuck saga as handled once ops has reconciled it by hand. */
export async function resolveSaga(sagaId: string): Promise<void> {
  const db = await getDb();
  await db
    .collection<SagaRecord>(COLLECTIONS.sagas)
    .updateOne(
      { _id: sagaId },
      { $set: { status: 'COMPENSATED', updatedAt: new Date().toISOString() } },
    );
}
