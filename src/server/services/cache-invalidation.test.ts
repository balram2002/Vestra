import { describe, expect, it } from 'vitest';

import { INVENTORY } from '@/config/business';

import { stockChangeIsVisible } from './cache-invalidation';

/**
 * When a stock movement is worth expiring caches for.
 *
 * The policy is a trade, and the trade is the whole point: invalidating on
 * every movement would expire every listing page on every add-to-bag, while
 * invalidating on none is what let a shopper click a size that had been sold
 * out for fifty minutes.
 *
 * So only the changes a shopper can SEE force a refresh — whether a size chip
 * is selectable, and the "Only N left" count that is printed on the page.
 */

const URGENT = INVENTORY.urgencyThreshold;

describe('stockChangeIsVisible', () => {
  it('ignores a movement that changed nothing', () => {
    expect(stockChangeIsVisible(50, 50)).toBe(false);
  });

  /*
   * The case that mattered. A variant reaching zero has to expire the cache
   * immediately, or its size chip stays selectable and the shopper is refused
   * at the bag with "this size just sold out" — after choosing it.
   */
  it('always fires when stock runs out', () => {
    expect(stockChangeIsVisible(1, 0)).toBe(true);
    expect(stockChangeIsVisible(500, 0)).toBe(true);
  });

  it('always fires when stock comes back', () => {
    expect(stockChangeIsVisible(0, 1)).toBe(true);
    expect(stockChangeIsVisible(0, 500)).toBe(true);
  });

  /*
   * Healthy stock moving is the common case — every add-to-bag, every dispatch
   * — and none of it changes a single rendered pixel. This is the branch that
   * keeps the catalogue cacheable.
   */
  it('stays quiet for movements well above the urgency threshold', () => {
    expect(stockChangeIsVisible(77, 76)).toBe(false);
    expect(stockChangeIsVisible(500, 200)).toBe(false);
  });

  /*
   * Below the threshold the exact number is printed on the page, so a stale
   * one is a lie rather than merely an omission.
   */
  it('fires once the count becomes visible on the page', () => {
    expect(stockChangeIsVisible(URGENT + 1, URGENT)).toBe(true);
    expect(stockChangeIsVisible(URGENT, URGENT - 1)).toBe(true);
  });

  it('fires on the way back out of the urgency band', () => {
    expect(stockChangeIsVisible(URGENT - 1, URGENT + 20)).toBe(true);
  });

  it('does not fire for a change entirely above the band', () => {
    expect(stockChangeIsVisible(URGENT + 2, URGENT + 1)).toBe(false);
  });

  /*
   * Negative stock should be impossible — the conditional updates prevent it —
   * but if it ever occurred it is a sold-out state, not an in-stock one, and
   * must not be treated as a quiet change.
   */
  it('treats a negative level as out of stock rather than as a large number', () => {
    expect(stockChangeIsVisible(-1, 5)).toBe(true);
    expect(stockChangeIsVisible(5, -1)).toBe(true);
  });
});
