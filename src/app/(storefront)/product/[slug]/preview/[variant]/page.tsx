import { Eye } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { ProductPageView } from '@/components/product/product-page-view';
import {
  PRODUCT_PAGE_VARIANTS,
  productPageDesign,
  type ProductPageSettings,
  type ProductPageVariant,
} from '@/domain/page-designs/product';
import { getBrandById, getCategoryAncestors, getProductBySlug, getSellerById } from '@/server/services/catalog';
import { getPreviewDesign } from '@/server/services/page-designs';

export const metadata: Metadata = {
  title: 'Product page preview',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ slug: string; variant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * One product in one layout, with the DRAFT settings -- or the live ones when
 * nothing is drafted. What the Product page designer frames. Staff only:
 * `getPreviewDesign` asserts it.
 */
export default function ProductPagePreview({ params, searchParams }: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="gutter shell-max py-5">
          <div className="skeleton h-[32rem] rounded-3xl" />
        </div>
      }
    >
      <Preview params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Preview({ params, searchParams }: PageProps) {
  const [{ slug, variant: raw }, query, design] = await Promise.all([params, searchParams, getPreviewDesign('product')]);
  if (!PRODUCT_PAGE_VARIANTS.includes(raw as ProductPageVariant)) notFound();
  const variant = raw as ProductPageVariant;

  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const [ancestors, brand, seller] = await Promise.all([
    getCategoryAncestors(product.categoryPath.at(-1) ?? ''),
    getBrandById(product.brandId),
    getSellerById(product.sellerId),
  ]);

  const meta = productPageDesign.variantMeta[variant];

  return (
    <ProductPageView
      product={product}
      brand={brand}
      seller={seller}
      ancestors={ancestors}
      variant={variant}
      settings={design.settings[variant] as ProductPageSettings}
      banner={
        <div className="bg-inverse text-on-inverse mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-xs">
          <span className="inline-flex items-center gap-2">
            <Eye className="size-4" aria-hidden />
            Preview · Variant {meta.number} · {meta.name}
            {design.variant === variant ? '' : ' (not the layout in use)'}
          </span>
          {query.embed === '1' ? null : (
            <Link href="/admin/design/product" className="font-semibold underline underline-offset-2">
              Back to the editor
            </Link>
          )}
        </div>
      }
    />
  );
}
