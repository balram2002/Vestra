import type { Metadata } from 'next';
import Image from 'next/image';
import { Suspense } from 'react';

import { SectionToggle } from '@/components/console/admin-actions';
import {
  AdoptDefaultSlidesButton,
  BannerDialog,
  BannerToggle,
  DeleteBannerButton,
  MoveBannerButtons,
} from '@/components/console/banner-manager';
import { PageHeader } from '@/components/console/page-header';
import { DEFAULT_HERO_SLIDES } from '@/config/home';
import type { Banner } from '@/domain/types';
import { formatDateShort } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Homepage' };

/**
 * Homepage composition.
 *
 * The homepage is DATA, not code: the banners here are the hero and the tile
 * grid, and the section list is the actual render order of
 * `app/(storefront)/page.tsx`. Changing either changes the shop.
 */
export default function AdminCmsPage() {
  return (
    <>
      <PageHeader
        title="Homepage"
        description="The hero slides, the tile grid and the sections of the storefront homepage, in the order shoppers see them."
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <Composition />
      </Suspense>
    </>
  );
}

async function Composition() {
  await requirePermission('cms:write');

  const [sectionCol, bannerCol] = await Promise.all([
    collections.homeSections(),
    collections.banners(),
  ]);

  const [sections, banners] = await Promise.all([
    sectionCol.find({}).sort({ position: 1 }).toArray().then(toEntities),
    bannerCol.find({}).sort({ position: 1, createdAt: 1 }).toArray().then(toEntities),
  ]);

  const hero = banners.filter((banner) => banner.placement === 'HOME_HERO');
  const grid = banners.filter((banner) => banner.placement === 'HOME_GRID');
  const heroLive = hero.some((banner) => banner.isActive);

  return (
    <div className="mt-6 space-y-10">
      <BannerRow
        title="Hero slides"
        description="The carousel at the top of the homepage. Up to five live slides show, in this order."
        placement="HOME_HERO"
        banners={hero}
        emptyText="No hero slides of your own yet. Add one, or customise the default slides below."
      >
        {heroLive ? null : <DefaultSlides canAdopt={hero.length === 0} />}
      </BannerRow>

      <BannerRow
        title="Tile grid"
        description="The editorial tiles further down the homepage. The grid stays hidden until it has a live tile."
        placement="HOME_GRID"
        banners={grid}
        emptyText="No tiles yet. The grid stays hidden until you add one."
      />

      <section>
        <h2 className="text-ink text-md font-semibold">Sections</h2>
        <p className="text-muted mt-0.5 mb-3 text-xs">
          The homepage renders these top to bottom. A section with nothing to show, such as a
          product rail before any products are live, stays out of the way on its own.
        </p>

        <ol className="space-y-2">
          {sections.map((section, index) => (
            <li
              key={section.id}
              className="border-line bg-raised flex items-center gap-3 rounded-md border px-4 py-3"
            >
              <span className="text-faint tabular w-5 shrink-0 text-xs">{index + 1}</span>

              <div className="min-w-0 flex-1">
                <p className="text-ink truncate text-xs font-medium">{sectionName(section)}</p>
                <p className="text-faint truncate text-2xs">
                  {section.kind}
                  {section.config.source ? ` - ${section.config.source.toLowerCase()}` : ''}
                  {section.config.limit ? ` - ${section.config.limit} items` : ''}
                </p>
              </div>

              <SectionToggle
                sectionId={section.id}
                label={sectionName(section)}
                isActive={section.isActive}
              />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** A section's own title, or its kind as words: `HERO_CAROUSEL` reads "Hero carousel". */
function sectionName(section: { title?: string | null; kind: string }): string {
  if (section.title) return section.title;
  const words = section.kind.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function BannerRow({
  title,
  description,
  placement,
  banners,
  emptyText,
  children,
}: {
  title: string;
  description: string;
  placement: 'HOME_HERO' | 'HOME_GRID';
  banners: Banner[];
  emptyText: string;
  children?: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-ink text-md font-semibold">{title}</h2>
          <p className="text-muted mt-0.5 text-xs">{description}</p>
        </div>
        <BannerDialog placement={placement} />
      </div>

      {banners.length === 0 ? (
        <p className="border-line text-muted rounded-md border border-dashed px-4 py-6 text-sm">
          {emptyText}
        </p>
      ) : (
        <ol className="space-y-2">
          {banners.map((banner, index) => (
            <li
              key={banner.id}
              className="border-line bg-raised flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center"
            >
              <div className="bg-sunken relative aspect-video w-full shrink-0 overflow-hidden rounded sm:w-36">
                <Image
                  src={banner.imageUrl}
                  alt=""
                  fill
                  sizes="(max-width: 40rem) 90vw, 144px"
                  className="object-cover"
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-ink truncate text-sm font-medium">
                      {banner.headline ?? banner.name}
                    </p>
                    <p className="text-faint truncate text-2xs">
                      <span className="tabular">{index + 1}.</span> {banner.name} - links to{' '}
                      {banner.href}
                    </p>
                  </div>
                  <BannerToggle bannerId={banner.id} name={banner.name} isActive={banner.isActive} />
                </div>

                {banner.subheadline ? (
                  <p className="text-muted mt-1 line-clamp-2 text-xs">{banner.subheadline}</p>
                ) : null}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-faint text-2xs">Updated {formatDateShort(banner.updatedAt)}</p>
                  <div className="flex items-center gap-1">
                    <MoveBannerButtons
                      bannerId={banner.id}
                      name={banner.name}
                      first={index === 0}
                      last={index === banners.length - 1}
                    />
                    <BannerDialog banner={banner} />
                    <DeleteBannerButton bannerId={banner.id} name={banner.name} />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {children}
    </section>
  );
}

/**
 * The built-in slides the homepage falls back to.
 *
 * Shown whenever no hero slide of the shop's own is live, so an administrator
 * can see exactly what shoppers are looking at, and turn it into banners of
 * their own in one step.
 */
function DefaultSlides({ canAdopt }: { canAdopt: boolean }) {
  return (
    <div className="border-line mt-3 rounded-lg border border-dashed p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h3 className="text-ink text-sm font-semibold">The homepage is showing the default slides</h3>
          <p className="text-muted mt-0.5 text-xs">
            {canAdopt
              ? 'Until you have hero slides of your own, shoppers see these five. Customise them to change the pictures, words and links, or add a slide of your own above.'
              : 'Your hero slides are all hidden, so shoppers see these five instead. Set one of yours to Live, or hide the hero carousel section below to remove the hero altogether.'}
          </p>
        </div>
        {canAdopt ? <AdoptDefaultSlidesButton /> : null}
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {DEFAULT_HERO_SLIDES.map((slide) => (
          <li key={slide.id} className="min-w-0">
            <div className="bg-sunken relative aspect-video overflow-hidden rounded">
              <Image
                src={slide.imageUrl}
                alt=""
                fill
                sizes="(max-width: 40rem) 45vw, 180px"
                className="object-cover"
              />
            </div>
            <p className="text-ink mt-1 truncate text-2xs font-medium">{slide.headline}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
