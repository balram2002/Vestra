import { Suspense } from 'react';

import { CategoryPageView, categoryTiles } from '@/components/commerce/category-page-view';
import { ListingView } from '@/components/commerce/listing-view';
import { JsonLd } from '@/components/seo/json-ld';
import { ProductGridSkeleton } from '@/components/skeletons/product-card-skeleton';
import { absoluteUrl } from '@/config/site';
import type { CategoryPageSettings, CategoryPageVariant } from '@/domain/page-designs/category';
import type { Category } from '@/domain/types';
import { parseProductQuery, type RawSearchParams } from '@/lib/product-query';
import { breadcrumbListJsonLd, itemListJsonLd } from '@/lib/seo/structured-data';
import { getCategoryAncestors, getCategoryTree } from '@/server/services/catalog';
import { getProductRail, listProducts } from '@/server/services/listing';

/**
 * Everything around the listing, shared by the live page and the staff
 * preview so the two can never drift.
 */
export async function CategoryFrame({
  category,
  variant,
  settings,
  searchParams,
  basePath = `/category/${category.slug}`,
  banner,
}: {
  category: Category;
  variant: CategoryPageVariant;
  settings: CategoryPageSettings;
  searchParams: Promise<RawSearchParams>;
  /** Where filter, sort and page links point: the preview keeps them inside the preview. */
  basePath?: string;
  banner?: React.ReactNode;
}) {
  const [ancestors, tree, topPicks] = await Promise.all([
    getCategoryAncestors(category.slug),
    getCategoryTree(),
    settings.topPicks ? getProductRail('BESTSELLERS', 12, category.slug) : Promise.resolve([]),
  ]);
  const subcategories = tree.filter((item) => item.parentId === category.id);

  return (
    <>
      <JsonLd
        data={breadcrumbListJsonLd([
          { name: 'Home', url: absoluteUrl('/') },
          ...ancestors.map((c) => ({
            name: c.name,
            url: absoluteUrl(`/category/${c.slug}`),
          })),
        ])}
      />
      <CategoryPageView
        category={category}
        ancestors={ancestors}
        subcategories={subcategories}
        topPicks={topPicks}
        variant={variant}
        settings={settings}
        banner={banner}
        listing={
          <div id="listing" className="scroll-mt-(--app-sticky-offset)">
            <Suspense fallback={<ListingSkeleton />}>
              <CategoryListing category={category} variant={variant} settings={settings} searchParams={searchParams} basePath={basePath} />
            </Suspense>
          </div>
        }
      />
    </>
  );
}

/** The dynamic half: everything that depends on the query string. */
async function CategoryListing({
  category,
  variant,
  settings,
  searchParams,
  basePath,
}: {
  category: Category;
  variant: CategoryPageVariant;
  settings: CategoryPageSettings;
  searchParams: Promise<RawSearchParams>;
  basePath: string;
}) {
  const raw = await searchParams;
  const query = parseProductQuery(raw, { categorySlug: category.slug });
  const result = await listProducts(query);

  return (
    <>
      <JsonLd
        data={itemListJsonLd(
          result.items.map((item) => ({
            name: item.title,
            url: absoluteUrl(`/product/${item.slug}`),
          })),
        )}
      />

      {/*
        The entire listing arrangement — sticky mobile bar, docked rail, applied
        chips, toolbar, grid, pagination — lives in `ListingView` and is shared
        with search, brand and store. The layout only chooses among its options.
      */}
      <ListingView
        result={result}
        params={raw}
        basePath={basePath}
        sort={query.sort ?? 'popularity'}
        rail={variant !== 'wall' && settings.filterRail}
        quickFilters={settings.quickFilters}
        tiles={settings.promoTiles ? categoryTiles(basePath, category.name) : undefined}
        display={variant === 'wall' ? { wall: settings.wallDensity === 'dense' ? 'dense' : 'airy', quickView: settings.quickView } : 'grid'}
      />
    </>
  );
}

function ListingSkeleton() {
  return (
    <div className="mt-5 flex gap-8">
      <div className="hidden w-60 shrink-0 space-y-4 lg:block" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className="skeleton h-4 w-24 rounded-xs" />
            <div className="skeleton h-3 w-full rounded-xs" />
            <div className="skeleton h-3 w-5/6 rounded-xs" />
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="skeleton h-8 w-full rounded-sm" aria-hidden />
        <ProductGridSkeleton className="mt-5" count={15} />
      </div>
    </div>
  );
}
