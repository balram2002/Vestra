import { Suspense } from 'react';

import {
  BannerGrid,
  BrandStrip,
  CategoryRail,
  HeroCarousel,
  HeroSkeleton,
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
 * Each section is its own `<Suspense>` boundary, and that is what makes the
 * page feel fast rather than merely be fast: the hero is one query and appears
 * immediately, while a rail that needs a sort over the whole catalogue streams
 * in behind a skeleton of its exact final height instead of holding up the
 * fold.
 */
export default async function HomePage() {
  const sections = await getHomeSections();

  /*
   * Which rail gets `priority`.
   *
   * Exactly one — the first product rail on the page — and it is computed here
   * rather than guessed inside the rail, because only the page knows what came
   * before it. A `priority` image is a preload hint; marking every rail's first
   * two cards would preload ten images and preload nothing usefully.
   */
  const firstRailId = sections.find((section) => section.kind === 'PRODUCT_RAIL')?.id;

  return (
    <div className="pb-8">
      {sections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          priority={section.id === firstRailId}
        />
      ))}
    </div>
  );
}

function SectionRenderer({
  section,
  priority,
}: {
  section: HomeSection;
  priority: boolean;
}) {
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
          <RailSection section={section} priority={priority} />
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

/* ----------------------------------------------------------- data wrappers */

async function HeroSection() {
  const banners = await getBanners('HOME_HERO');
  return <HeroCarousel banners={banners} />;
}

async function CategorySection({ section }: { section: HomeSection }) {
  const all = await getCategoryTree();
  // Shelf level: departments are too coarse to browse from, leaves too many.
  const shelves = all.filter((c) => c.depth === 1).slice(0, section.config.limit ?? 12);
  return <CategoryRail section={section} categories={shelves} />;
}

async function RailSection({
  section,
  priority,
}: {
  section: HomeSection;
  priority: boolean;
}) {
  const source = section.config.source ?? 'BESTSELLERS';
  const supported =
    source === 'NEW_ARRIVALS' ||
    source === 'BESTSELLERS' ||
    source === 'TRENDING' ||
    source === 'DEALS'
      ? source
      : 'BESTSELLERS';

  const products = await getProductRail(supported, section.config.limit ?? CATALOG.railSize);
  return <ProductRail section={section} products={products} priority={priority} />;
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
  const limit = section.config.limit ?? 4;
  const sellers = await listSellers(limit);
  return <SellerSpotlight section={section} sellers={sellers.slice(0, limit)} />;
}

/* ---------------------------------------------------------------- fallbacks */

/**
 * A rail's placeholder.
 *
 * Carries the real heading, because the heading is data the page already has —
 * showing it immediately and streaming only the products underneath is the
 * difference between "the page is loading" and "this rail is loading".
 */
function RailFallback({ section }: { section: HomeSection }) {
  return (
    <section className="gutter shell-max py-12 sm:py-16">
      <div className="mb-5 sm:mb-7">
        <h2 className="headline text-ink text-2xl sm:text-3xl">{section.title}</h2>
        {section.subtitle ? <p className="text-muted mt-2 text-sm">{section.subtitle}</p> : null}
      </div>
      <ProductRailSkeleton />
    </section>
  );
}
