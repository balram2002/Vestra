import { BadgeCheck, Star } from 'lucide-react';
import Link from 'next/link';

import { Picture } from '@/components/ui/picture';
import type { HomeSection } from '@/domain/types';
import type { Testimonial } from '@/server/services/reviews';
import { cn } from '@/lib/cn';
import { staggerIndex } from '@/lib/motion';

import { Section } from './section';

/**
 * What shoppers said.
 *
 * REAL REVIEWS, each tied to a delivered order and each linking to the product
 * it is about. That link is the whole difference between a testimonial band
 * and decoration: a quote nobody can check is a quote nobody believes, and
 * shoppers have been trained by a decade of invented ones to skip the section
 * entirely.
 *
 * Three cards on a desktop, a scrolling rail on a phone -- the same shape as
 * every other row here, so it reads as part of the page rather than as a
 * widget somebody pasted in.
 */
export function Testimonials({
  section,
  items,
}: {
  section: HomeSection;
  items: Testimonial[];
}) {
  if (items.length === 0) return null;

  return (
    <Section title={section.title} subtitle={section.subtitle} href={section.href} flush>
      <ul
        className={cn(
          'no-scrollbar stagger gutter shell-max flex snap-x snap-mandatory gap-3 overflow-x-auto',
          'sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3',
        )}
      >
        {items.slice(0, 6).map((item, index) => (
          <li
            key={item.id}
            className="w-[82%] shrink-0 snap-start sm:w-auto sm:shrink"
            style={staggerIndex(index)}
          >
            <figure className="border-line bg-raised flex h-full flex-col rounded-xl border p-5">
              <div className="flex items-center gap-1" aria-label={`${item.rating} out of 5`}>
                {Array.from({ length: 5 }).map((_, star) => (
                  <Star
                    key={star}
                    aria-hidden
                    className={cn(
                      'size-3.5',
                      star < item.rating ? 'fill-warning-500 text-warning-500' : 'text-line-strong',
                    )}
                  />
                ))}
              </div>

              {item.title ? (
                <p className="text-ink mt-3 text-sm font-semibold">{item.title}</p>
              ) : null}

              <blockquote className="text-muted mt-1.5 line-clamp-4 flex-1 text-sm">
                {item.body}
              </blockquote>

              <figcaption className="mt-4 flex items-center gap-3">
                <Link href={`/product/${item.productSlug}`} className="group flex min-w-0 items-center gap-3">
                  <Picture
                    src={item.productImageUrl}
                    name={item.productTitle}
                    sizes="40px"
                    className="size-10 shrink-0 rounded-md"
                  />
                  <span className="min-w-0">
                    <span className="text-ink flex items-center gap-1 text-xs font-medium">
                      {item.authorName}
                      {item.verifiedPurchase ? (
                        <BadgeCheck className="text-accent-ink size-3.5" aria-label="Verified purchase" />
                      ) : null}
                    </span>
                    <span className="text-faint block truncate text-2xs group-hover:underline">
                      on {item.productTitle}
                    </span>
                  </span>
                </Link>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </Section>
  );
}
