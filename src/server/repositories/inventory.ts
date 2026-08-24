import 'server-only';

import { INVENTORY } from '@/config/business';
import type { StockLevel } from '@/domain/enums';
import type { Inventory } from '@/domain/types';

import { collections } from '../db/collections';

/**
 * Inventory movements.
 *
 * Stock lives inside the variant subdocument of a product, which means every
 * movement below is a SINGLE-DOCUMENT update. That matters more than it looks:
 * MongoDB guarantees atomicity and isolation at the document level with no
 * transaction and no replica set, so the classic oversell race
 *
 *     read available -> check it is enough -> write available - n
 *
 * never happens here. The check and the decrement are one operation: the
 * filter requires `available >= quantity` and the update applies `$inc` in the
 * same round trip. Two shoppers racing for the last unit produce exactly one
 * winner, and the loser gets `false` rather than a negative stock count.
 *
 * The four buckets model where a unit physically is, and they must always sum
 * to what the seller actually owns:
 *
 *   available  sellable right now
 *   reserved   held by an in-flight checkout or an unshipped order
 *   sold       dispatched and paid for
 *   returned   came back and passed quality check
 *   damaged    written off, never sellable again
 */

export interface StockMovement {
  variantId: string;
  quantity: number;
}

export interface MovementResult {
  ok: boolean;
  /** Variants that could not satisfy the request, with what was left. */
  shortfalls: Array<{ variantId: string; requested: number; available: number }>;
}

/* --------------------------------------------------------------- reserve */

/**
 * Hold stock for a checkout in flight.
 *
 * Returns false when the variant no longer has enough, WITHOUT writing --
 * the caller turns that into "size M sold out while you were paying" rather
 * than a 500.
 */
export async function reserve(variantId: string, quantity: number): Promise<boolean> {
  if (quantity <= 0) return true;

  const products = await collections.products();
  const result = await products.updateOne(
    {
      variants: {
        $elemMatch: { id: variantId, 'inventory.available': { $gte: quantity } },
      },
    },
    {
      $inc: {
        'variants.$.inventory.available': -quantity,
        'variants.$.inventory.reserved': quantity,
      },
      $set: { 'variants.$.inventory.updatedAt': new Date().toISOString() },
    },
  );

  return result.modifiedCount === 1;
}

/**
 * Reserve several variants as one unit.
 *
 * There is no cross-document atomicity available, so this reserves one at a
 * time and releases everything already taken if any line falls short. The
 * window in which partial holds exist is milliseconds, and the compensation is
 * exact, so no unit is ever stranded.
 */
export async function reserveMany(movements: StockMovement[]): Promise<MovementResult> {
  const taken: StockMovement[] = [];
  const shortfalls: MovementResult['shortfalls'] = [];

  for (const movement of movements) {
    const ok = await reserve(movement.variantId, movement.quantity);
    if (ok) {
      taken.push(movement);
      continue;
    }

    const available = await availableFor(movement.variantId);
    shortfalls.push({
      variantId: movement.variantId,
      requested: movement.quantity,
      available,
    });
  }

  if (shortfalls.length > 0) {
    for (const movement of taken) {
      await release(movement.variantId, movement.quantity);
    }
    return { ok: false, shortfalls };
  }

  return { ok: true, shortfalls: [] };
}

/* --------------------------------------------------------------- release */

/**
 * Put held stock back on sale. The compensation for `reserve`, used when a
 * payment fails, a checkout is abandoned past its window, or a seller cancels.
 *
 * Guarded on `reserved >= quantity` so a duplicate release -- a retried
 * webhook, a saga recovery running twice -- cannot inflate `available`.
 * Idempotence here is a correctness requirement, not a nicety.
 */
export async function release(variantId: string, quantity: number): Promise<boolean> {
  if (quantity <= 0) return true;

  const products = await collections.products();
  const result = await products.updateOne(
    {
      variants: {
        $elemMatch: { id: variantId, 'inventory.reserved': { $gte: quantity } },
      },
    },
    {
      $inc: {
        'variants.$.inventory.reserved': -quantity,
        'variants.$.inventory.available': quantity,
      },
      $set: { 'variants.$.inventory.updatedAt': new Date().toISOString() },
    },
  );

  return result.modifiedCount === 1;
}

export async function releaseMany(movements: StockMovement[]): Promise<void> {
  for (const movement of movements) {
    await release(movement.variantId, movement.quantity);
  }
}

/* ---------------------------------------------------------------- commit */

/**
 * Reserved -> sold, on dispatch. This is the point of no return: after it the
 * unit is gone and any reversal goes through the returns flow, not `release`.
 */
