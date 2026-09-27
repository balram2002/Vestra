import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';

import { atLeastOne, PLACEHOLDER_SLUG } from '@/lib/static-params';
import { absoluteUrl } from '@/config/site';
import { isIndexableListing, parseProductQuery, type RawSearchParams } from '@/lib/product-query';
import { ExperimentArm } from '@/components/experiments/experiment-arm';
import { PageSkeleton } from '@/components/skeletons/page-skeleton';
import { getRunningExperiment } from '@/server/services/experiments';
import { CategoryFrame } from './category-frame';
import { getCategoryBySlug, getCategoryTree } from '@/server/services/catalog';
import { getLiveDesign } from '@/server/services/page-designs';
import type { CategoryPageSettings, CategoryPageVariant } from '@/domain/page-designs/category';

/**
 * Category listing.
 *
 * The page splits into a cached shell and a dynamic grid on purpose:
 *
 *  - the breadcrumb, heading and SEO copy come from the category document and
 *    prerender, so the page paints immediately with real content;
 *  - the grid depends on `searchParams` (filters, sort, page), which is request
 *    state, so it sits behind `<Suspense>` and streams.
 *
 * That is why `searchParams` is awaited INSIDE the suspended child rather than
 * at the top: awaiting it in the page body would make the whole route dynamic
 * and throw away the static shell.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

/**
 * The taxonomy is a small fixed set, so every category page is prerendered.
 * Without this the route has no known params at build time and its shell
 * cannot be prerendered at all.
 */
export async function generateStaticParams() {
  return atLeastOne(
    async () => (await getCategoryTree()).map((category) => ({ slug: category.slug })),
    { slug: PLACEHOLDER_SLUG },
  );
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return {};

  const raw = await searchParams;
  const query = parseProductQuery(raw, { categorySlug: slug });
  const indexable = isIndexableListing(query);
  const page = query.page ?? 1;

  const title = category.metaTitle ?? `${category.name} — Buy ${category.name} Online`;

  return {
    title: page > 1 ? `${title} — Page ${page}` : title,
    description: category.metaDescription ?? category.description,
    alternates: {
      // Filtered and sorted variants all canonicalise to the clean category
      // URL, so their ranking signals consolidate rather than compete.
      canonical: absoluteUrl(`/category/${category.slug}`),
    },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: {
      title,
      description: category.description,
      url: absoluteUrl(`/category/${category.slug}`),
      /*
       * No `images` here on purpose.
       *
       * Setting it would override the generated card in `opengraph-image.tsx`,
       * and the banner is the weaker choice: it is a wide lifestyle crop that
       * loses its subject at 1200×630, it is often shared across a whole
       * department, and it carries no text — so a shared link would not say
       * which category it was.
       */
    },
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) notFound();

  // The slug resolved through history, so the canonical URL has moved. A 301
  // keeps inbound links and old sitemap entries working.
  if (category.slug !== slug) {
    permanentRedirect(`/category/${category.slug}`);
  }

  // Which layout, and which of its parts, is decided under
  // Admin › Page designs › Category page. Cached, so the shell still prerenders.
  const [design, experiment] = await Promise.all([getLiveDesign('category'), getRunningExperiment('category')]);
  const view = (layout: string) => (
    <CategoryFrame
      category={category}
      variant={layout as CategoryPageVariant}
      settings={design.settings[layout] as CategoryPageSettings}
      searchParams={searchParams}
    />
  );

  // Under an A/B test the layout is chosen per visitor.
  if (experiment) {
    return (
      <Suspense fallback={<PageSkeleton shape="listing" />}>
        <ExperimentArm experiment={experiment}>{view}</ExperimentArm>
      </Suspense>
    );
  }
  return view(design.variant);
}
