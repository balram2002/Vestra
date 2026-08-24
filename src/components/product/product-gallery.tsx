'use client';

import Image from 'next/image';
import { useState } from 'react';

import type { Media } from '@/domain/types';
import { cn } from '@/lib/cn';

/**
 * Product gallery.
 *
 * A client island because selecting a shot is genuinely interactive, but kept
 * deliberately small:
 *
 *  - the FIRST image is rendered by the server with `priority`, so the LCP
 *    element is in the initial HTML and does not wait for hydration;
 *  - every other shot is a normal lazy `next/image`, so switching is instant
 *    after first view without preloading the whole gallery up front;
 *  - thumbnails are real buttons in a tablist, so the gallery is operable by
 *    keyboard and announced correctly.
 *
 * On mobile it becomes a snap-scrolling filmstrip: a thumbnail rail on a phone
 * wastes the width that the photograph itself needs.
 */
export function ProductGallery({ media, title }: { media: Media[]; title: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = media[activeIndex] ?? media[0];

  if (!active) {
    return <div className="bg-sunken aspect-[3/4] w-full rounded-lg" aria-hidden />;
  }

  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row">
      {media.length > 1 ? (
        <div
          role="tablist"
          aria-label={`${title} images`}
          className="scrollbar-none flex gap-2 overflow-x-auto lg:w-16 lg:flex-col lg:overflow-visible"
        >
          {media.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={item.alt}
              onClick={() => setActiveIndex(index)}
              // Hovering a thumbnail previews it, which is how people actually
              // browse a gallery; the click then commits.
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                'bg-sunken relative aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-sm border-2 transition-colors lg:w-full',
                index === activeIndex ? 'border-accent' : 'border-transparent hover:border-line-bold',
              )}
            >
              <Image
                src={item.thumbnailUrl}
                alt=""
                fill
                sizes="64px"
                loading="lazy"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      <div className="bg-sunken relative aspect-[3/4] flex-1 overflow-hidden rounded-lg">
        <Image
          key={active.id}
          src={active.url}
          alt={active.alt}
          fill
          // The opening shot is the page's LCP element.
          priority={activeIndex === 0}
          sizes="(max-width: 64rem) 100vw, 42vw"
          className="object-cover"
        />
      </div>
    </div>
  );
}
