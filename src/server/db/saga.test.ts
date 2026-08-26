import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The saga runner.
 *
 * This is what stands in for transactions on a standalone MongoDB, so its
 * guarantees are the guarantees the whole write path rests on. Every one of
 * them is asserted here:
 *
 *  - steps run in order; the first failure stops forward progress;
 *  - completed steps are compensated in strict REVERSE order;
 *  - a compensation that throws does not abandon the remaining ones;
 *  - a compensation that throws never masks the original error;
 *  - the journal records enough for a human to reconcile by hand.
 *
 * The journal is mocked rather than mocked away. It is the only durable trace
 * of a half-finished unit of work, and "did the runner write down what a human
 * would need" is precisely the part worth testing.
 */

interface JournalRecord {
  _id: string;
  name: string;
  status: string;
  completedSteps: string[];
  compensatedSteps: string[];
  failedStep: string | null;
  error: string | null;
  orphanedSteps: string[];
  correlationId: string | null;
}

/** Every version of every record written, newest last. */
const writes: JournalRecord[] = [];
/** Set to make the journal itself fail, as a flaky database would. */
let journalThrows = false;

vi.mock('./client', () => ({
  getDb: async () => {
    if (journalThrows) throw new Error('journal unavailable');
    return {
      collection: () => ({
        replaceOne: async (_filter: unknown, record: JournalRecord) => {
          writes.push(structuredClone(record));
          return { acknowledged: true };
        },
      }),
    };
  },
}));

const { runSaga, SagaFailure } = await import('./saga');

/**
 * Run something expected to fail, and hand back the SagaFailure it threw.
 *
 * `runSaga` resolves to the context, so catching inline widens the type to
 * "context or error" and loses every field worth asserting on.
 */
async function failureFrom(run: () => Promise<unknown>): Promise<InstanceType<typeof SagaFailure>> {
  let caught: unknown;
  try {
    await run();
  } catch (thrown) {
    caught = thrown;
  }
  expect(caught).toBeInstanceOf(SagaFailure);
  return caught as InstanceType<typeof SagaFailure>;
}

/** The final state the journal was left in for a run. */
function finalRecord(): JournalRecord {
  return writes[writes.length - 1];
}

