import { Suspense } from 'react';

import { ProductRailSkeleton } from '@/components/skeletons/product-card-skeleton';
import type { HomeSection } from '@/domain/types';
import { cn } from '@/lib/cn';
import { getHeroSlides } from '@/server/services/content';
import {
  gridBanners,
  railProducts,
  spotlightSellers,
  stripBrands,
  stripCategories,
} from '@/server/services/section-items';
import { getSiteContent } from '@/server/services/site-content';

import { BannerGrid } from './banner-grid';
import { BrandStrip } from './brand-strip';
import { CategoryRail } from './category-rail';
import { Editorial } from './editorial';
import { HeroCarousel, HeroSkeleton } from './hero-carousel';
import { ProductRail } from './product-rail';
import { SellerSpotlight } from './seller-spotlight';
import { ValueProps } from './value-props';

/**
 * A page, as composed by an administrator.
 *
 * The homepage and every landing page render through here, so "add a rail,
 * move it above the categories, hand-pick eight products" behaves identically
 * wherever it is done. The renderer maps a `kind` to a component and nothing
 * else; what goes in each section is decided by `section-items`.
 *
 * EVERY SECTION IS ITS OWN SUSPENSE BOUNDARY, and that is what makes the page
 * feel fast rather than merely be fast: the hero is one query and appears
 * immediately, while a rail that sorts the whole catalogue streams in behind a
 * skeleton of its exact final height instead of holding up the fold.
 *
 * AN UNKNOWN KIND RENDERS NOTHING. The composition data can always be ahead of
 * the code -- a section added by a newer deploy must not crash an older one.
 */
export function PageSections({ sections }: { sections: HomeSection[] }) {
  /*
   * Which rail gets `priority`.
   *
   * Exactly one -- the first product rail on the page -- and it is computed
   * here rather than guessed inside the rail, because only the page knows what
   * came before it. A `priority` image is a preload hint; marking every rail's
   * first two cards would preload ten images and preload nothing usefully.
   */
  const firstRailId = sections.find((section) => section.kind === 'PRODUCT_RAIL')?.id;

  return (
    <div className="pb-8">
      {sections.map((section) => (
        <DeviceScope key={section.id} visibleOn={section.visibleOn}>
          <SectionRenderer section={section} priority={section.id === firstRailId} />
        </DeviceScope>
      ))}
    </div>
  );
}

/**
 * Sections limited to one device class.
 *
 * CSS rather than a user-agent check, deliberately: the page is cached and
 * served to everyone, so a server-side decision here would need a cache entry
 * per device class. The cost is that a hidden section is still fetched, which
 * is why this is for arranging a page -- not for keeping anything private.
 */
function DeviceScope({
  visibleOn,
  children,
}: {
  visibleOn: HomeSection['visibleOn'];
  children: React.ReactNode;
}) {
  if (visibleOn === 'ALL') return <>{children}</>;

  return (
    <div className={cn(visibleOn === 'MOBILE' ? 'lg:hidden' : 'hidden lg:block')}>{children}</div>
  );
}

function SectionRenderer({ section, priority }: { section: HomeSection; priority: boolean }) {
  switch (section.kind) {
    case 'HERO_CAROUSEL':
      return (
        <Suspense fallback={<HeroSkeleton />}>
          <HeroSection />
        </Suspense>
      );

    case 'CATEGORY_STRIP':
      return (
        <Suspense fallback={<StripSkeleton title={section.title} />}>
          <CategorySection section={section} />
        </Suspense>
      );

    case 'PRODUCT_RAIL':
    case 'DEAL_COUNTDOWN':
      return (
        <Suspense fallback={<RailSkeleton section={section} />}>
          <RailSection section={section} priority={priority} />
        </Suspense>
      );

    case 'BANNER_GRID':
      return (
        <Suspense fallback={<GridSkeleton />}>
          <GridSection section={section} />
        </Suspense>
      );

    case 'BRAND_STRIP':
      return (
        <Suspense fallback={<StripSkeleton title={section.title} />}>
          <BrandSection section={section} />
        </Suspense>
      );

    case 'SELLER_SPOTLIGHT':
      return (
        <Suspense fallback={<StripSkeleton title={section.title} />}>
          <SellerSection section={section} />
        </Suspense>
      );

    case 'VALUE_PROPS':
      return (
        <Suspense fallback={<PropsSkeleton />}>
          <PropsSection />
        </Suspense>
      );

    case 'EDITORIAL':
    case 'NEWSLETTER':
    case 'TESTIMONIALS':
      return <Editorial section={section} />;

    default:
      return null;
  }
}

/* ----------------------------------------------------------- data wrappers */

async function HeroSection() {
  return <HeroCarousel banners={await getHeroSlides()} />;
}

async function CategorySection({ section }: { section: HomeSection }) {
  return <CategoryRail section={section} categories={await stripCategories(section)} />;
}

async function RailSection({ section, priority }: { section: HomeSection; priority: boolean }) {
  return <ProductRail section={section} products={await railProducts(section)} priority={priority} />;
}

async function GridSection({ section }: { section: HomeSection }) {
  return <BannerGrid banners={await gridBanners(section)} />;
}

async function BrandSection({ section }: { section: HomeSection }) {
  return <BrandStrip section={section} brands={await stripBrands(section)} />;
}

async function SellerSection({ section }: { section: HomeSection }) {
  return <SellerSpotlight section={section} sellers={await spotlightSellers(section)} />;
}

async function PropsSection() {
  const content = await getSiteContent();
  return <ValueProps items={content.valueProps} />;
}

/* ---------------------------------------------------------------- skeletons */

/**
 * Placeholders carry the heading, because the heading is data the page already
 * has. Showing it immediately and streaming only the contents underneath is the
 * difference between "the page is loading" and "this rail is loading".
 */
function RailSkeleton({ section }: { section: HomeSection }) {
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

function StripSkeleton({ title }: { title: string | null }) {
  return (
    <section className="gutter shell-max py-12 sm:py-16" aria-hidden>
      {title ? <div className="skeleton mb-6 h-8 w-56 rounded-md" /> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="skeleton aspect-square rounded-xl" />
        ))}
      </div>
    </section>
  );
}

function GridSkeleton() {
  return (
    <section className="gutter shell-max py-12 sm:py-16" aria-hidden>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="skeleton aspect-4/5 rounded-2xl sm:aspect-3/4" />
        ))}
      </div>
    </section>
  );
}

function PropsSkeleton() {
  return (
    <section className="gutter shell-max py-12 sm:py-16" aria-hidden>
      <div className="border-line grid gap-8 rounded-2xl border p-7 sm:grid-cols-3 sm:gap-10 sm:p-10">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index}>
            <div className="skeleton size-11 rounded-full" />
            <div className="skeleton mt-4 h-5 w-40 rounded" />
            <div className="skeleton mt-2 h-12 w-full rounded" />
          </div>
        ))}
      </div>
    </section>
  );
}
