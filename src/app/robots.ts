import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/config/site';

/**
 * Crawler rules.
 *
 * Three categories of disallow, for three different reasons:
 *
 *  1. PRIVATE surfaces (account, orders, bag, checkout, both consoles). These
 *     also carry `robots: { index: false }` in their own metadata — this is
 *     belt and braces, because a robots rule is a request and a meta tag is
 *     enforced at the page.
 *  2. INFINITE surfaces. `/search?q=` is an unbounded URL space; letting a
 *     crawler walk it burns budget on pages that will never rank and that
 *     canonicalise elsewhere anyway.
 *  3. API and internal routes, which return no crawlable content.
 *
 * Category and product filters are NOT disallowed. They canonicalise to the
 * clean URL, and blocking them would stop the crawler from ever seeing that
 * canonical tag.
 */
export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

  // A preview or staging deployment must never be indexed. Getting this wrong
  // puts a staging domain in the results competing with the real one.
  if (!isProduction || process.env.NEXT_PUBLIC_ALLOW_INDEXING === 'false') {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      sitemap: absoluteUrl('/sitemap-index.xml'),
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/account',
          '/account/',
          '/orders',
          '/orders/',
          '/bag',
          '/checkout',
          '/checkout/',
          '/wishlist',
          '/seller',
          '/seller/',
          '/admin',
          '/admin/',
          '/api/',
          '/login',
          '/register',
          '/forgot-password',
          // Unbounded query space; the canonical listing pages carry the value.
          '/search',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap-index.xml'),
    host: absoluteUrl('/'),
  };
}
