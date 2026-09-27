import { ProductGridSkeleton } from './product-card-skeleton';

/**
 * What a page under an A/B test shows for the moment its layout is chosen
 * per visitor. Shaped like the page family, so the swap does not jump.
 */
export function PageSkeleton({ shape }: { shape: 'detail' | 'listing' | 'profile' | 'immersive' }) {
  if (shape === 'immersive') {
    return (
      <main className="grid h-dvh place-items-center bg-black text-white">
        <p role="status">Loading…</p>
      </main>
    );
  }
  return (
    <div className="gutter shell-max py-5" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-3 w-48 rounded-xs" />
      {shape === 'detail' ? (
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="skeleton aspect-4/5 rounded-3xl" />
          <div className="space-y-3">
            <div className="skeleton h-8 w-3/4 rounded-sm" />
            <div className="skeleton h-6 w-1/3 rounded-sm" />
            <div className="skeleton h-24 rounded-xl" />
            <div className="skeleton h-12 rounded-full" />
          </div>
        </div>
      ) : (
        <>
          <div className={shape === 'profile' ? 'skeleton mt-4 h-56 rounded-3xl' : 'skeleton mt-4 h-40 rounded-3xl'} />
          <ProductGridSkeleton className="mt-6" count={10} />
        </>
      )}
    </div>
  );
}
