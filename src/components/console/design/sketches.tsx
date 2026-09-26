import { cn } from '@/lib/cn';

/**
 * Box sketches of each layout, keyed by the definition's `sketch`.
 *
 * Drawn rather than screenshotted: a sketch never goes stale when a layout is
 * polished, and it says what the layout IS (banner first, grid of reels)
 * rather than what one store looked like in it on one day.
 */

const tile = 'bg-line rounded-[3px]';

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div aria-hidden className="bg-canvas space-y-1.5 rounded-md p-2 shadow-sm">
      {children}
    </div>
  );
}

function Tiles({ count, className }: { count: number; className: string }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className={cn(tile, className)} />
      ))}
    </>
  );
}

const SKETCHES: Record<string, () => React.ReactNode> = {
  'store-classic': () => (
    <Frame>
      <div className="h-8 rounded-md bg-gradient-to-br from-amber-100 to-sky-100" />
      <div className="-mt-4 ml-2 size-7 rounded-md border-2 border-white bg-neutral-300" />
      <div className={cn(tile, 'h-2 w-1/2')} />
      <div className={cn(tile, 'h-4')} />
      <div className="flex gap-1">
        <span className={cn(tile, 'h-12 w-1/4')} />
        <span className="grid flex-1 grid-cols-3 gap-1">
          <Tiles count={3} className="" />
        </span>
      </div>
    </Frame>
  ),
  'store-spotlight': () => (
    <Frame>
      <div className="flex h-14 items-center gap-2 rounded-md bg-neutral-800 px-2">
        <span className="size-7 rounded bg-white" />
        <span className="h-3.5 flex-1 rounded-sm bg-white/90" />
      </div>
      <div className="grid grid-cols-3 gap-1">
        <Tiles count={3} className="h-3.5" />
      </div>
      <div className="grid grid-cols-4 gap-1">
        <Tiles count={4} className="aspect-9/16" />
      </div>
    </Frame>
  ),
  'store-studio': () => (
    <Frame>
      <div className={cn(tile, 'h-5')} />
      <div className="-mt-3 flex items-end gap-2 px-1">
        <span className="size-9 rounded-full bg-[conic-gradient(#f59e0b,#ef4444,#d946ef,#8b5cf6,#f59e0b)] p-[2px]">
          <span className="bg-canvas block size-full rounded-full" />
        </span>
        <span className="flex flex-1 gap-1.5 pb-1">
          <Tiles count={3} className="h-2 flex-1" />
        </span>
      </div>
      <div className="grid grid-cols-3 gap-px">
        <Tiles count={6} className="aspect-9/16 rounded-none" />
      </div>
    </Frame>
  ),
};

export function DesignSketch({ sketch }: { sketch: string }) {
  const draw = SKETCHES[sketch];
  return draw ? draw() : <Frame><div className={cn(tile, 'h-24')} /></Frame>;
}
