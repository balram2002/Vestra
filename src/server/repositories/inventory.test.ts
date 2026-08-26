/**
 * Inventory movements — against a real MongoDB.
 *
 * `vitest.config.ts` says a mocked database mostly tests the mock, and that is
 * true here more than anywhere: every movement in this repository IS a Mongo
 * query, so asserting against a fake would only re-state the source.
 *
 * The claim worth proving is the one in the repository's own doc comment —
 * that the classic oversell race
 *
 *     read available -> check it is enough -> write available - n
 *
 * cannot happen, because the check and the decrement are one conditional
 * update. That is a claim ABOUT MONGODB, and only MongoDB can settle it. So
 * this suite runs against a throwaway database on the local server and drops it
 * afterwards.
 *
 * When no server is reachable the suite skips with a reason rather than
 * failing — a developer without Mongo running should not see a red build for a
 * dependency they were never told they needed.
 */

import { MongoClient } from 'mongodb';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const SCRATCH_DB = 'vestra_test_inventory';

/*
 * Point the repository at a scratch database BEFORE importing it. `dbName()`
 * reads the environment per call rather than at import, but the import also
 * pulls in `collections`, so setting it first keeps the ordering obvious to
 * anyone reading this later.
 */
process.env.MONGODB_DB = SCRATCH_DB;

const reachable = await (async () => {
  const probe = new MongoClient(URI, { serverSelectionTimeoutMS: 1500 });
  try {
    await probe.connect();
    await probe.db(SCRATCH_DB).command({ ping: 1 });
    return true;
  } catch {
    return false;
  } finally {
    await probe.close().catch(() => {});
  }
})();

const inventory = await import('./inventory');
const { closeDb, getDb } = await import('../db/client');

const VARIANT = 'var_test_1';
const OTHER = 'var_test_2';

function variant(id: string, available: number) {
  return {
    id,
    sku: `SKU-${id}`,
    size: 'M',
    colorLabel: 'Indigo',
    isActive: true,
    inventory: {
      variantId: id,
      available,
      reserved: 0,
      sold: 0,
      returned: 0,
      damaged: 0,
      lowStockThreshold: 5,
      restockEta: null,
      updatedAt: new Date().toISOString(),
    },
  };
}

/** The four buckets, as they stand right now. */
async function buckets(variantId = VARIANT) {
  const current = await inventory.getInventory(variantId);
  return {
    available: current?.available ?? -1,
    reserved: current?.reserved ?? -1,
    sold: current?.sold ?? -1,
    returned: current?.returned ?? -1,
    damaged: current?.damaged ?? -1,
  };
}

