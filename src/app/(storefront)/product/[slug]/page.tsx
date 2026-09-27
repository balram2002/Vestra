import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';

import { atLeastOne, PLACEHOLDER_SLUG } from '@/lib/static-params';
import { ProductPageView } from '@/components/product/product-page-view';
import { absoluteUrl } from '@/config/site';
import type { ProductPageSettings, ProductPageVariant } from '@/domain/page-designs/product';
import {
  getBrandById,
  getCategoryAncestors,
  getProductBySlug,
  getSellerById,
  getTopProductSlugs,
} from '@/server/services/catalog';
import { resolveVariant } from '@/domain/page-designs/config';
import { getRunningExperiment } from '@/server/services/experiments';
import { getLiveDesign } from '@/server/services/page-designs';
import { ExperimentArm } from '@/components/experiments/experiment-arm';
import { PageSkeleton } from '@/components/skeletons/page-skeleton';

/**
 * Product detail.
 *
 * The commercial heart of the shop, and the page where the caching model earns
 * its keep. The shell — imagery, copy, price, specifications — is prerendered
 * and tagged `product:<id>`, so a price change expires exactly this page and
 * the grids it appears in, nothing else. Reviews and recommendations stream in
 * behind their own boundaries so neither can delay the fold.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Prerender the best-selling slice at build time. The long tail renders on
 * first request and is cached from then on, which keeps builds short without
 * costing the pages people actually visit.
 */
export async function generateStaticParams() {
  return atLeastOne(async () => (await getTopProductSlugs(120)).map((slug) => ({ slug })), {
    slug: PLACEHOLDER_SLUG,
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};

  const url = absoluteUrl(`/product/${product.slug}`);

  return {
    title: product.metaTitle ?? product.title,
    description: product.metaDescription ?? product.description.slice(0, 155),
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      title: product.title,
      description: product.metaDescription ?? product.description.slice(0, 200),
      url,
      images: product.media.slice(0, 3).map((m) => ({
        url: absoluteUrl(m.url),
        width: m.width,
        height: m.height,
        alt: m.alt,
      })),
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const [product, design] = await Promise.all([getProductBySlug(slug), getLiveDesign('product')]);

  if (!product) notFound();

  // Resolved via `slugHistory`: the canonical URL moved, so redirect rather
  // than serving the same product on two addresses.
  if (product.slug !== slug) permanentRedirect(`/product/${product.slug}`);

  const [ancestors, brand, seller] = await Promise.all([
    getCategoryAncestors(product.categoryPath.at(-1) ?? ''),
    getBrandById(product.brandId),
    getSellerById(product.sellerId),
  ]);

  // Which layout, and which of its parts, is decided under Admin › Marketing › Product page --
  // including any category that has a layout of its own.
  const variant = resolveVariant(design, { categoryPath: product.categoryPath });
  const view = (layout: string) => (
    <ProductPageView
      product={product}
      brand={brand}
      seller={seller}
      ancestors={ancestors}
      variant={layout as ProductPageVariant}
      settings={design.settings[layout] as ProductPageSettings}
    />
  );

  // Under an A/B test the layout is chosen per visitor; a category with a
  // layout of its own stays out of the test.
  const experiment = variant === design.variant ? await getRunningExperiment('product') : null;
  if (experiment) {
    return (
      <Suspense fallback={<PageSkeleton shape="detail" />}>
        <ExperimentArm experiment={experiment}>{view}</ExperimentArm>
      </Suspense>
    );
  }
  return view(variant);
}
