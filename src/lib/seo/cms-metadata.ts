import type { Metadata } from 'next';

import { absoluteUrl } from '@/config/site';
import type { CmsPage } from '@/domain/types';

/**
 * Metadata for a content page, from what Marketing set on it.
 *
 * A custom search title is used as-is (`absolute`), because it was written to
 * be the whole title; the default one goes through the site's title template.
 * "Hide from search engines" keeps links followable -- the page is private to
 * search, not a dead end for crawlers.
 */
export function cmsMetadata(page: CmsPage, path: string): Metadata {
  const custom = page.metaTitle && page.metaTitle !== `${page.title} | VestraWAB` ? page.metaTitle : null;
  return {
    title: custom ? { absolute: custom } : page.title,
    description: page.metaDescription ?? undefined,
    alternates: { canonical: absoluteUrl(path) },
    robots: page.noindex ? { index: false, follow: true } : undefined,
    openGraph: page.heroImageUrl
      ? { images: [{ url: page.heroImageUrl.startsWith('/') ? absoluteUrl(page.heroImageUrl) : page.heroImageUrl }] }
      : undefined,
  };
}