describe.skipIf(!reachable)('inventory movements', () => {
  beforeEach(async () => {
    const db = await getDb();
    await db.collection('products').deleteMany({});
    await db.collection('products').insertOne({
      _id: 'prd_test' as never,
      id: 'prd_test',
      title: 'Test product',
      variants: [variant(VARIANT, 10), variant(OTHER, 3)],
    } as never);
  });

  afterAll(async () => {
    if (!reachable) return;
    const db = await getDb();

    /*
     * Refuse to drop anything but the scratch database.
     *
     * This suite is one misplaced environment variable away from deleting a
     * developer's seeded data, and an assertion here costs nothing. The name is
     * re-read from the live handle rather than from the constant, so it checks
     * what is actually about to be dropped.
     */
    if (db.databaseName !== SCRATCH_DB) {
      throw new Error(
        `refusing to drop "${db.databaseName}" — expected the scratch database "${SCRATCH_DB}"`,
      );
    }

    await db.dropDatabase();
    await closeDb();
  });

  /* ------------------------------------------------------------- reserve */

  describe('reserve', () => {
    it('moves units from available into reserved', async () => {
      expect(await inventory.reserve(VARIANT, 3)).toBe(true);
      expect(await buckets()).toMatchObject({ available: 7, reserved: 3 });
    });

    it('refuses without writing when there is not enough', async () => {
      expect(await inventory.reserve(VARIANT, 11)).toBe(false);
      expect(await buckets()).toMatchObject({ available: 10, reserved: 0 });
    });

    it('allows taking the last unit exactly', async () => {
      expect(await inventory.reserve(VARIANT, 10)).toBe(true);
      expect(await buckets()).toMatchObject({ available: 0, reserved: 10 });
    });

    it('is a no-op for a non-positive quantity', async () => {
      expect(await inventory.reserve(VARIANT, 0)).toBe(true);
      expect(await buckets()).toMatchObject({ available: 10, reserved: 0 });
    });

    it('returns false for a variant that does not exist', async () => {
      expect(await inventory.reserve('var_nope', 1)).toBe(false);
    });

    /*
     * THE point of this file.
     *
     * Twenty concurrent attempts at the last ten units. If the check and the
     * decrement were separate operations, several would read `available: 10`
     * before any of them wrote, and the shop would sell stock it does not have.
     * Because the filter and the `$inc` are one update, exactly ten win.
     */
    it('produces exactly one winner per unit under concurrency', async () => {
      const attempts = await Promise.all(
        Array.from({ length: 20 }, () => inventory.reserve(VARIANT, 1)),
      );

      expect(attempts.filter(Boolean)).toHaveLength(10);
      expect(await buckets()).toMatchObject({ available: 0, reserved: 10 });
    });

    it('never drives available below zero under concurrent multi-unit demand', async () => {
      // Seven concurrent requests for three units each: 21 wanted, 10 in stock.
      const attempts = await Promise.all(
        Array.from({ length: 7 }, () => inventory.reserve(VARIANT, 3)),
      );

      const winners = attempts.filter(Boolean).length;
      expect(winners).toBe(3);

      const after = await buckets();
      expect(after.available).toBe(1);
      expect(after.reserved).toBe(9);
      expect(after.available).toBeGreaterThanOrEqual(0);
    });
  });

  /* ------------------------------------------------------------- release */

  describe('release', () => {
    it('puts held stock back on sale', async () => {
      await inventory.reserve(VARIANT, 4);
      expect(await inventory.release(VARIANT, 4)).toBe(true);
      expect(await buckets()).toMatchObject({ available: 10, reserved: 0 });
    });

    /*
     * Idempotence here is a correctness requirement, not a nicety: a retried
     * webhook or a saga recovery running twice must not manufacture stock.
     */
    it('refuses a release larger than what is actually held', async () => {
      await inventory.reserve(VARIANT, 2);

      expect(await inventory.release(VARIANT, 5)).toBe(false);
      expect(await buckets()).toMatchObject({ available: 8, reserved: 2 });
    });

    it('cannot be replayed to inflate available', async () => {
      await inventory.reserve(VARIANT, 2);

      expect(await inventory.release(VARIANT, 2)).toBe(true);
      expect(await inventory.release(VARIANT, 2)).toBe(false);
      expect(await buckets()).toMatchObject({ available: 10, reserved: 0 });
    });
  });

  /* ---------------------------------------------------------- commitSale */

  describe('commitSale', () => {
    it('moves reserved units into sold', async () => {
      await inventory.reserve(VARIANT, 3);
      expect(await inventory.commitSale(VARIANT, 3)).toBe(true);
      expect(await buckets()).toMatchObject({ available: 7, reserved: 0, sold: 3 });
    });

    /*
     * Committing must come out of RESERVED, never out of available. Otherwise
     * a dispatch could sell a unit that was never held for this order, and the
     * buckets would stop summing to what the seller owns.
     */
    it('refuses to commit more than is held', async () => {
      await inventory.reserve(VARIANT, 1);

      expect(await inventory.commitSale(VARIANT, 2)).toBe(false);
      expect(await buckets()).toMatchObject({ available: 9, reserved: 1, sold: 0 });
    });

    it('cannot commit against a variant with nothing reserved', async () => {
      expect(await inventory.commitSale(VARIANT, 1)).toBe(false);
      expect(await buckets()).toMatchObject({ available: 10, sold: 0 });
    });
  });

  /* ------------------------------------------------------------- returns */

  describe('restock and writeOff', () => {
    it('puts a passed return back on sale and counts it', async () => {
      await inventory.reserve(VARIANT, 2);
      await inventory.commitSale(VARIANT, 2);

      expect(await inventory.restock(VARIANT, 1)).toBe(true);
      expect(await buckets()).toMatchObject({ available: 9, sold: 2, returned: 1 });
    });

    /*
     * A failed return is written off and never resold, so `available` must not
     * move — that is the entire difference between the two functions.
     */
    it('writes a failed return off without returning it to sale', async () => {
      await inventory.reserve(VARIANT, 2);
      await inventory.commitSale(VARIANT, 2);

      expect(await inventory.writeOff(VARIANT, 1)).toBe(true);
      expect(await buckets()).toMatchObject({ available: 8, damaged: 1, returned: 0 });
    });
  });

  /* ---------------------------------------------------------- adjustment */

  describe('setAvailable', () => {
    it('sets the count outright, as a stock take does', async () => {
      expect(await inventory.setAvailable(VARIANT, 42)).toBe(true);
      expect(await buckets()).toMatchObject({ available: 42 });
    });

    it('clamps a negative correction to zero rather than storing it', async () => {
      expect(await inventory.setAvailable(VARIANT, -5)).toBe(true);
      expect(await buckets()).toMatchObject({ available: 0 });
    });

    it('floors a fractional count', async () => {
      await inventory.setAvailable(VARIANT, 7.9);
      expect(await buckets()).toMatchObject({ available: 7 });
    });

    /*
     * A stock take corrects what is ON THE SHELF. Units already held for an
     * in-flight order are not on the shelf, so the reserved bucket is left
     * alone — otherwise a seller counting their rails would cancel orders.
     */
    it('leaves reserved stock untouched', async () => {
      await inventory.reserve(VARIANT, 4);
      await inventory.setAvailable(VARIANT, 20);
      expect(await buckets()).toMatchObject({ available: 20, reserved: 4 });
    });
  });

  /* --------------------------------------------------------- reserveMany */

  describe('reserveMany', () => {
    it('reserves every line when all of them can be satisfied', async () => {
      const result = await inventory.reserveMany([
        { variantId: VARIANT, quantity: 2 },
        { variantId: OTHER, quantity: 1 },
      ]);

      expect(result.ok).toBe(true);
      expect(await buckets(VARIANT)).toMatchObject({ reserved: 2 });
      expect(await buckets(OTHER)).toMatchObject({ reserved: 1 });
    });

    /*
     * All or nothing. A bag half-reserved would strand units that no order
     * will ever claim and no release will ever free.
     */
    it('gives back everything it took when a later line falls short', async () => {
      const result = await inventory.reserveMany([
        { variantId: VARIANT, quantity: 2 },
        { variantId: OTHER, quantity: 99 },
      ]);

      expect(result.ok).toBe(false);
      expect(await buckets(VARIANT)).toMatchObject({ available: 10, reserved: 0 });
      expect(await buckets(OTHER)).toMatchObject({ available: 3, reserved: 0 });
    });

    it('reports which line fell short and what was left', async () => {
      const result = await inventory.reserveMany([
        { variantId: VARIANT, quantity: 1 },
        { variantId: OTHER, quantity: 99 },
      ]);

      expect(result.shortfalls).toEqual([
        { variantId: OTHER, requested: 99, available: 3 },
      ]);
    });

    it('reports a shortfall of zero for a variant that no longer exists', async () => {
      const result = await inventory.reserveMany([{ variantId: 'var_gone', quantity: 1 }]);

      expect(result.ok).toBe(false);
      expect(result.shortfalls).toEqual([
        { variantId: 'var_gone', requested: 1, available: 0 },
      ]);
    });
  });

  /* ---------------------------------------------------------------- read */

  describe('availableForMany', () => {
    it('answers for every variant asked about in one round trip', async () => {
      const result = await inventory.availableForMany([VARIANT, OTHER]);
      expect(result.get(VARIANT)).toBe(10);
      expect(result.get(OTHER)).toBe(3);
    });

    /*
     * A deleted variant reads as zero rather than absent, so callers never have
     * to tell "gone" apart from "out of stock" — the shopper sees the same
     * thing either way.
     */
    it('reports a missing variant as zero rather than omitting it', async () => {
      const result = await inventory.availableForMany([VARIANT, 'var_gone']);
      expect(result.get('var_gone')).toBe(0);
      expect(result.size).toBe(2);
    });

    it('returns an empty map for an empty request', async () => {
      expect((await inventory.availableForMany([])).size).toBe(0);
    });
  });
});

