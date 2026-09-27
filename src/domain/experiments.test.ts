import { describe, expect, it } from 'vitest';

import {
  armFor,
  compareArms,
  emptyArm,
  MAX_EXPOSURES,
  MIN_VISITORS_PER_ARM,
  parseExposures,
  serialiseExposures,
  type ArmStats,
} from './experiments';

const stats = (visitors: number, addedToBag: number, orders = 0): ArmStats => ({ ...emptyArm(), visitors, addedToBag, orders });

describe('armFor', () => {
  it('gives the same visitor the same arm every time', () => {
    expect(armFor('visitor-1', 'exp-1', 50)).toBe(armFor('visitor-1', 'exp-1', 50));
  });

  it('splits visitors close to the chosen share', () => {
    let b = 0;
    for (let index = 0; index < 20000; index += 1) if (armFor(`v${index}`, 'exp-split', 30) === 'B') b += 1;
    expect(b / 20000).toBeGreaterThan(0.28);
    expect(b / 20000).toBeLessThan(0.32);
  });

  it('assigns independently across tests', () => {
    let same = 0;
    for (let index = 0; index < 20000; index += 1) {
      if (armFor(`v${index}`, 'exp-one', 50) === armFor(`v${index}`, 'exp-two', 50)) same += 1;
    }
    expect(same / 20000).toBeGreaterThan(0.47);
    expect(same / 20000).toBeLessThan(0.53);
  });
});

describe('compareArms', () => {
  it('offers no verdict until both arms have enough visitors', () => {
    const result = compareArms(stats(50, 5), stats(MIN_VISITORS_PER_ARM, 60), 'addedToBag');
    expect(result.verdict).toBe('COLLECTING');
    expect(result.visitorsNeeded).toBe(MIN_VISITORS_PER_ARM - 50);
  });

  it('calls a clear winner', () => {
    const result = compareArms(stats(2000, 200), stats(2000, 300), 'addedToBag');
    expect(result.verdict).toBe('B_AHEAD');
    expect(result.confidence).toBeGreaterThan(0.99);
    expect(result.lift).toBeCloseTo(0.5, 5);
  });

  it('calls it for A when A is clearly better', () => {
    expect(compareArms(stats(2000, 300), stats(2000, 200), 'addedToBag').verdict).toBe('A_AHEAD');
  });

  it('refuses to call a small difference', () => {
    const result = compareArms(stats(400, 40), stats(400, 44), 'addedToBag');
    expect(result.verdict).toBe('NO_CLEAR_DIFFERENCE');
    expect(result.confidence).toBeLessThan(0.95);
  });

  it('has no lift while the control has converted nobody', () => {
    expect(compareArms(stats(300, 0), stats(300, 3), 'orders').lift).toBeNull();
  });

  it('matches a known z-test result', () => {
    // 10% vs 12% on 5000 each: z ≈ 3.18, two-sided confidence ≈ 0.9985.
    expect(compareArms(stats(5000, 500), stats(5000, 600), 'addedToBag').confidence).toBeCloseTo(0.9985, 3);
  });
});

describe('exposure cookie', () => {
  it('round-trips, keeping only the latest entries', () => {
    const many = Array.from({ length: MAX_EXPOSURES + 3 }, (_, index) => ({ i: `e${index}`, a: 'A' as const }));
    const parsed = parseExposures(serialiseExposures(many));
    expect(parsed).toHaveLength(MAX_EXPOSURES);
    expect(parsed.at(-1)?.i).toBe(`e${MAX_EXPOSURES + 2}`);
  });

  it('treats a mangled cookie as empty', () => {
    expect(parseExposures('{not json')).toEqual([]);
    expect(parseExposures(JSON.stringify([{ i: 'x', a: 'C' }]))).toEqual([]);
  });
});
