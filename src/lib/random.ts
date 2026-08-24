/**
 * Deterministic pseudo-randomness.
 *
 * The entire catalogue, order history and analytics dataset is generated from a
 * fixed seed. That makes the demo data reproducible across reloads, machines and
 * test runs -- a screenshot taken today matches the one taken tomorrow, and a
 * failing test can be replayed exactly.
 */

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  float(min: number, max: number, precision?: number): number;
  bool(probability?: number): boolean;
  pick<T>(items: readonly T[]): T;
  pickMany<T>(items: readonly T[], count: number): T[];
  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T;
  shuffle<T>(items: readonly T[]): T[];
  /** Normal-ish distribution via central limit; useful for prices and ratings. */
  gaussian(mean: number, stdDev: number): number;
  dateBetween(from: Date, to: Date): Date;
}

/** mulberry32 -- small, fast, good enough distribution for content generation. */
export function createRng(seed: number | string): Rng {
  let state = typeof seed === 'string' ? hashString(seed) : seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => Math.floor(next() * (max - min + 1)) + min;

  const rng: Rng = {
    next,
    int,
    float: (min, max, precision = 2) => {
      const value = next() * (max - min) + min;
      const factor = 10 ** precision;
      return Math.round(value * factor) / factor;
    },
    bool: (probability = 0.5) => next() < probability,
    pick: (items) => items[Math.floor(next() * items.length)],
    pickMany: (items, count) => rng.shuffle(items).slice(0, Math.min(count, items.length)),
    weighted: (entries) => {
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return entries[entries.length - 1][0];
    },
    shuffle: (items) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    gaussian: (mean, stdDev) => {
      const sum = next() + next() + next() + next() + next() + next();
      return mean + (sum - 3) * stdDev;
    },
    dateBetween: (from, to) => new Date(from.getTime() + next() * (to.getTime() - from.getTime())),
  };

  return rng;
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * A stable 0..1 value derived from any key. Used for "personalisation" and
 * ranking jitter that must stay identical for the same product across renders.
 */
export function stableUnit(key: string): number {
  return hashString(key) / 4294967296;
}