export async function commitSale(variantId: string, quantity: number): Promise<boolean> {
  if (quantity <= 0) return true;

  const products = await collections.products();
  const result = await products.updateOne(
    {
      variants: {
        $elemMatch: { id: variantId, 'inventory.reserved': { $gte: quantity } },
      },
    },
    {
      $inc: {
        'variants.$.inventory.reserved': -quantity,
        'variants.$.inventory.sold': quantity,
      },
      $set: { 'variants.$.inventory.updatedAt': new Date().toISOString() },
    },
  );

  return result.modifiedCount === 1;
}

/* --------------------------------------------------------------- returns */

/**
 * A returned unit that passed quality check goes back on sale and is counted
 * so the seller can see their return rate.
 */
export async function restock(variantId: string, quantity: number): Promise<boolean> {
  if (quantity <= 0) return true;

  const products = await collections.products();
  const result = await products.updateOne(
    { 'variants.id': variantId },
    {
      $inc: {
        'variants.$.inventory.available': quantity,
        'variants.$.inventory.returned': quantity,
      },
      $set: { 'variants.$.inventory.updatedAt': new Date().toISOString() },
    },
  );

  return result.modifiedCount === 1;
}

/** A returned unit that failed quality check. Written off, never resold. */
export async function writeOff(variantId: string, quantity: number): Promise<boolean> {
  if (quantity <= 0) return true;

  const products = await collections.products();
  const result = await products.updateOne(
    { 'variants.id': variantId },
    {
      $inc: { 'variants.$.inventory.damaged': quantity },
      $set: { 'variants.$.inventory.updatedAt': new Date().toISOString() },
    },
  );

  return result.modifiedCount === 1;
}

/* ------------------------------------------------------------ adjustment */

/**
 * A seller correcting their own counts (stock take, CSV import).
 *
 * Deliberately a SET on `available` rather than a delta, because that is what
 * a stock take actually is. Guarded so it can never drive the figure negative.
 */
export async function setAvailable(variantId: string, available: number): Promise<boolean> {
  const next = Math.max(0, Math.floor(available));

  const products = await collections.products();
  const result = await products.updateOne(
    { 'variants.id': variantId },
    {
      $set: {
        'variants.$.inventory.available': next,
        'variants.$.inventory.updatedAt': new Date().toISOString(),
      },
    },
  );

  return result.modifiedCount === 1;
}

export async function setLowStockThreshold(
  variantId: string,
  threshold: number,
): Promise<boolean> {
  const products = await collections.products();
  const result = await products.updateOne(
    { 'variants.id': variantId },
    {
      $set: {
        'variants.$.inventory.lowStockThreshold': Math.max(0, Math.floor(threshold)),
        'variants.$.inventory.updatedAt': new Date().toISOString(),
      },
    },
  );

  return result.modifiedCount === 1;
}

/* ------------------------------------------------------------------ read */

/**
 * Current inventory for one variant.
 *
 * Projected down to the matching array element so a product with 40 variants
 * does not travel over the wire to answer a question about one of them.
 */
export async function getInventory(variantId: string): Promise<Inventory | null> {
  const products = await collections.products();
  const doc = await products.findOne(
    { 'variants.id': variantId },
    { projection: { 'variants.$': 1 } },
  );

  return doc?.variants?.[0]?.inventory ?? null;
}

export async function availableFor(variantId: string): Promise<number> {
  const inventory = await getInventory(variantId);
  return inventory?.available ?? 0;
}

/** Batched lookup for the bag, which needs every line at once. */
export async function availableForMany(
  variantIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (variantIds.length === 0) return result;

  const products = await collections.products();
  const docs = await products
    .find({ 'variants.id': { $in: variantIds } }, { projection: { variants: 1 } })
    .toArray();

  const wanted = new Set(variantIds);
  for (const doc of docs) {
    for (const variant of doc.variants ?? []) {
      if (wanted.has(variant.id)) {
        result.set(variant.id, variant.inventory.available);
      }
    }
  }

  // Variants that have since been deleted read as zero rather than absent, so
  // callers never have to distinguish "gone" from "out of stock".
  for (const id of variantIds) {
    if (!result.has(id)) result.set(id, 0);
  }

  return result;
}

/* --------------------------------------------------------------- derived */

/** The badge shown on a product card or size chip. */
export function stockLevelOf(inventory: Inventory | null, isActive = true): StockLevel {
  if (!inventory) return 'OUT_OF_STOCK';
  if (!isActive) return 'DISCONTINUED';
  if (inventory.available <= 0) return 'OUT_OF_STOCK';

  const threshold = inventory.lowStockThreshold || INVENTORY.defaultLowStockThreshold;
  if (inventory.available <= threshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}

/** Whether to show the "Only N left" nudge. Honest scarcity only. */
export function showsUrgency(inventory: Inventory | null): boolean {
  if (!inventory || inventory.available <= 0) return false;
  return inventory.available <= INVENTORY.urgencyThreshold;
}
