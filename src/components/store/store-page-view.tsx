import { Suspense } from 'react';

import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { StoreProfile } from '@/components/commerce/store-profile';
import { ProductGridSkeleton } from '@/components/skeletons/product-card-skeleton';
import type { StorePageSettings, StorePageVariant } from '@/domain/store-page';
import type { Seller } from '@/domain/types';
import type { RawSearchParams } from '@/lib/product-query';

import { SpotlightHeader } from './spotlight-header';
import { StoreProducts } from './store-products';
import { StudioHeader } from './studio-header';

/**
 * The store page body, for whichever layout is live.
 *
 * Shared by the public page and by the preview Marketing opens from the
 * editor, so a preview is the real page rather than a sketch of it.
 */
export function StorePageView({
  seller,
  variant,
  settings,
  searchParams,
  basePath,
  banner,
}: {
  seller: Seller;
  variant: StorePageVariant;
  settings: StorePageSettings;
  searchParams: Promise<RawSearchParams>;
  basePath: string;
  /** Rendered above everything; the preview uses it to say what it is. */
  banner?: React.ReactNode;
}) {
  return (
    <div className="gutter shell-max py-5">
      {banner}

      {settings.breadcrumbs ? (
        <Breadcrumbs
          items={[
            { href: '/', label: 'Home' },
            { href: '/stores', label: 'Sellers' },
            { href: `/store/${seller.slug}`, label: seller.displayName },
          ]}
        />
      ) : null}

      {variant === 'spotlight' ? (
        <SpotlightHeader seller={seller} settings={settings} />
      ) : variant === 'studio' ? (
        <StudioHeader seller={seller} settings={settings} />
      ) : (
        <StoreProfile seller={seller} settings={settings} />
      )}

      {settings.products ? (
        <Suspense fallback={<ProductGridSkeleton className="mt-6" count={15} />}>
          <StoreProducts
            slug={seller.slug}
            basePath={basePath}
            searchParams={searchParams}
            settings={settings}
            variant={variant}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
