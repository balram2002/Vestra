import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import { galleryAssets, reelAssets, showcaseVideo } from '@/domain/media';
import type { Media } from '@/domain/types';
import { collections, toEntities } from '../db/collections';
import { getProductBySlug, getSellerById, toSummaries } from './catalog';
import { tags } from './cache-tags';

/** A stable landing page for the exact clip that was shared, not the current feed order. */
export async function getProductDemo(slug: string, clipId?: string) {
  'use cache';
  cacheLife('minutes');
  cacheTag(tags.productList, tags.sellerList);
  const product = await getProductBySlug(slug);
  if (!product || product.status !== 'PUBLISHED') return null;
  cacheTag(tags.product(product.id));
  const seller = await getSellerById(product.sellerId);
  if (!seller || !['ACTIVE', 'APPROVED'].includes(seller.status)) return null;
  cacheTag(tags.seller(seller.slug));
  const videos = [...reelAssets(product.media), showcaseVideo(product.media), ...product.media]
    .filter((item): item is Media => item?.kind === 'VIDEO');
  const clip = clipId ? videos.find((item) => item.id === clipId) : videos[0];
  // Never substitute a different reel after an old shared clip was removed.
  if (clipId && !clip) return null;
  const poster = clip?.thumbnailUrl && clip.thumbnailUrl !== clip.url ? clip.thumbnailUrl : galleryAssets(product.media).find((item) => item.kind === 'IMAGE')?.url;
  const products = await collections.products();
  // The seller's explicit merchandising order wins. Shared-clip products are
  // the useful fallback for older reels that have no featured list yet.
  const chosenIds = clip?.featuredProductIds?.slice(0, 11) ?? [];
  const linked = clip ? toEntities(await products.find({
    sellerId: seller.id,
    status: 'PUBLISHED',
    _id: { $ne: product.id, ...(chosenIds.length ? { $in: chosenIds } : {}) },
    ...(chosenIds.length ? {} : { media: { $elemMatch: { kind: 'VIDEO', url: clip.url } } }),
  }).limit(11).toArray()) : [];
  if (chosenIds.length) linked.sort((a, b) => chosenIds.indexOf(a.id) - chosenIds.indexOf(b.id));
  const featured = [product, ...linked];
  const summaries = await toSummaries(featured);
  return {
    title: product.title,
    caption: product.highlights[0] ?? product.title,
    path: `/demo/${product.slug}${clip ? `?clip=${encodeURIComponent(clip.id)}` : ''}`,
    videoUrl: clip?.url ?? null,
    durationSeconds: clip?.durationSeconds ?? 0,
    posterUrl: poster ?? null,
    seller: { name: seller.displayName, slug: seller.slug, logo: seller.logoUrl, verified: Boolean(seller.kyc.verifiedAt) },
    products: summaries.map((summary, index) => ({ ...summary, variants: featured[index].variants.filter((variant) => variant.isActive).map((variant) => ({ id: variant.id, size: variant.size, color: variant.colorLabel, available: variant.inventory.available, sellingPrice: variant.sellingPrice })) })),
  };
}

export type ProductDemoData = NonNullable<Awaited<ReturnType<typeof getProductDemo>>>;
