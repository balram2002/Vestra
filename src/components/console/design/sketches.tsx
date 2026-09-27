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

Object.assign(SKETCHES, {
  'product-classic': () => (
    <Frame>
      <div className="flex gap-1.5">
        <span className="flex w-3 flex-col gap-1">
          <Tiles count={4} className="aspect-4/5" />
        </span>
        <span className={cn(tile, 'h-20 flex-[1.2]')} />
        <span className="flex flex-1 flex-col gap-1">
          <span className="bg-ink/60 block h-2 w-3/4 rounded-sm" />
          <Tiles count={2} className="h-1.5" />
          <span className="bg-accent/60 mt-auto block h-3 rounded-sm" />
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <Tiles count={2} className="h-4" />
      </div>
    </Frame>
  ),
  'product-lookbook': () => (
    <Frame>
      <div className="flex gap-1.5">
        <span className="flex flex-[1.6] flex-col gap-1">
          <span className={cn(tile, 'h-11')} />
          <span className="bg-ink/40 mx-auto block h-1.5 w-2/3 rounded-sm" />
          <span className={cn(tile, 'h-11')} />
        </span>
        <span className="border-line flex flex-1 flex-col gap-1 rounded-sm border p-1">
          <span className="bg-ink/60 block h-2 w-3/4 rounded-sm" />
          <Tiles count={2} className="h-1.5" />
          <span className="bg-accent/60 block h-3 rounded-sm" />
        </span>
      </div>
    </Frame>
  ),
  'product-social': () => (
    <Frame>
      <div className="flex items-center gap-1.5 rounded-sm border border-dashed border-neutral-300 p-1">
        <span className="size-4 rounded-full bg-[conic-gradient(#f59e0b,#ef4444,#d946ef,#8b5cf6,#f59e0b)]" />
        <span className={cn(tile, 'h-1.5 flex-1')} />
        <span className="h-2.5 w-6 rounded-full bg-[#1f9d55]" />
      </div>
      <div className="flex gap-1.5">
        <span className={cn(tile, 'aspect-9/16 w-10')} />
        <span className="flex flex-1 flex-col gap-1">
          <span className="bg-ink/60 block h-2 w-3/4 rounded-sm" />
          <Tiles count={2} className="h-1.5" />
          <span className="bg-accent/60 block h-3 rounded-sm" />
          <span className="grid grid-cols-4 gap-0.5">
            <Tiles count={4} className="aspect-square" />
          </span>
        </span>
      </div>
    </Frame>
  ),
});

Object.assign(SKETCHES, {
  'demo-classic': () => (
    <Frame>
      <div className="flex gap-1.5">
        <span className="relative h-20 flex-[1.6] rounded-sm bg-neutral-800">
          <span className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
        </span>
        <span className="grid flex-1 grid-cols-2 gap-1">
          <Tiles count={4} className="" />
        </span>
      </div>
    </Frame>
  ),
  'demo-showroom': () => (
    <Frame>
      <div className="flex gap-1.5">
        <span className="aspect-9/16 w-9 rounded-md bg-neutral-800" />
        <span className="border-line flex flex-1 flex-col gap-1 rounded-sm border p-1">
          <span className="bg-ink/60 block h-2 w-3/4 rounded-sm" />
          <span className="flex gap-0.5">
            <Tiles count={3} className="h-2 flex-1 rounded-full" />
          </span>
          <span className="bg-accent/60 mt-auto block h-3 rounded-full" />
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        <Tiles count={4} className="h-3" />
      </div>
    </Frame>
  ),
  'demo-stories': () => (
    <Frame>
      <div className="mx-auto flex aspect-9/16 h-24 flex-col justify-between rounded-md bg-neutral-800 p-1">
        <span className="flex gap-0.5">
          <span className="h-0.5 flex-1 rounded-full bg-white" />
          <span className="h-0.5 flex-1 rounded-full bg-white/40" />
          <span className="h-0.5 flex-1 rounded-full bg-white/40" />
        </span>
        <span className="block h-3 rounded-sm bg-white/90" />
      </div>
    </Frame>
  ),
});

