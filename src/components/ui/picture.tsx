'use client';

import Image from 'next/image';
import { useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * A picture that always shows something.
 *
 * Every tile in the shop -- a category, a brand, a store, a section -- has a
 * picture that may be missing (nobody has uploaded one yet) or may fail (a
 * third-party URL, a blocked host, a phone on a train). Both cases used to
 * render an empty grey box, and a row of empty grey boxes is what makes a
 * homepage look unfinished even when everything behind it works.
 *
 * The fallback is a MONOGRAM ON A TINT DERIVED FROM THE NAME, exactly as
 * `Avatar` does it: the same category gets the same colour on every screen and
 * after every reload, with nothing stored and nothing to migrate. A tile that
 * says "K" over a considered colour reads as a designed placeholder; a grey
 * rectangle reads as a bug.
 *
 * A client component, and only because `onError` exists nowhere else: a broken
 * image is a browser event, and the server cannot know about it.
 */

const TINTS = [
  'from-chart-1/25 to-chart-1/5 text-chart-1',
  'from-chart-2/25 to-chart-2/5 text-chart-2',
  'from-chart-3/25 to-chart-3/5 text-chart-3',
  'from-chart-4/25 to-chart-4/5 text-chart-4',
  'from-chart-5/25 to-chart-5/5 text-chart-5',
  'from-chart-6/25 to-chart-6/5 text-chart-6',
  'from-chart-7/25 to-chart-7/5 text-chart-7',
  'from-chart-8/25 to-chart-8/5 text-chart-8',
] as const;

/** A small, stable, order-independent hash. Not cryptographic; not meant to be. */
function tintFor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return TINTS[Math.abs(hash) % TINTS.length];
}

function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function Picture({
  src,
  name,
  sizes,
  className,
  imageClassName,
  priority = false,
  fit = 'cover',
}: {
  src?: string | null;
  /** What this is a picture OF. Drives the fallback's letters and colour. */
  name: string;
  sizes: string;
  /** The frame: give it a size and a shape. */
  className?: string;
  imageClassName?: string;
  priority?: boolean;
  fit?: 'cover' | 'contain';
}) {
  const [broken, setBroken] = useState(false);
  const usable = src && !broken;

  return (
    // `@container` so the fallback's letters can be sized against the tile
    // rather than against the page: one component serves a 40px logo and a
    // 320px category tile with no prop for it.
    <div className={cn('bg-sunken relative overflow-hidden @container', className)}>
      <div aria-hidden className={cn('absolute inset-0 grid place-items-center bg-gradient-to-br font-semibold', tintFor(name))}>
        <span className="text-[26cqw] leading-none tracking-tight">{monogram(name)}</span>
      </div>
      {usable ? (
        <Image
          src={src}
          alt=""
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : 'lazy'}
          onError={() => setBroken(true)}
          className={cn(fit === 'contain' ? 'object-contain' : 'object-cover', imageClassName)}
        />
      ) : (
        <div
          aria-hidden
          className={cn(
            'absolute inset-0 grid place-items-center bg-gradient-to-br font-semibold',
            tintFor(name),
          )}
        >
          <span className="text-[26cqw] leading-none tracking-tight">{monogram(name)}</span>
        </div>
      )}
    </div>
  );
}
