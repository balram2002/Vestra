/**
 * A/B tests on page designs: the vocabulary, the arm assignment, and the
 * statistics that decide whether a test has a winner.
 *
 * Arm A is the page's published layout (the control); arm B is one other
 * layout (the challenger). Both render with the published settings for
 * their layout, so a test compares LAYOUTS, not a layout plus a stray
 * switch.
 */

/** The visitor id cookie. Random, first-party, set by `proxy.ts`. */
export const VISITOR_COOKIE = 'vx';
/** The tests this visitor has been shown, and whether a bag add was credited. */
export const EXPOSURE_COOKIE = 'vxe';

export type Arm = 'A' | 'B';

export interface ArmStats {
  /** Distinct visitors shown this arm. */
  visitors: number;
  /** Distinct visitors who added anything to their bag afterwards. */
  addedToBag: number;
  /** Orders placed afterwards. */
  orders: number;
  /** Paise, from those orders. */
  revenue: number;
}

export type ExperimentOutcome = 'KEPT_CONTROL' | 'PUBLISHED_CHALLENGER';

export interface Experiment {
  id: string;
  page: string;
  control: string;
  challenger: string;
  /** Percent of visitors shown the challenger, 5-95. */
  split: number;
  status: 'RUNNING' | 'ENDED';
  arms: Record<Arm, ArmStats>;
  startedAt: string;
  startedByName: string;
  endedAt: string | null;
  endedByName: string | null;
  outcome: ExperimentOutcome | null;
}

/** What a page needs to render a running test: no counts, no names. */
export interface RunningExperiment {
  id: string;
  control: string;
  challenger: string;
  split: number;
}

export const SPLIT_MIN = 5;
export const SPLIT_MAX = 95;

export function emptyArm(): ArmStats {
  return { visitors: 0, addedToBag: 0, orders: 0, revenue: 0 };
}

/** FNV-1a, 32 bit: small, fast, and well spread over short strings. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The arm a visitor sees in one test. Deterministic, so the same visitor
 * sees the same arm on every visit, and keyed on the test as well as the
 * visitor, so being in B of one test says nothing about the next.
 */
export function armFor(visitorId: string, experimentId: string, split: number): Arm {
  return hash(`${experimentId}:${visitorId}`) % 100 < split ? 'B' : 'A';
}

export function variantFor(experiment: Pick<RunningExperiment, 'control' | 'challenger'>, arm: Arm): string {
  return arm === 'B' ? experiment.challenger : experiment.control;
}

/* --------------------------------------------------------- statistics */

/** Below this many visitors in either arm, no verdict is offered at all. */
export const MIN_VISITORS_PER_ARM = 200;
/** Two-sided confidence needed to call a winner. */
export const CONFIDENCE_TO_CALL = 0.95;

export type Metric = 'addedToBag' | 'orders';

export interface Comparison {
  rateA: number;
  rateB: number;
  /** B relative to A: 0.12 is "12% better". Null while A's rate is zero. */
  lift: number | null;
  /** Two-sided confidence that the rates differ, 0-1. */
  confidence: number;
  verdict: 'COLLECTING' | 'NO_CLEAR_DIFFERENCE' | 'A_AHEAD' | 'B_AHEAD';
  /** Visitors still needed in the smaller arm before a verdict is possible. */
  visitorsNeeded: number;
}

/** Standard normal CDF, via the Abramowitz and Stegun erf approximation (error < 1.5e-7). */
function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * Two-proportion z-test on one metric.
 *
 * A winner is called only when both arms have enough visitors AND the
 * difference is 95% certain. Before that the answer is "collecting", not a
 * leader: early leads in A/B tests reverse all the time, and a dashboard
 * that crowns one on day one gets acted on.
 */
export function compareArms(a: ArmStats, b: ArmStats, metric: Metric): Comparison {
  const rateA = a.visitors > 0 ? Math.min(1, a[metric] / a.visitors) : 0;
  const rateB = b.visitors > 0 ? Math.min(1, b[metric] / b.visitors) : 0;
  const lift = rateA > 0 ? (rateB - rateA) / rateA : null;
  const visitorsNeeded = Math.max(0, MIN_VISITORS_PER_ARM - Math.min(a.visitors, b.visitors));

  let confidence = 0;
  if (a.visitors > 0 && b.visitors > 0) {
    const pooled = (Math.min(a[metric], a.visitors) + Math.min(b[metric], b.visitors)) / (a.visitors + b.visitors);
    const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.visitors + 1 / b.visitors));
    if (se > 0) confidence = 2 * normalCdf(Math.abs((rateB - rateA) / se)) - 1;
  }

  const verdict: Comparison['verdict'] =
    visitorsNeeded > 0
      ? 'COLLECTING'
      : confidence < CONFIDENCE_TO_CALL || rateA === rateB
        ? 'NO_CLEAR_DIFFERENCE'
        : rateB > rateA
          ? 'B_AHEAD'
          : 'A_AHEAD';

  return { rateA, rateB, lift, confidence, verdict, visitorsNeeded };
}

/* ------------------------------------------------------ exposure cookie */

export interface Exposure {
  /** Experiment id. */
  i: string;
  a: Arm;
  /** 1 once this visitor's first bag add was credited to the test. */
  b?: 1;
}

export const MAX_EXPOSURES = 12;

/** Tolerant: a mangled cookie is an empty list, never an error. */
export function parseExposures(raw: string | undefined): Exposure[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((entry) => typeof entry?.i === 'string' && (entry.a === 'A' || entry.a === 'B'))
      .slice(-MAX_EXPOSURES)
      .map((entry) => ({ i: entry.i, a: entry.a, ...(entry.b === 1 ? { b: 1 as const } : {}) }));
  } catch {
    return [];
  }
}

export function serialiseExposures(exposures: Exposure[]): string {
  return JSON.stringify(exposures.slice(-MAX_EXPOSURES));
}
