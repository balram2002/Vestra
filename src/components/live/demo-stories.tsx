'use client';

import { BadgeCheck, RotateCcw, ShoppingBag, Store, Volume2, VolumeX, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ShareMenu } from '@/components/commerce/share-menu';
import { SeeLiveButton } from '@/components/live/see-live-button';
import { Picture } from '@/components/ui/picture';
import type { DemoPageSettings } from '@/domain/page-designs/demo';
import { formatMoney } from '@/lib/format';
import type { ProductDemoData } from '@/server/services/product-demo';

import { DemoChooser, type DemoProduct } from './demo-chooser';

const IMAGE_MS = 5000;

type Segment =
  | { kind: 'clip'; product: DemoProduct | null }
  | { kind: 'piece'; product: DemoProduct }
  | { kind: 'end' };

/**
 * Demo, Variant 3 ("Stories").
 *
 * The shape everyone already knows from their phone: bars across the top, a
 * tap on the right for the next, on the left for the last, a press to hold.
 * The seller's clip opens it, then one segment per piece in the clip, each with
 * a sticker to shop it, then an end card that hands the shopper to a person.
 *
 * Timing is driven from `requestAnimationFrame` and a ref, not from effects
 * that set state, so pausing is exact and nothing re-renders on a timer except
 * the one bar that is moving.
 */
