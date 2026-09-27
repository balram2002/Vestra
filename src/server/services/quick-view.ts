import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';

import { galleryAssets } from '@/domain/media';
import type { ProductSummary } from '@/domain/types';

import { tags } from './cache-tags';
import { getProductBySlug, getSellerById, toSummaries } from './catalog';

export interface QuickViewOption {
  id: string;
  color: string;
  size: string;
  available: number;
  sellingPrice: number;
}

export interface QuickViewData {
  product: ProductSummary;
  images: string[];
  options: QuickViewOption[];
}

/**
 * What a listing's quick view needs to sell one product without leaving the
 * page: a few photos and every option that can be bought.
 *
 * Public data, so no permission -- but only a PUBLISHED product from a
 * trading store, the same rule the product page applies. The live stock is a
 * hint (the bag re-checks it atomically), so the entry is cached briefly.
 */
export async function getQuickView(slug: string): Promise<QuickViewData | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(tags.productList);

  const product = await getProductBySlug(slug);
  if (!product || product.status !== 'PUBLISHED') return null;
  cacheTag(tags.product(product.id));
  const seller = await getSellerById(product.sellerId);
  if (!seller || !['ACTIVE', 'APPROVED'].includes(seller.status)) return null;

  const [summary] = await toSummaries([product]);
  const images = galleryAssets(product.media)
    .filter((asset) => asset.kind === 'IMAGE')
    .slice(0, 4)
    .map((asset) => asset.url);

  return {
    product: summary,
    images: images.length ? images : [summary.primaryImage],
    options: product.variants
      .filter((variant) => variant.isActive)
      .map((variant) => ({
        id: variant.id,
        color: variant.colorLabel,
        size: variant.size,
        available: variant.inventory.available,
        sellingPrice: variant.sellingPrice,
      })),
  };
}
