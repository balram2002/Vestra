import 'server-only';

import { revalidateTag } from 'next/cache';

import { INVENTORY } from '@/config/business';

/**
 * Cache invalidation.
 *
 * `cache-tags.ts` defines the vocabulary; this is what actually spends it.
 * Keeping the two apart matters because the vocabulary is dependency-free and
 * importable from anywhere, while calling `revalidateTag` drags in the request
 * scope and must not.
 *
 * Every `"use cache"` scope in the storefront has a `cacheLife` measured in
 * hours or days. Without a call to this module those scopes refresh ONLY on
 * expiry, which means a seller can publish a product that nobody sees for an
 * hour, and a shopper can be shown a size that sold out fifty minutes ago and
 * be refused at the bag.
 */

/**
 * Expire these tags, if there is a cache to expire them in.
 *
 * The seeder, scripts and tests call the same repositories that a request does,
 * and `revalidateTag` throws outside a request scope. There is genuinely no
 * cache to invalidate in those contexts, so the throw carries no information
 * and is swallowed — but only that throw: nothing else here is guarded.
 */
export function invalidate(tags: readonly string[]): void {
  for (const tag of tags) {
    try {
      revalidateTag(tag, 'max');
    } catch {
      // No request scope. Nothing is cached, so nothing needs expiring.
    }
  }
}

/**
 * Whether a stock movement is worth expiring caches for.
 *
 * Invalidating on EVERY movement would expire every listing page on every
 * add-to-bag, which is a heavy price for a number that is not rendered. What is
 * rendered is a size chip's enabled state and the "Only N left" nudge, so those
 * are the only two things that need to force a refresh:
 *
 *   - crossing between in-stock and out-of-stock, which changes whether a
 *     shopper can select a size at all;
 *   - landing at or below the urgency threshold, where the exact count is
 *     printed on the page and a stale one is a lie.
 *
 * A variant going from 77 to 76 changes nothing anyone can see, and is
 * deliberately allowed to sit in cache until it expires on its own.
 */
export function stockChangeIsVisible(before: number, after: number): boolean {
  if (before === after) return false;
  if (before <= 0 || after <= 0) return true;
  return after <= INVENTORY.urgencyThreshold || before <= INVENTORY.urgencyThreshold;
}