export function DemoStories({ demo, settings }: { demo: ProductDemoData; settings: DemoPageSettings }) {
  const segments: Segment[] = [
    { kind: 'clip', product: demo.products[0] ?? null },
    ...(settings.products ? demo.products.slice(1).map((product) => ({ kind: 'piece' as const, product })) : []),
    ...(settings.seeLive || settings.visitStore ? [{ kind: 'end' as const }] : []),
  ];

  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [held, setHeld] = useState(false);
  const [muted, setMuted] = useState(settings.startMuted);
  const [chosen, setChosen] = useState<DemoProduct | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const elapsed = useRef(0);
  const pressStart = useRef(0);

  const segment = segments[index];
  const paused = held || chosen !== null || segment.kind === 'end';

  const go = useCallback(
    (next: number) => {
      const bounded = Math.max(0, Math.min(segments.length - 1, next));
      elapsed.current = 0;
      setProgress(0);
      setIndex(bounded);
    },
    [segments.length],
  );

  // Image segments run on a clock; the clip runs on its own time (below).
  useEffect(() => {
    if (paused || (segment.kind === 'clip' && demo.videoUrl)) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current += now - last;
      last = now;
      const share = Math.min(1, elapsed.current / IMAGE_MS);
      setProgress(share);
      if (share >= 1) go(index + 1);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused, segment.kind, index, go, demo.videoUrl]);

  // The clip plays while its segment is showing and nothing holds it.
  useEffect(() => {
    const node = video.current;
    if (!node || segment.kind !== 'clip') return;
    if (paused || !settings.autoplay) node.pause();
    else
      void node.play().catch(() => {
        node.muted = true;
        setMuted(true);
        void node.play().catch(() => undefined);
      });
  }, [paused, segment.kind, settings.autoplay]);

  const shop = segment.kind === 'end' ? null : segment.product;

  return (
    <main className="grid min-h-dvh place-items-center bg-neutral-950">
      <div className="relative h-dvh w-full max-w-[min(100vw,calc(100dvh*9/16))] overflow-hidden bg-black text-white sm:rounded-3xl lg:h-[94dvh]">
        {/* ------------------------------------------------------ media */}
        {segment.kind === 'clip' ? (
          demo.videoUrl ? (
            <video
              ref={video}
              src={demo.videoUrl}
              poster={demo.posterUrl ?? undefined}
              muted={muted}
              playsInline
              preload="metadata"
              className="absolute inset-0 size-full object-cover"
              onTimeUpdate={(event) => {
                const { currentTime, duration } = event.currentTarget;
                if (Number.isFinite(duration) && duration > 0) setProgress(currentTime / duration);
              }}
              onEnded={() => go(index + 1)}
            />
          ) : demo.posterUrl ? (
            <Image src={demo.posterUrl} alt={demo.title} fill priority sizes="(min-width: 1024px) 34rem, 100vw" className="object-cover" />
          ) : null
        ) : segment.kind === 'piece' ? (
          <Image
            key={segment.product.id}
            src={segment.product.primaryImage}
            alt={segment.product.title}
            fill
            sizes="(min-width: 1024px) 34rem, 100vw"
            className="animate-[story-zoom_5s_ease-out_forwards] object-cover"
          />
        ) : (
          <EndCard demo={demo} settings={settings} onReplay={() => go(0)} />
        )}

        {segment.kind !== 'end' ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/75" />
        ) : null}

        {/* ------------------------------------------------ tap zones */}
        {segment.kind !== 'end' ? (
          <div
            className="absolute inset-0 z-10 flex"
            onPointerDown={() => {
              pressStart.current = performance.now();
              setHeld(true);
            }}
            onPointerUp={() => setHeld(false)}
            onPointerLeave={() => setHeld(false)}
          >
            <button
              type="button"
              aria-label="Previous"
              className="h-full w-1/3"
              onClick={() => {
                if (performance.now() - pressStart.current < 250) go(index - 1);
              }}
            />
            <button
              type="button"
              aria-label="Next"
              className="h-full flex-1"
              onClick={() => {
                if (performance.now() - pressStart.current < 250) go(index + 1);
              }}
            />
          </div>
        ) : null}

        {/* ------------------------------------------------ bars + header */}
        <div className="absolute inset-x-0 top-0 z-20 p-3">
          <div className="flex gap-1" aria-label={`Part ${index + 1} of ${segments.length}`}>
            {segments.map((_, at) => (
              <span key={at} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/35">
                <span
                  className="block h-full bg-white"
                  style={{ width: `${at < index ? 100 : at === index ? progress * 100 : 0}%` }}
                />
              </span>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            {settings.sellerHeader ? (
              <Link href={`/store/${demo.seller.slug}`} className="flex min-w-0 flex-1 items-center gap-2">
                <Picture src={demo.seller.logo} name={demo.seller.name} sizes="36px" className="size-9 shrink-0 rounded-full border border-white/40" />
                <span className="flex min-w-0 items-center gap-1 text-sm font-semibold">
                  <span className="truncate">{demo.seller.name}</span>
                  {demo.seller.verified ? <BadgeCheck className="size-4 shrink-0 text-sky-300" aria-label="Verified seller" /> : null}
                </span>
              </Link>
            ) : (
              <span className="flex-1" />
            )}
            {segment.kind === 'clip' && demo.videoUrl ? (
              <button
                type="button"
                onClick={() => setMuted((value) => !value)}
                aria-label={muted ? 'Unmute video' : 'Mute video'}
                className="grid size-10 place-items-center rounded-full bg-black/35"
              >
                {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </button>
            ) : null}
            {settings.share ? <ShareMenu title={demo.title} path={demo.path} showWhatsApp className="border-white/20 bg-black/35 text-white" /> : null}
            <Link
              href={shop ? `/product/${shop.slug}` : `/store/${demo.seller.slug}`}
              aria-label="Close"
              className="grid size-10 place-items-center rounded-full bg-black/35"
            >
              <X className="size-5" />
            </Link>
          </div>
        </div>

        {/* --------------------------------------------------- sticker */}
        {segment.kind !== 'end' ? (
          <div className="absolute inset-x-0 bottom-0 z-20 space-y-3 bg-gradient-to-t from-black/60 via-black/25 to-transparent p-4 pb-6 pt-16">
            {settings.caption && segment.kind === 'clip' ? <h1 className="line-clamp-2 text-base font-semibold text-white drop-shadow">{demo.title}</h1> : null}
            {settings.caption && segment.kind === 'clip' ? null : <h1 className="sr-only">{demo.title}</h1>}
            {settings.products && shop ? (
              <div className="flex items-center gap-3 rounded-2xl bg-white/95 p-2.5 text-neutral-900 shadow-lg backdrop-blur">
                <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                  <Image src={shop.primaryImage} alt="" fill sizes="56px" className="object-cover" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-sm font-semibold">{shop.title}</span>
                  <span className="mt-0.5 flex items-baseline gap-2 text-sm">
                    <span className="font-bold">{formatMoney(shop.sellingPrice)}</span>
                    {shop.discountPercent > 0 ? <span className="text-xs font-medium text-emerald-700">{shop.discountPercent}% off</span> : null}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setChosen(shop)}
                  disabled={shop.stockLevel === 'OUT_OF_STOCK'}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-neutral-900 px-4 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <ShoppingBag className="size-4" aria-hidden />
                  {shop.stockLevel === 'OUT_OF_STOCK' ? 'Sold out' : settings.ctaLabel || 'Shop this'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <DemoChooser product={chosen} onClose={() => setChosen(null)} />
    </main>
  );
}

/** The last card: the pieces were seen, now a person can show them properly. */
function EndCard({ demo, settings, onReplay }: { demo: ProductDemoData; settings: DemoPageSettings; onReplay: () => void }) {
  const lead = demo.products[0];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-neutral-900 to-black px-8 text-center">
      <span className="rounded-full bg-[conic-gradient(from_210deg,#f59e0b,#ef4444,#d946ef,#8b5cf6,#f59e0b)] p-[3px]">
        <span className="block rounded-full bg-black p-[3px]">
          <Picture src={demo.seller.logo} name={demo.seller.name} sizes="96px" className="size-24 rounded-full bg-white" />
        </span>
      </span>
      <div>
        <p className="text-lg font-semibold">Liked what you saw?</p>
        <p className="mt-1 text-sm text-white/70">{demo.seller.name} can show you any of it on a video call, in your size.</p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2.5">
        {settings.seeLive && lead ? (
          <SeeLiveButton productId={lead.id} variantId={null} label="Call the store" className="w-full" />
        ) : null}
        {settings.visitStore ? (
          <Link
            href={`/store/${demo.seller.slug}`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/30 text-sm font-semibold"
          >
            <Store className="size-4" aria-hidden />
            Visit store
          </Link>
        ) : null}
        <button type="button" onClick={onReplay} className="inline-flex min-h-11 items-center justify-center gap-2 text-sm text-white/80">
          <RotateCcw className="size-4" aria-hidden />
          Watch again
        </button>
      </div>
      <span className="sr-only">End of story</span>
    </div>
  );
}
