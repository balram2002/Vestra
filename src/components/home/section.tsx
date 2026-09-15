import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Reveal } from '@/components/ui/reveal';
import { cn } from '@/lib/cn';

/**
 * The frame every home section sits in.
 *
 * A home page is six or eight rails in a row, and without a strong, repeated
 * frame it reads as one undifferentiated scroll. Three things do the work here
 * and they are the whole reason this is a component rather than a copied
 * `<section>`:
 *
 *  1. **Vertical rhythm.** One padding value, applied everywhere. Rails that
 *     each pick their own spacing are what make a page look assembled.
 *  2. **A heading with real weight.** The display face at 2xl/3xl with an
 *     optional eyebrow above it. A section title set at the same size as a
 *     product name gives the page no hierarchy at all.
 *  3. **The "see all" affordance in one place**, so it is always in the same
 *     corner, always the same size, and always has a 44px target on a phone.
 *
 * `bleed` is the one real complication. A rail must run off both edges of a
 * phone — a row that stops flush at the viewport looks like the whole set — but
 * its HEADING must stay aligned to the page grid like every other section. So
 * the frame keeps its gutter and the rail is handed a `contentClassName` that
 * cancels it. Doing that here rather than per rail is what keeps the alignment
 * identical across all of them.
 */
export function Section({
  title,
  subtitle,
  eyebrow,
  href,
  badge,
  ctaLabel = 'See all',
  children,
  className,
  /** Drops the gutter on the section itself, for a child that bleeds. */
  flush = false,
  /** Skip the scroll-reveal — for the first section, which is already visible. */
  immediate = false,
}: {
  title?: string | null;
  subtitle?: string | null;
  eyebrow?: string | null;
  href?: string | null;
  /** Sits beside the heading: a countdown, a count, a state. */
  badge?: React.ReactNode;
  ctaLabel?: string | null;
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
  immediate?: boolean;
}) {
  const body = (
    <>
      {title ? (
        <div
          className={cn(
            'mb-5 flex items-end justify-between gap-6 sm:mb-7',
            flush && 'gutter shell-max',
          )}
        >
          <div className="min-w-0">
            {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="headline text-ink text-2xl sm:text-3xl">{title}</h2>
              {badge}
            </div>
            {subtitle ? (
              <p className="text-muted mt-2 max-w-xl text-sm">{subtitle}</p>
            ) : null}
          </div>

          {href ? (
            <Link
              href={href}
              className={cn(
                'text-ink group inline-flex shrink-0 items-center gap-1.5 rounded-full',
                'border-line-control hover:border-line-bold border px-4 text-xs font-medium',
                'transition-[border-color,transform] duration-(--duration-base) ease-(--ease-out)',
                'motion-safe:active:scale-[0.97]',
                'min-h-11 lg:min-h-9',
              )}
            >
              {ctaLabel}
              <ArrowRight
                className="size-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          ) : null}
        </div>
      ) : null}

      {children}
    </>
  );

  return (
    <Reveal
      as="section"
      distance={immediate ? 'none' : 'sm'}
      className={cn('py-12 sm:py-16', flush ? '' : 'gutter shell-max', className)}
    >
      {body}
    </Reveal>
  );
}
