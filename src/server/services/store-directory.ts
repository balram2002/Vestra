import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';

import { PRESENCE_STALE_MS } from '@/domain/live';
import type { StorePageSettings } from '@/domain/page-designs/store';
import type { DirectoryStore } from '@/domain/store-directory';
import { storeStats } from '@/lib/store-stats';

import { collections } from '../db/collections';
import { tags } from './cache-tags';
import { listSellers } from './catalog';

const ALL_STATS = { trustScore: true, deliveryTime: true, ordersShipped: true } as StorePageSettings;
const NEW_FOR_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Every trading store, as the directory shows it.
 *
 * A seller record carries KYC, bank and contact details, so the directory is
 * handed a PUBLIC projection instead -- nothing here can reach a client
 * component by accident.
 */
export async function getStoreDirectory(): Promise<DirectoryStore[]> {
  'use cache';
  cacheTag(tags.sellerList);
  cacheLife('hours');

  const sellers = await listSellers(200);
  const now = Date.now();
  return sellers.map((seller) => ({
    id: seller.id,
    slug: seller.slug,
    name: seller.displayName,
    tagline: seller.tagline,
    about: seller.about,
    logo: seller.logoUrl,
    banner: seller.bannerUrl,
    city: seller.kyc.registeredAddress.city ?? '',
    verified: Boolean(seller.kyc.verifiedAt),
    ratingAverage: seller.rating.average,
    ratingCount: seller.rating.count,
    orders: seller.metrics.orderCount,
    liveProducts: seller.metrics.liveProductCount,
    trustValue: seller.rating.fulfilmentScore,
    stats: storeStats(seller, ALL_STATS),
    approvedAt: seller.approvedAt,
    isNew: seller.approvedAt ? now - Date.parse(seller.approvedAt) < NEW_FOR_MS : false,
  }));
}

/**
 * The stores taking video calls at this moment.
 *
 * Deliberately NOT cached: presence is a heartbeat that goes stale in ninety
 * seconds, so the directory reads it in its own suspended island and the rest
 * of the page stays prerendered.
 */
export async function liveStoreIds(): Promise<Set<string>> {
  const presence = await collections.sellerPresence();
  const since = new Date(Date.now() - PRESENCE_STALE_MS).toISOString();
  const live = await presence
    .find({ state: { $ne: 'OFFLINE' }, lastSeenAt: { $gte: since } }, { projection: { sellerId: 1 } })
    .toArray();
  return new Set(live.map((record) => String((record as { sellerId: string }).sellerId)));
}
