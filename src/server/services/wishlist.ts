import 'server-only';

import type { ProductSummary, Wishlist } from '@/domain/types';
import { entityId } from '@/lib/ids';

import type { Owner } from '../auth/session';
import { collections, toEntities, toEntity } from '../db/collections';
import { toSummaries } from './catalog';

/**
 * Wishlist.
 *
 * Per-visitor like the bag, so never cached. Guests get one too — asking
 * someone to create an account before they can save an item is how you lose
 * both the save and the account.
 *
 * Saves are stored at PRODUCT level, not variant. Someone saving a kurta is
 * saying "I want this style", not "I want this style in size M" — and pinning
 * it to a variant means the entry dies when that one size sells out.
 */

export interface WishlistEntry {
  productId: string;
  addedAt: string;
}

function ownerFilter(owner: Owner) {
  if (owner.kind === 'user') return { userId: owner.userId };
  if (owner.kind === 'guest') return { guestToken: owner.guestToken };
  return null;
}

export async function findWishlist(owner: Owner): Promise<Wishlist | null> {
  const filter = ownerFilter(owner);
  if (!filter) return null;

  const wishlists = await collections.wishlists();
  return toEntity(await wishlists.findOne(filter));
}

async function ensureWishlist(owner: Owner): Promise<Wishlist> {
  const existing = await findWishlist(owner);
  if (existing) return existing;

  const now = new Date().toISOString();
  const wishlist: Wishlist = {
    id: entityId('wsh'),
    userId: owner.kind === 'user' ? owner.userId : null,
    guestToken: owner.kind === 'guest' ? owner.guestToken : null,
    // The schema allows several named lists per shopper; the UI exposes one for
    // now, so every wishlist created here is the default.
    name: 'My wishlist',
    isDefault: true,
    items: [],
    createdAt: now,
    updatedAt: now,
  };

  const wishlists = await collections.wishlists();
  await wishlists.insertOne({ ...wishlist, _id: wishlist.id });
  return wishlist;
}

/**
 * Toggle, rather than separate add and remove.
 *
 * The control is a single heart, so the action is a single toggle — and the
 * returned `saved` flag lets the client render the new state without a second
 * read.
 */
export async function toggleWishlist(
  owner: Owner,
  productId: string,
): Promise<{ ok: boolean; saved: boolean }> {
  const wishlist = await ensureWishlist(owner);
  const wishlists = await collections.wishlists();

  const already = wishlist.items.some((item) => item.productId === productId);
  const now = new Date().toISOString();

  if (already) {
    await wishlists.updateOne(
      { _id: wishlist.id },
      { $pull: { items: { productId } }, $set: { updatedAt: now } },
    );
    return { ok: true, saved: false };
  }

  // The price at save time is captured so the list can show "price dropped by
  // X" later, which is the single most effective reason to come back to it.
  const products = await collections.products();
  const doc = await products.findOne(
    { _id: productId },
    { projection: { 'priceRange.minSellingPrice': 1 } },
  );

  await wishlists.updateOne(
    { _id: wishlist.id },
    {
      $push: {
        items: {
          id: entityId('wsi'),
          productId,
          variantId: null,
          priceAtAdd: doc?.priceRange?.minSellingPrice ?? 0,
          notifyOnRestock: true,
          addedAt: now,
        },
      },
      $set: { updatedAt: now },
    },
  );
  return { ok: true, saved: true };
}

export async function getWishlistCount(owner: Owner): Promise<number> {
  const wishlist = await findWishlist(owner);
  return wishlist?.items.length ?? 0;
}

export async function getWishlistIds(owner: Owner): Promise<Set<string>> {
  const wishlist = await findWishlist(owner);
  return new Set(wishlist?.items.map((item) => item.productId) ?? []);
}

/**
 * The wishlist as product cards.
 *
 * Products that have since been unpublished are dropped rather than shown as
 * broken rows — but the ordering of what remains is preserved, newest first,
 * because that is the order the shopper saved them in.
 */
export async function getWishlistView(owner: Owner): Promise<ProductSummary[]> {
  const wishlist = await findWishlist(owner);
  if (!wishlist || wishlist.items.length === 0) return [];

  const ordered = [...wishlist.items].sort(
    (a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt),
  );
  const ids = ordered.map((item) => item.productId);

  const products = await collections.products();
  const docs = await products.find({ _id: { $in: ids }, status: 'PUBLISHED' }).toArray();

  const summaries = await toSummaries(toEntities(docs));
  const byId = new Map(summaries.map((summary) => [summary.id, summary]));

  return ids
    .map((id) => byId.get(id))
    .filter((summary): summary is ProductSummary => Boolean(summary));
}

/** Fold a guest wishlist into the account one at sign-in. */
export async function mergeGuestWishlist(guestToken: string, userId: string): Promise<void> {
  const wishlists = await collections.wishlists();
  const guest = toEntity(await wishlists.findOne({ guestToken }));

  if (!guest || guest.items.length === 0) {
    await wishlists.deleteOne({ guestToken });
    return;
  }

  const target = await ensureWishlist({ kind: 'user', userId });
  const existing = new Set(target.items.map((item) => item.productId));
  const additions = guest.items.filter((item) => !existing.has(item.productId));

  if (additions.length > 0) {
    await wishlists.updateOne(
      { _id: target.id },
      {
        $push: { items: { $each: additions } },
        $set: { updatedAt: new Date().toISOString() },
      },
    );
  }

  await wishlists.deleteOne({ guestToken });
}