/* ------------------------------------------------------------- derived */

/**
 * The badge functions are pure and need no database, so they run regardless of
 * whether one is reachable.
 */
describe('derived stock state', () => {
  const stock = (available: number, lowStockThreshold = 5) => ({
    variantId: VARIANT,
    available,
    reserved: 0,
    sold: 0,
    returned: 0,
    damaged: 0,
    lowStockThreshold,
    restockEta: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  it('reads no inventory at all as out of stock', () => {
    expect(inventory.stockLevelOf(null)).toBe('OUT_OF_STOCK');
  });

  it('distinguishes a discontinued variant from a sold-out one', () => {
    expect(inventory.stockLevelOf(stock(20), false)).toBe('DISCONTINUED');
    expect(inventory.stockLevelOf(stock(0), true)).toBe('OUT_OF_STOCK');
  });

  it('switches to low stock at the threshold, not below it', () => {
    expect(inventory.stockLevelOf(stock(6))).toBe('IN_STOCK');
    expect(inventory.stockLevelOf(stock(5))).toBe('LOW_STOCK');
    expect(inventory.stockLevelOf(stock(1))).toBe('LOW_STOCK');
  });

  /*
   * A threshold of 0 means "not configured", not "never warn" — falling back to
   * the platform default is what stops a seller who never touched the field
   * from silently losing their low-stock alerts.
   */
  it('falls back to the platform default when no threshold is set', () => {
    expect(inventory.stockLevelOf(stock(4, 0))).toBe('LOW_STOCK');
    expect(inventory.stockLevelOf(stock(9, 0))).toBe('IN_STOCK');
  });

  /*
   * Honest scarcity. "Only 0 left" is a lie of a different kind, and urgency
   * is driven by the platform threshold rather than the seller's own, so a
   * seller cannot manufacture pressure by setting it to 500.
   */
  it('shows urgency only when units genuinely remain', () => {
    expect(inventory.showsUrgency(stock(0))).toBe(false);
    expect(inventory.showsUrgency(stock(5))).toBe(true);
    expect(inventory.showsUrgency(stock(6))).toBe(false);
    expect(inventory.showsUrgency(null)).toBe(false);
  });

  it('ignores a seller-set threshold when deciding urgency', () => {
    expect(inventory.showsUrgency(stock(50, 500))).toBe(false);
  });
});
