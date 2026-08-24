import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/**
 * Skeleton.
 *
 * The base every loading shape is built from. Three rules the whole system
 * depends on:
 *
 *  1. A skeleton must occupy EXACTLY the space its real content will, or it
 *     trades a spinner for a layout shift — which is worse, and shows up in
 *     CLS. Reusable shapes therefore live in `components/skeletons/`, next to
 *     the component they stand in for, rather than being improvised per route.
 *  2. The shimmer is `motion-safe` only. Under `prefers-reduced-motion` it
 *     settles to a static block.
 *  3. It is `aria-hidden`. The loading state is announced once by the region's
 *     own `aria-busy`, not by every grey rectangle inside it.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  // `.skeleton` carries the shared gradient and shimmer from `global.css`; the
  // global reduced-motion rule stops the animation without a variant here.
  return <div aria-hidden className={cn('skeleton rounded-sm', className)} {...props} />;
}

/**
 * Text skeleton.
 *
 * Sized in `em` so it tracks whatever type scale it is dropped into, and the
 * last line is short — real paragraphs do not end flush, and a block of equal
 * bars reads as a table rather than prose.
 */
export function SkeletonText({
  lines = 3,
  className,
  ...props
}: { lines?: number } & ComponentProps<'div'>) {
  return (
    <div className={cn('space-y-2', className)} {...props}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className="h-[0.8em] rounded-xs"
          style={{ width: i === lines - 1 ? '62%' : '100%' }}
        />
      ))}
    </div>
  );
}
