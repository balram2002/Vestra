import { Suspense } from 'react';

import {
  BannerGrid,
  BrandStrip,
  CategoryStrip,
  HeroCarousel,
  ProductRail,
  SellerSpotlight,
  ValueProps,
} from '@/components/home/sections';
import { ProductRailSkeleton } from '@/components/skeletons/product-card-skeleton';
import { CATALOG } from '@/config/business';
import type { HomeSection } from '@/domain/types';
import { getCategoryTree, listBrands, listSellers } from '@/server/services/catalog';
import { getBanners, getHomeSections } from '@/server/services/content';
import { getProductRail } from '@/server/services/listing';

/**
 * Home.
 *
 * The page renders whatever `homeSections` says, in the order it says. There is
 * no hardcoded arrangement here — reordering the page or swapping a rail's
 * source is a CMS edit, not a deploy.
 *
 * Each product rail is its own `<Suspense>` boundary. That is deliberate: the
 * hero and category strip are cheap and appear immediately, while a rail that
 * needs a sort over the whole catalogue streams in behind its own skeleton
 * instead of holding up the fold.
 */
export default async function HomePage() {
  const sections = await getHomeSections();

  return (
    <div className="pb-4">
      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </div>
  );
}

function SectionRenderer({ section }: { section: HomeSection }) {
  switch (section.kind) {
    case 'HERO_CAROUSEL':
      return (
        <Suspense fallback={<HeroSkeleton />}>
          <HeroSection />
        </Suspense>
      );

    case 'CATEGORY_STRIP':
      return (
        <Suspense fallback={null}>
          <CategorySection section={section} />
        </Suspense>
      );

    case 'PRODUCT_RAIL':
      return (
        <Suspense fallback={<RailFallback section={section} />}>
          <RailSection section={section} />
        </Suspense>
      );

    case 'BANNER_GRID':
      return (
        <Suspense fallback={null}>
          <GridSection />
        </Suspense>
      );

    case 'BRAND_STRIP':
      return (
        <Suspense fallback={null}>
          <BrandSection section={section} />
        </Suspense>
      );

    case 'SELLER_SPOTLIGHT':
      return (
        <Suspense fallback={null}>
          <SellerSection section={section} />
        </Suspense>
      );

    case 'VALUE_PROPS':
      return <ValueProps />;

    default:
      // An unknown or not-yet-implemented section kind renders nothing rather
      // than crashing the page: the CMS can always be ahead of the renderer.
      return null;
  }
}

/* --------------------------------------------------------- data wrappers */

async function HeroSection() {
  const banners = await getBanners('HOME_HERO');
  return <HeroCarousel banners={banners} />;
}

async function CategorySection({ section }: { section: HomeSection }) {
  const all = await getCategoryTree();
  // Shelf level: departments are too coarse to browse from, leaves too many.
  const shelves = all.filter((c) => c.depth === 1).slice(0, section.config.limit ?? 12);
  return <CategoryStrip section={section} categories={shelves} />;
}

async function RailSection({ section }: { section: HomeSection }) {
  const source = section.config.source ?? 'BESTSELLERS';
  const supported =
    source === 'NEW_ARRIVALS' || source === 'BESTSELLERS' || source === 'TRENDING' || source === 'DEALS'
      ? source
      : 'BESTSELLERS';

  const products = await getProductRail(supported, section.config.limit ?? CATALOG.railSize);
  return <ProductRail section={section} products={products} />;
}

async function GridSection() {
  const banners = await getBanners('HOME_GRID');
  return <BannerGrid banners={banners} />;
}

async function BrandSection({ section }: { section: HomeSection }) {
  const brands = await listBrands(section.config.limit ?? 12);
  return <BrandStrip section={section} brands={brands} />;
}

async function SellerSection({ section }: { section: HomeSection }) {
  const sellers = await listSellers(section.config.limit ?? 4);
  return <SellerSpotlight section={section} sellers={sellers.slice(0, section.config.limit ?? 4)} />;
}

/* ------------------------------------------------------------- fallbacks */

function HeroSkeleton() {
  return (
    <section className="gutter shell-max pt-4" aria-hidden>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="skeleton aspect-[16/10] rounded-lg lg:col-span-2 lg:aspect-[16/9]" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="skeleton aspect-[16/9] rounded-lg lg:aspect-[16/7]" />
          <div className="skeleton aspect-[16/9] rounded-lg lg:aspect-[16/7]" />
        </div>
      </div>
    </section>
  );
}

function RailFallback({ section }: { section: HomeSection }) {
  return (
    <section className="gutter shell-max py-8">
      <div className="mb-4">
        <h2 className="font-display text-ink text-xl sm:text-2xl">{section.title}</h2>
        {section.subtitle ? <p className="text-muted mt-0.5 text-sm">{section.subtitle}</p> : null}
      </div>
      <ProductRailSkeleton />
    </section>
  );
}
