import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';

/**
 * The loading shape for `ProductCard`.
 *
 * Deliberately mirrors that component's structure element for element — same
 * 3:4 image well, same two-line title, same price row height. That is the whole
 * point: when the real card swaps in, nothing moves. A generic grey rectangle
 * would load just as fast and still cost CLS.
 */
export function ProductCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col', className)} aria-hidden>
      <Skeleton className="aspect-3/4 w-full rounded-md" />
      <div className="flex flex-col gap-1.5 pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3 w-20 rounded-xs" />
          <Skeleton className="h-3.5 w-10 rounded-xs" />
        </div>
        <Skeleton className="h-3.5 w-full rounded-xs" />
        <Skeleton className="h-3.5 w-3/5 rounded-xs" />
        <Skeleton className="mt-1 h-4 w-28 rounded-xs" />
      </div>
    </div>
  );
}

/**
 * A grid of card skeletons.
 *
 * `count` should match the page size the real grid will render, so the
 * scrollbar does not jump when content arrives.
 */
export function ProductGridSkeleton({
  count = 12,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading products"
      className={cn(
        'grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
        className,
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Horizontal rail variant, used on the homepage and PDP. */
export function ProductRailSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading products"
      className="grid grid-flow-col auto-cols-[46%] gap-3 overflow-hidden sm:auto-cols-[30%] lg:auto-cols-[22%] xl:auto-cols-[16.5%]"
    >
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
