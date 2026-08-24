import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/config/site';
import { collections, toEntities } from '@/server/db/collections';

/**
 * Segmented sitemap.
 *
 * Google caps a sitemap at 50,000 URLs, and this catalogue is built to outgrow
 * that — so it segments from the start rather than working until it silently
 * stops covering the tail of the catalogue.
 *
 * `generateSitemaps` produces `/sitemap/0.xml`, `/sitemap/1.xml`, … and Next
 * serves the index at `/sitemap.xml`.
 *
 * PRIORITY AND FREQUENCY ARE HONEST. A crawler treats obviously-uniform values
 * as noise, so departments outrank leaf categories, products carry their real
 * `updatedAt`, and nothing claims to change hourly when it does not.
 */

const PER_SITEMAP = 20_000;

export async function generateSitemaps() {
  const products = await collections.products();
  const live = await products.countDocuments({ status: 'PUBLISHED' });

  // Segment 0 always exists and carries the static and taxonomy URLs, so a
  // shop with no products still publishes a valid sitemap.
  const productSitemaps = Math.ceil(live / PER_SITEMAP);
  return Array.from({ length: Math.max(1, productSitemaps + 1) }, (_, id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  id: Promise<string> | string;
}): Promise<MetadataRoute.Sitemap> {
  const segment = Number.parseInt(String(await id), 10) || 0;

  if (segment === 0) return coreSitemap();
  return productSitemap(segment - 1);
}

/** Static pages, departments, categories, brands and stores. */
async function coreSitemap(): Promise<MetadataRoute.Sitemap> {
  const [categoryCol, brandCol, sellerCol, cmsCol] = await Promise.all([
    collections.categories(),
    collections.brands(),
    collections.sellers(),
    collections.cmsPages(),
  ]);

  const [categories, brands, sellers, pages] = await Promise.all([
    categoryCol.find({ isActive: true }).toArray().then(toEntities),
    brandCol.find({ isActive: true }).toArray().then(toEntities),
    sellerCol.find({ status: 'ACTIVE' }).toArray().then(toEntities),
    cmsCol.find({}).toArray().then(toEntities),
  ]);

  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/brands'), changeFrequency: 'weekly', priority: 0.5 },
    { url: absoluteUrl('/stores'), changeFrequency: 'weekly', priority: 0.5 },
    { url: absoluteUrl('/about'), changeFrequency: 'monthly', priority: 0.3 },
    { url: absoluteUrl('/sell-with-us'), changeFrequency: 'monthly', priority: 0.4 },
  ];

  for (const category of categories) {
    entries.push({
      url: absoluteUrl(`/category/${category.slug}`),
      lastModified: category.updatedAt,
      changeFrequency: 'daily',
      // Departments are the entry points that actually rank; leaves are deeper
      // and more numerous, so they are weighted below them.
      priority: category.depth === 0 ? 0.9 : category.depth === 1 ? 0.7 : 0.6,
    });
  }

  for (const brand of brands) {
    entries.push({
      url: absoluteUrl(`/brand/${brand.slug}`),
      changeFrequency: 'weekly',
      priority: brand.isPremium ? 0.6 : 0.5,
    });
  }

  for (const seller of sellers) {
    entries.push({
      url: absoluteUrl(`/store/${seller.slug}`),
      lastModified: seller.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.5,
    });
  }

  for (const page of pages) {
    entries.push({
      url: absoluteUrl(`/legal/${page.slug}`),
      lastModified: page.updatedAt,
      changeFrequency: 'yearly',
      priority: 0.2,
    });
  }

  return entries;
}

/** One page of live products, newest first so the freshest are found soonest. */
async function productSitemap(page: number): Promise<MetadataRoute.Sitemap> {
  const products = await collections.products();

  const rows = toEntities(
    await products
      .find(
        { status: 'PUBLISHED' },
        { projection: { slug: 1, updatedAt: 1, publishedAt: 1, 'stats.unitsSold30d': 1, id: 1 } },
      )
      .sort({ publishedAt: -1 })
      .skip(page * PER_SITEMAP)
      .limit(PER_SITEMAP)
      .toArray(),
  );

  return rows.map((product) => ({
    url: absoluteUrl(`/product/${product.slug}`),
    lastModified: product.updatedAt,
    changeFrequency: 'weekly' as const,
    // Products that actually sell are worth crawling more often than the tail.
    priority: product.stats.unitsSold30d > 40 ? 0.8 : 0.6,
  }));
}
