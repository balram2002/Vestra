import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import type { Brand, HomeSection } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatCompactNumber } from '@/lib/format';
import { staggerIndex } from '@/lib/motion';

import { Section } from './section';

/**
 * Brand strip.
 *
 * Every brand here has a name and no logo — the seed data carries no brand
 * marks and inventing them would be inventing a fact about a business. So the
 * NAME is the mark: set in the display face, large, tightly tracked, on its own
 * card. That is a legitimate typographic treatment rather than a placeholder,
 * and it is what a label directory in a print magazine does.
 *
 * The card lifts on hover instead of shrinking on press, because it is large:
 * a scale on something this size reads as the whole page flinching, while a
 * lift reads as "this one is pickable".
 *
 * Premium labels carry a `premium` badge, drawn from the `sand` ramp. That is
 * the only place sand appears on the home page, which is precisely what keeps
 * it meaning something — see the note on the ramp in `tokens.css`.
 */
export function BrandStrip({
  section,
  brands,
}: {
  section: HomeSection;
  brands: Brand[];
}) {
  if (brands.length === 0) return null;

  return (
    <Section
      title={section.title}
      subtitle={section.subtitle}
      href={section.href}
      ctaLabel="All labels"
    >
      <ul className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {brands.map((brand, index) => (
          <li key={brand.id} style={staggerIndex(index)}>
            <Link
              href={`/brand/${brand.slug}`}
              className={cn(
                'border-line bg-raised group relative flex h-full flex-col justify-between',
                'gap-4 rounded-xl border p-4 text-center sm:p-5',
                /*
                 * `lift` rather than a hand-rolled `hover:shadow-md`.
                 *
                 * `box-shadow` is not a compositable property, so animating it
                 * re-rasterises the card on every frame of the hover. The
                 * utility parks the larger shadow on a pseudo-element at zero
                 * opacity and cross-fades that instead, which the compositor
                 * does for free — and it carries the 3px travel, so the
                 * translate does not need restating here.
                 */
                'lift transition-[border-color] duration-(--duration-base) ease-(--ease-out)',
                'hover:border-line-strong',
                'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
              )}
            >
              {brand.isPremium ? (
                <Badge tone="premium" size="sm" pill className="absolute right-2 top-2">
                  Premium
                </Badge>
              ) : null}

              <span className="font-display text-ink mt-2 text-lg font-semibold leading-tight tracking-[-0.03em] sm:text-xl">
                {brand.name}
              </span>

              <span className="text-faint text-2xs uppercase tracking-[0.14em]">
                {formatCompactNumber(brand.productCount)} styles
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