Object.assign(SKETCHES, {
  'category-classic': () => (
    <Frame>
      <div className="flex h-9 items-end rounded-md bg-gradient-to-r from-neutral-700 to-neutral-300 p-1.5">
        <span className="h-2 w-1/3 rounded-sm bg-white/90" />
      </div>
      <div className="flex gap-1">
        <Tiles count={4} className="h-2 w-6 rounded-full" />
      </div>
      <div className="flex gap-1.5">
        <span className="flex w-5 flex-col gap-1">
          <Tiles count={4} className="h-1.5" />
        </span>
        <span className="grid flex-1 grid-cols-4 gap-1">
          <Tiles count={8} className="aspect-4/5" />
        </span>
      </div>
    </Frame>
  ),
  'category-editorial': () => (
    <Frame>
      <div className="flex gap-1">
        <span className="flex flex-1 flex-col justify-end gap-1 rounded-md bg-neutral-100 p-1.5">
          <span className="bg-ink/70 block h-3 w-3/4 rounded-sm" />
          <span className={cn(tile, 'h-1.5 w-1/2')} />
        </span>
        <span className="h-12 flex-1 rounded-md bg-gradient-to-br from-amber-100 to-rose-200" />
      </div>
      <div className="flex gap-1">
        <Tiles count={5} className="aspect-4/5 flex-1" />
      </div>
      <div className="grid grid-cols-4 gap-1">
        <Tiles count={3} className="aspect-4/5" />
        <span className="bg-accent/30 aspect-4/5 rounded-[3px]" />
      </div>
    </Frame>
  ),
  'category-wall': () => (
    <Frame>
      <div className="flex items-center gap-1">
        <span className="size-3 rounded-full bg-neutral-300" />
        <span className="bg-ink/70 h-2 w-1/3 rounded-sm" />
      </div>
      <div className="grid grid-flow-row-dense grid-cols-4 gap-0.5">
        <span className="col-span-2 row-span-2 rounded-[3px] bg-neutral-400" />
        <Tiles count={8} className="aspect-3/4 rounded-[2px]" />
      </div>
    </Frame>
  ),
});

Object.assign(SKETCHES, {
  'stores-classic': () => (
    <Frame>
      <div className="bg-ink/70 h-2.5 w-1/2 rounded-sm" />
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} className="border-line flex flex-col gap-0.5 rounded-[3px] border p-1">
            <span className="bg-ink/50 block h-1.5 w-3/4 rounded-sm" />
            <span className={cn(tile, 'h-1 w-full')} />
            <span className={cn(tile, 'h-1 w-2/3')} />
          </span>
        ))}
      </div>
    </Frame>
  ),
  'stores-market': () => (
    <Frame>
      <div className="h-6 rounded-md bg-neutral-100 p-1">
        <span className="bg-ink/70 block h-2 w-1/3 rounded-sm" />
      </div>
      <div className="flex gap-1">
        <Tiles count={4} className="h-2 w-6 rounded-full" />
      </div>
      <span className="bg-ink/50 block h-1.5 w-1/4 rounded-sm" />
      <div className="grid grid-cols-3 gap-1">
        <Tiles count={3} className="h-7" />
      </div>
      <span className="bg-ink/50 block h-1.5 w-1/4 rounded-sm" />
      <div className="grid grid-cols-3 gap-1">
        <Tiles count={2} className="h-7" />
      </div>
    </Frame>
  ),
  'stores-stories': () => (
    <Frame>
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className="size-6 rounded-full bg-[conic-gradient(#f59e0b,#ef4444,#d946ef,#8b5cf6,#f59e0b)] p-[2px]">
            <span className="bg-canvas block size-full rounded-full" />
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1">
        <Tiles count={3} className="h-9" />
      </div>
      <div className="grid grid-cols-4 gap-1">
        <Tiles count={4} className="h-5" />
      </div>
    </Frame>
  ),
});

export function DesignSketch({ sketch }: { sketch: string }) {
  const draw = SKETCHES[sketch];
  return draw ? draw() : <Frame><div className={cn(tile, 'h-24')} /></Frame>;
}