beforeEach(() => {
  writes.length = 0;
  journalThrows = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

interface Ctx {
  trail: string[];
  reserved?: boolean;
  charged?: boolean;
}

/** A step that appends to a shared trail so ORDER is observable. */
function step(name: string, options: { fails?: boolean; compensates?: boolean } = {}) {
  return {
    name,
    run: async (context: Ctx) => {
      if (options.fails) throw new Error(`${name} blew up`);
      context.trail.push(`run:${name}`);
    },
    ...(options.compensates === false
      ? {}
      : {
          compensate: async (context: Ctx) => {
            context.trail.push(`undo:${name}`);
          },
        }),
  };
}

/* ------------------------------------------------------------- happy path */

describe('a saga that succeeds', () => {
  it('runs every step in order and returns the accumulated context', async () => {
    const context = await runSaga<Ctx>('checkout', { trail: [] }, [
      {
        name: 'reserve',
        run: async () => ({ reserved: true }),
        compensate: async () => {},
      },
      {
        name: 'charge',
        run: async () => ({ charged: true }),
        compensate: async () => {},
      },
    ]);

    expect(context.reserved).toBe(true);
    expect(context.charged).toBe(true);
  });

  it('merges what each step returns into the context the next one sees', async () => {
    const seen: Array<boolean | undefined> = [];

    await runSaga<Ctx>('checkout', { trail: [] }, [
      { name: 'reserve', run: async () => ({ reserved: true }) },
      {
        name: 'charge',
        run: async (context) => {
          seen.push(context.reserved);
        },
      },
    ]);

    expect(seen).toEqual([true]);
  });

  it('leaves a step that returns nothing alone', async () => {
    const context = await runSaga<Ctx>('checkout', { trail: [], reserved: true }, [
      { name: 'notify', run: async () => undefined },
    ]);

    expect(context.reserved).toBe(true);
  });

  it('journals the run as COMPLETED with every step named', async () => {
    await runSaga<Ctx>('checkout', { trail: [] }, [step('reserve'), step('charge')], {
      correlationId: 'ord_123',
    });

    const record = finalRecord();
    expect(record.status).toBe('COMPLETED');
    expect(record.completedSteps).toEqual(['reserve', 'charge']);
    expect(record.correlationId).toBe('ord_123');
    expect(record.failedStep).toBeNull();
  });

  /*
   * The RUNNING record has to hit disk BEFORE the first step does any work.
   * A process that dies mid-saga is exactly the case the recovery scan exists
   * for, and it can only find what was written down first.
   */
  it('journals RUNNING before any step executes', async () => {
    let statusAtFirstStep: string | undefined;

    await runSaga<Ctx>('checkout', { trail: [] }, [
      {
        name: 'reserve',
        run: async () => {
          statusAtFirstStep = writes[0]?.status;
        },
      },
    ]);

    expect(statusAtFirstStep).toBe('RUNNING');
  });
});

/* ------------------------------------------------------------ compensation */

describe('a saga that fails', () => {
  it('stops at the failure and does not run later steps', async () => {
    const context: Ctx = { trail: [] };

    await expect(
      runSaga<Ctx>('checkout', context, [
        step('reserve'),
        step('charge', { fails: true }),
        step('confirm'),
      ]),
    ).rejects.toThrow(SagaFailure);

    expect(context.trail).not.toContain('run:confirm');
  });

  /*
   * Reverse order is the whole contract. Releasing stock before refunding the
   * card would sell inventory the shopper has not been given back their money
   * for.
   */
  it('compensates completed steps in strict reverse order', async () => {
    const context: Ctx = { trail: [] };

    await expect(
      runSaga<Ctx>('checkout', context, [
        step('reserve'),
        step('charge'),
        step('confirm', { fails: true }),
      ]),
    ).rejects.toThrow();

    expect(context.trail).toEqual(['run:reserve', 'run:charge', 'undo:charge', 'undo:reserve']);
  });

  it('does not compensate the step that failed', async () => {
    const context: Ctx = { trail: [] };

    await expect(
      runSaga<Ctx>('checkout', context, [step('reserve'), step('charge', { fails: true })]),
    ).rejects.toThrow();

    expect(context.trail).not.toContain('undo:charge');
  });

  it('skips steps that declared no compensation', async () => {
    const context: Ctx = { trail: [] };

    await expect(
      runSaga<Ctx>('checkout', context, [
        step('reserve'),
        step('log', { compensates: false }),
        step('charge', { fails: true }),
      ]),
    ).rejects.toThrow();

    expect(context.trail).toEqual(['run:reserve', 'run:log', 'undo:reserve']);
  });

  it('carries the failing step and the original cause on the error', async () => {
    const error = await failureFrom(() =>
      runSaga<Ctx>('checkout', { trail: [] }, [step('reserve'), step('charge', { fails: true })]),
    );

    expect(error.step).toBe('charge');
    expect(error.compensated).toBe(true);
    expect(error.orphanedSteps).toEqual([]);
    expect(error.message).toContain('charge blew up');
    expect((error.cause as Error).message).toBe('charge blew up');
  });

  it('journals the failure as COMPENSATED with the reason', async () => {
    await runSaga<Ctx>('checkout', { trail: [] }, [
      step('reserve'),
      step('charge', { fails: true }),
    ]).catch(() => {});

    const record = finalRecord();
    expect(record.status).toBe('COMPENSATED');
    expect(record.failedStep).toBe('charge');
    expect(record.error).toBe('charge blew up');
    expect(record.completedSteps).toEqual(['reserve']);
    expect(record.compensatedSteps).toEqual(['reserve']);
  });
});

/* ------------------------------------------------- compensation that fails */

describe('when a compensation itself fails', () => {
  const stubborn = {
    name: 'charge',
    run: async (context: Ctx) => {
      context.trail.push('run:charge');
    },
    compensate: async () => {
      throw new Error('refund gateway timed out');
    },
  };

  /*
   * One compensation failing must not abandon the others. The refund is the
   * one most likely to fail — it crosses a network to a payment gateway — and
   * it is also the step most likely to sit UNDERNEATH the stock release in the
   * unwind order.
   */
  it('still compensates the remaining steps', async () => {
    const context: Ctx = { trail: [] };

    await runSaga<Ctx>('checkout', context, [
      step('reserve'),
      stubborn,
      step('confirm', { fails: true }),
    ]).catch(() => {});

    expect(context.trail).toContain('undo:reserve');
  });

  it('marks the run COMPENSATION_FAILED and names what needs a human', async () => {
    await runSaga<Ctx>('checkout', { trail: [] }, [
      step('reserve'),
      stubborn,
      step('confirm', { fails: true }),
    ]).catch(() => {});

    const record = finalRecord();
    expect(record.status).toBe('COMPENSATION_FAILED');
    expect(record.orphanedSteps).toEqual(['charge']);
    // The one that DID unwind is still recorded as unwound.
    expect(record.compensatedSteps).toEqual(['reserve']);
  });

  /*
   * The original failure is what a caller can act on. Replacing it with
   * "refund gateway timed out" would report the cleanup's problem as the
   * order's problem, and send whoever reads the log looking in the wrong place.
   */
  it('reports the original failure, not the compensation failure', async () => {
    const error = await failureFrom(() =>
      runSaga<Ctx>('checkout', { trail: [] }, [stubborn, step('confirm', { fails: true })]),
    );

    expect(error.step).toBe('confirm');
    expect(error.message).toContain('confirm blew up');
    expect(error.message).not.toContain('refund gateway');
    expect(error.compensated).toBe(false);
    expect(error.orphanedSteps).toEqual(['charge']);
  });
});

/* -------------------------------------------------------- journal failures */

describe('when the journal is unavailable', () => {
  /*
   * The journal is an observability aid. A successful order must not become a
   * failed one because the sagas collection was briefly unreachable — that
   * would turn a monitoring outage into an outage.
   */
  it('does not fail a saga that otherwise succeeded', async () => {
    journalThrows = true;

    const context = await runSaga<Ctx>('checkout', { trail: [] }, [
      { name: 'reserve', run: async () => ({ reserved: true }) },
    ]);

    expect(context.reserved).toBe(true);
    expect(writes).toHaveLength(0);
  });

  it('still compensates and still throws the original failure', async () => {
    journalThrows = true;
    const context: Ctx = { trail: [] };

    await expect(
      runSaga<Ctx>('checkout', context, [step('reserve'), step('charge', { fails: true })]),
    ).rejects.toThrow('charge blew up');

    expect(context.trail).toContain('undo:reserve');
  });
});

/* ------------------------------------------------------------------ shapes */

describe('edge shapes', () => {
  it('accepts an empty step list', async () => {
    const context = await runSaga<Ctx>('noop', { trail: [] }, []);
    expect(context.trail).toEqual([]);
    expect(finalRecord().status).toBe('COMPLETED');
  });

  it('compensates nothing when the very first step fails', async () => {
    const context: Ctx = { trail: [] };

    await expect(
      runSaga<Ctx>('checkout', context, [step('reserve', { fails: true })]),
    ).rejects.toThrow();

    expect(context.trail).toEqual([]);
    expect(finalRecord().compensatedSteps).toEqual([]);
    expect(finalRecord().status).toBe('COMPENSATED');
  });

  /*
   * Compensation sees the context as it was when the failure happened, not as
   * it was when the step ran — a refund needs the payment id that a LATER step
   * put there.
   */
  it('hands compensation the fully accumulated context', async () => {
    let seenPaymentId: string | undefined;

    await runSaga<Ctx & { paymentId?: string }>('checkout', { trail: [] }, [
      {
        name: 'reserve',
        run: async () => ({}),
        compensate: async (context) => {
          seenPaymentId = context.paymentId;
        },
      },
      { name: 'charge', run: async () => ({ paymentId: 'pay_9' }) },
      { name: 'confirm', run: async () => { throw new Error('nope'); } },
    ]).catch(() => {});

    expect(seenPaymentId).toBe('pay_9');
  });
});
