import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';

import { atLeastOne, PLACEHOLDER_SLUG } from '@/lib/static-params';
import { absoluteUrl } from '@/config/site';
import { isIndexableListing, parseProductQuery, type RawSearchParams } from '@/lib/product-query';
import type { BrandPageSettings, BrandPageVariant } from '@/domain/page-designs/brand';
import { getBrandBySlug, listBrands } from '@/server/services/catalog';
import { getLiveDesign } from '@/server/services/page-designs';

import { ExperimentArm } from '@/components/experiments/experiment-arm';
import { PageSkeleton } from '@/components/skeletons/page-skeleton';
import { getRunningExperiment } from '@/server/services/experiments';
import { BrandFrame } from './brand-frame';

/**
 * Brand page.
 *
 * Structurally the same as a category listing — same filters, same sort, same
 * pagination — because it is the same question asked with a different filter.
 * Sharing `listProducts` is what keeps the two from drifting apart.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

export async function generateStaticParams() {
  return atLeastOne(async () => (await listBrands(100)).map((brand) => ({ slug: brand.slug })), {
    slug: PLACEHOLDER_SLUG,
  });
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) return {};

  const query = parseProductQuery(await searchParams, { brandSlugs: [slug] });

  return {
    title: brand.metaTitle ?? `${brand.name} — Shop Online`,
    description: brand.metaDescription ?? brand.description.slice(0, 155),
    alternates: { canonical: absoluteUrl(`/brand/${brand.slug}`) },
    robots: isIndexableListing(query) ? undefined : { index: false, follow: true },
  };
}

export default async function BrandPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);

  if (!brand) notFound();
  if (brand.slug !== slug) permanentRedirect(`/brand/${brand.slug}`);

  // Which layout, and which of its parts, is decided under
  // Admin › Page designs › Brand page. Cached, so the shell still prerenders.
  const [design, experiment] = await Promise.all([getLiveDesign('brand'), getRunningExperiment('brand')]);
  const view = (layout: string) => (
    <BrandFrame brand={brand} variant={layout as BrandPageVariant} settings={design.settings[layout] as BrandPageSettings} searchParams={searchParams} />
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
