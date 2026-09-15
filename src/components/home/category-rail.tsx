import Link from 'next/link';

import { Picture } from '@/components/ui/picture';

import type { Category, HomeSection } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatCompactNumber } from '@/lib/format';
import { staggerIndex } from '@/lib/motion';

import { Section } from './section';

/**
 * Category rail.
 *
 * The reference puts these in 64px circles with the name underneath. Circles
 * are the wrong container for clothing — a circular crop of a kurta is a
 * circular crop of some fabric, and at 64px every tile in the row becomes the
 * same coloured disc. So: a portrait tile, big enough for the garment to be
 * recognisable, at the aspect ratio the photography was shot in.
 *
 * THE LABEL SITS BELOW THE IMAGE, not over it. Overlaid labels need a scrim,
 * and a scrim on a category tile darkens the one thing the tile exists to show.
 * Below the image the label is guaranteed 15:1 against the page ground, it can
 * be as long as the category name actually is, and the tiles read as a
 * catalogue rather than as a row of posters.
 *
 * The layout is a SCROLLING RAIL on a phone and a GRID above `sm`. Not a
 * wrapping grid at every width: six categories wrapping to two rows of three on
 * a phone pushes the first product rail below two full screens.
 */
export function CategoryRail({
  section,
  categories,
}: {
  section: HomeSection;
  categories: Category[];
}) {
  if (categories.length === 0) return null;

  return (
    <Section
      title={section.title}
      subtitle={section.subtitle}
      href={section.href}
      ctaLabel={section.ctaLabel ?? 'All categories'}
      flush
    >
      {/*
        Written as Tailwind utilities rather than the `.rail` helper, and that
        is not a style preference — it is a cascade bug that cost a layout.

        `.rail` sets `display: flex` from `@layer utilities` in `global.css`,
        which is emitted AFTER Tailwind's own utilities in the same layer. Same
        specificity, later wins — so `sm:grid` never applied and this row stayed
        a flex rail at every width, rendering twelve 80px tiles in a line on a
        desktop. A custom display utility and a responsive display utility
        cannot be combined on one element.
      */}
      <ul
        className={cn(
          // Phone: a rail that bleeds to both edges, with the gutter restored
          // as scroll padding so the first tile still lines up with the page.
          'no-scrollbar stagger gutter shell-max flex snap-x snap-mandatory gap-3 overflow-x-auto',
          // Tablet up: a plain grid. Nothing to scroll, so nothing scrolls.
          'sm:grid sm:grid-cols-4 sm:overflow-visible lg:grid-cols-6',
          section.page === 'categories' && 'grid grid-cols-2 overflow-visible',
        )}
        // No `scrollPaddingInline` here: `.gutter` now sets it alongside its
        // padding, responsively. An inline value would pin the snapport inset
        // at one breakpoint's gutter and misalign the rail at every other.
      >
        {categories.map((category, index) => (
          <li
            key={category.id}
            className={cn('w-32 shrink-0 snap-start sm:w-auto sm:shrink', section.page === 'categories' && 'w-auto')}
            style={staggerIndex(index)}
          >
            <Link href={`/category/${category.slug}`} className="group block">
              {/*
                The same well as a product card: 4:5, `rounded-xl`, and the
                inset hairline. A category tile sitting directly above a grid of
                product cards with a different radius and no edge is the kind of
                half-millimetre inconsistency nobody can name and everybody
                sees.
              */}
              {/*
                A shelf with no photograph is a shelf, not a hole.

                Categories are created by sellers now, and a new one inherits
                its parent's picture or has none at all -- which rendered a row
                of empty grey boxes and made the whole section look broken.
                `Picture` falls back to a monogram on a tint taken from the
                name, so the row always reads as a considered set of tiles.
              */}
              <Picture
                src={category.imageUrl}
                priority={section.page === 'categories' && section.position === 0 && index < 2}
                name={category.name}
                sizes="(max-width: 40rem) 8rem, (max-width: 64rem) 25vw, 16vw"
                className="aspect-4/5 rounded-xl ring-1 ring-inset ring-black/[0.07]"
                imageClassName={cn(
                  'transition-transform duration-(--duration-hero) ease-out',
                  'motion-safe:group-hover:scale-[1.06]',
                )}
              />

              <p className="text-ink mt-2.5 text-sm font-medium leading-tight group-hover:underline">
                {category.name}
              </p>
              {/* A count of nothing reads as a dead shelf; say nothing until there is one. */}
              {category.productCount > 0 ? (
                <p className="text-faint mt-0.5 text-2xs">
                  {formatCompactNumber(category.productCount)} styles
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
