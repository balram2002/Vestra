import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { Reveal } from '@/components/ui/reveal';
import type { Banner } from '@/domain/types';
import { cn } from '@/lib/cn';

/**
 * Editorial banner grid.
 *
 * Deliberately ASYMMETRIC. Four equal tiles is a grid of four equal things and
 * reads as a category picker; a large panel beside a stack of smaller ones
 * reads as an editorial page with a lead story — which is what these banners
 * are, and it is the single cheapest way to make a home page look art-directed
 * rather than generated.
 *
 * The asymmetry is expressed as a `grid-cols-6` with the first child spanning
 * four columns and two rows. That collapses cleanly: at `sm` it becomes two
 * columns of equal tiles, and on a phone a single column. No second layout, no
 * duplicated markup, no banner that is only visible on a desktop.
 *
 * With fewer than three banners the asymmetry has nothing to work with, so it
 * falls back to an even grid rather than rendering one enormous panel and a
 * gap.
 */
export function BannerGrid({ banners }: { banners: Banner[] }) {
  const shown = banners.slice(0, 5);
  if (shown.length === 0) return null;

  const featured = shown.length >= 3;

  return (
    <Reveal as="section" className="gutter shell-max py-12 sm:py-16">
      <div
        className={cn(
          'grid gap-3 sm:grid-cols-2',
          featured && 'lg:grid-cols-6 lg:grid-rows-2',
        )}
      >
        {shown.map((banner, index) => (
          <BannerTile
            key={banner.id}
            banner={banner}
            large={featured && index === 0}
            className={
              featured
                ? index === 0
                  ? 'lg:col-span-4 lg:row-span-2'
                  : 'lg:col-span-2'
                : undefined
            }
          />
        ))}
      </div>
    </Reveal>
  );
}

function BannerTile({
  banner,
  large,
  className,
}: {
  banner: Banner;
  large: boolean;
  className?: string;
}) {
  return (
    <Link
      href={banner.href}
      className={cn(
        'group relative isolate flex flex-col justify-end overflow-hidden rounded-xl',
        // The large panel is a portrait poster; the small ones are landscape
        // strips. Same component, different proportion — which is what stops
        // the stack of small tiles from being three more posters.
        large ? 'aspect-4/5 lg:aspect-auto' : 'aspect-16/9 lg:aspect-16/7',
        'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
        className,
      )}
    >
      <Image
        src={banner.imageUrl}
        alt={banner.alt}
        fill
        loading="lazy"
        sizes={
          large
            ? '(max-width: 40rem) 100vw, (max-width: 64rem) 50vw, 60vw'
            : '(max-width: 40rem) 100vw, (max-width: 64rem) 50vw, 30vw'
        }
        className={cn(
          'object-cover transition-transform duration-(--duration-hero) ease-out',
          'motion-safe:group-hover:scale-[1.05]',
        )}
      />

      <div aria-hidden className="scrim absolute inset-0" />

      {/*
        The same inset hairline every other image well in the shop carries.

        These banners are photographed on pale studio grounds as often as not,
        and without an edge a light banner dissolves into the page exactly the
        way a white-on-white product card does.
      */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10"
      />

      <div className={cn('relative', large ? 'p-6 sm:p-8' : 'p-5')}>
        <h3
          className={cn(
            'headline text-balance text-white',
            large ? 'text-2xl sm:text-3xl' : 'text-lg',
          )}
        >
          {banner.headline}
        </h3>

        {banner.subheadline ? (
          <p
            className={cn(
              'mt-2 max-w-sm text-pretty text-white/75',
              large ? 'text-sm' : 'text-xs',
            )}
          >
            {banner.subheadline}
          </p>
        ) : null}

        {/*
          The arrow TRANSLATES; the gap does not animate.

          `transition-[gap]` was the obvious way to write this and it is a
          layout property — every frame of the hover reflows the tile, and on a
          grid of five that is five reflows a frame for a decorative nudge.
          Moving the glyph on `transform` composites and looks identical.
        */}
        <span
          className={cn(
            'mt-4 inline-flex items-center gap-1.5 border-b border-white/40 pb-1',
            'font-medium text-white transition-colors group-hover:border-white',
            large ? 'text-sm' : 'text-xs',
          )}
        >
          {banner.ctaLabel ?? 'Shop now'}
          <ArrowRight
            className={cn(
              'transition-transform duration-(--duration-base) ease-(--ease-out)',
              'motion-safe:group-hover:translate-x-1',
              large ? 'size-4' : 'size-3.5',
            )}
            aria-hidden
          />
        </span>
      </div>
    </Link>
  );
}
