import { Suspense } from 'react';

import { BrandPageView } from '@/components/commerce/brand-page-view';
import { ListingView } from '@/components/commerce/listing-view';
import { JsonLd } from '@/components/seo/json-ld';
import { ProductGridSkeleton } from '@/components/skeletons/product-card-skeleton';
import { absoluteUrl } from '@/config/site';
import type { BrandPageSettings, BrandPageVariant } from '@/domain/page-designs/brand';
import type { Brand } from '@/domain/types';
import { parseProductQuery, type RawSearchParams } from '@/lib/product-query';
import { breadcrumbListJsonLd } from '@/lib/seo/structured-data';
import { getBrandContext } from '@/server/services/brand-page';
import { getProductRail, listProducts } from '@/server/services/listing';

/**
 * Everything around the brand's listing, shared by the live page and the
 * staff preview so the two can never drift.
 */
export async function BrandFrame({
  brand,
  variant,
  settings,
  searchParams,
  basePath = `/brand/${brand.slug}`,
  banner,
}: {
  brand: Brand;
  variant: BrandPageVariant;
  settings: BrandPageSettings;
  searchParams: Promise<RawSearchParams>;
  /** Where filter, sort and page links point: the preview keeps them inside the preview. */
  basePath?: string;
  banner?: React.ReactNode;
}) {
  const [context, newArrivals] = await Promise.all([
    getBrandContext(brand),
    settings.newArrivals ? getProductRail('NEW_ARRIVALS', 12, undefined, brand.id) : Promise.resolve([]),
  ]);

  return (
    <>
      <JsonLd
        data={breadcrumbListJsonLd([
          { name: 'Home', url: absoluteUrl('/') },
          { name: 'Brands', url: absoluteUrl('/brands') },
          { name: brand.name, url: absoluteUrl(`/brand/${brand.slug}`) },
        ])}
      />
      <BrandPageView
        brand={brand}
        categories={context.categories}
        similar={context.similar}
        newArrivals={newArrivals}
        variant={variant}
        settings={settings}
        banner={banner}
        listing={
          <div id="listing" className="scroll-mt-(--app-sticky-offset)">
            <Suspense fallback={<ProductGridSkeleton className="mt-6" count={15} />}>
              <BrandListing slug={brand.slug} settings={settings} searchParams={searchParams} basePath={basePath} />
            </Suspense>
          </div>
        }
      />
    </>
  );
}

async function BrandListing({
  slug,
  settings,
  searchParams,
  basePath,
}: {
  slug: string;
  settings: BrandPageSettings;
  searchParams: Promise<RawSearchParams>;
  basePath: string;
}) {
  const raw = await searchParams;
  const query = parseProductQuery(raw, { brandSlugs: [slug] });
  const result = await listProducts(query);

  /*
   * The brand facet is dropped, not hidden.
   *
   * Every product on this page is already this brand, so a brand filter would
   * be a list of one option that changes nothing — and on a page reached from
   * a brand link it reads as a bug. Filtering the facet out of the result is
   * cleaner than teaching the rail about context it should not know.
   *
   * For the same reason the brand is not counted as an applied filter: the
   * page's own scope is not something the shopper chose, and "Clear all (1)"
   * on an unfiltered page -- a button that clears nothing -- read as a bug.
   */
  const scoped = {
    ...result,
    facets: result.facets.filter((f) => f.key !== 'brand'),
    appliedFilterCount: Math.max(0, result.appliedFilterCount - 1),
  };

  return (
    <ListingView
      result={scoped}
      params={raw}
      basePath={basePath}
      sort={query.sort ?? 'popularity'}
      rail={settings.filterRail}
      quickFilters={settings.quickFilters}
      density={settings.density === 'compact' ? 'compact' : 'standard'}
      className="mt-6"
    />
  );
}
