import { absoluteUrl } from '@/config/site';
import { collections } from '@/server/db/collections';

/**
 * Sitemap index.
 *
 * `generateSitemaps` publishes the segments at `/sitemap/0.xml`, `/sitemap/1.xml`
 * and so on, but it does NOT publish an index that lists them — so a crawler
 * given only `/sitemap.xml` finds nothing. This is that index, and it is what
 * `robots.txt` points at.
 *
 * The segment count is derived from the same page size the sitemap route uses,
 * so adding products cannot leave a segment unlisted.
 */

const PER_SITEMAP = 20_000;

export async function GET() {
  const products = await collections.products();
  const live = await products.countDocuments({ status: 'PUBLISHED' });

  // Segment 0 is the core sitemap (taxonomy, brands, stores, static pages);
  // the rest are product pages.
  const segments = Math.max(1, Math.ceil(live / PER_SITEMAP) + 1);
  const lastModified = new Date().toISOString();

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Array.from({ length: segments }, (_, index) => {
  return `  <sitemap>
    <loc>${absoluteUrl(`/sitemap/${index}.xml`)}</loc>
    <lastmod>${lastModified}</lastmod>
  </sitemap>`;
}).join('\n')}
</sitemapindex>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Crawlers re-fetch this often; an hour is long enough to matter and
      // short enough that a new segment is discovered the same day.
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
