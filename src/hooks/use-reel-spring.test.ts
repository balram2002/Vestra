import { describe, expect, it } from 'vitest';
import { reelSpringStep } from './use-reel-spring';

describe('reel spring', () => {
  it.each([844, -844, 0])('settles at %s after a fast fling', (target) => {
    let position = 200, velocity = 1800;
    for (let frame = 0; frame < 240; frame++) {
      ({ position, velocity } = reelSpringStep(position, velocity, target, 1 / 60));
    }
    expect(position).toBeCloseTo(target, 2);
    expect(Math.abs(velocity)).toBeLessThan(0.01);
  });
  it('stays finite after a long background-tab frame', () => {
    const next = reelSpringStep(0, 0, 844, 90);
    expect(next.position).toBeGreaterThan(0);
    expect(next.position).toBeLessThan(844);
  });
});
