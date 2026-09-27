'use client';

import { ArrowLeft, BadgeCheck, Pause, Play, ShoppingBag, Volume2, VolumeX } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ShareMenu } from '@/components/commerce/share-menu';
import { SeeLiveButton } from '@/components/live/see-live-button';
import { Button } from '@/components/ui/button';
import { Picture } from '@/components/ui/picture';
import type { DemoPageSettings } from '@/domain/page-designs/demo';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { addToBag } from '@/server/actions/cart';
import type { ProductDemoData } from '@/server/services/product-demo';

import { DemoChooser, type DemoProduct } from './demo-chooser';

/**
 * Demo, Variant 2 ("Showroom").
 *
 * A studio rather than a cinema: the clip framed on a light ground, and beside
 * it the piece the clip is about -- its options and Add to bag right there, so
 * buying is one tap from watching rather than a sheet away. The other pieces
 * in the clip sit on a shelf underneath.
 */
export function DemoShowroom({ demo, settings }: { demo: ProductDemoData; settings: DemoPageSettings }) {
  const lead = demo.products[0] ?? null;
  const rest = demo.products.slice(1);
  const [chosen, setChosen] = useState<DemoProduct | null>(null);

  return (
    <main className="bg-sunken min-h-dvh">
      <header className="gutter shell-max flex items-center gap-3 py-3">
        <Link
          href={`/store/${demo.seller.slug}`}
          aria-label="Back to store"
          className="bg-raised border-line grid size-11 shrink-0 place-items-center rounded-full border"
        >
          <ArrowLeft className="size-5" />
        </Link>
        {settings.sellerHeader ? (
          <Link href={`/store/${demo.seller.slug}`} className="flex min-w-0 flex-1 items-center gap-2.5">
            <Picture src={demo.seller.logo} name={demo.seller.name} sizes="40px" className="size-10 shrink-0 rounded-full" />
            <span className="min-w-0">
              <span className="text-ink flex items-center gap-1 text-sm font-semibold">
                <span className="truncate">{demo.seller.name}</span>
                {demo.seller.verified ? <BadgeCheck className="text-info-600 size-4 shrink-0" aria-label="Verified seller" /> : null}
              </span>
              {settings.visitStore ? <span className="text-muted block text-xs">Visit store</span> : null}
            </span>
          </Link>
        ) : (
          <span className="flex-1" />
        )}
        {settings.share ? <ShareMenu title={demo.title} path={demo.path} showWhatsApp /> : null}
      </header>

      <div
        className={cn(
          'gutter shell-max grid gap-6 pb-10',
          settings.products && lead ? 'lg:grid-cols-[auto_minmax(0,32rem)] lg:items-start lg:justify-center lg:gap-10' : 'justify-items-center',
        )}
      >
        <div className="w-full min-w-0 lg:w-[min(28rem,calc(78vh*9/16))]">
          <Player demo={demo} settings={settings} />
          {settings.caption ? <h1 className="font-display text-ink mt-4 text-xl sm:text-2xl">{demo.title}</h1> : <h1 className="sr-only">{demo.title}</h1>}
        </div>

        {settings.products && lead ? (
          <LeadPiece product={lead} settings={settings} sellerSlug={demo.seller.slug} />
        ) : null}
      </div>

      {settings.products && rest.length > 0 ? (
        <section className="bg-raised border-line border-t py-8" aria-label={settings.productsTitle || 'In this video'}>
          <div className="gutter shell-max">
            <h2 className="font-display text-ink text-lg">{settings.productsTitle || 'In this video'}</h2>
            <ul className="no-scrollbar mt-4 flex snap-x gap-3 overflow-x-auto pb-1">
              {rest.map((product) => (
                <li key={product.id} className="w-44 shrink-0 snap-start sm:w-52">
                  <article className="border-line bg-canvas overflow-hidden rounded-2xl border">
                    <Link href={`/product/${product.slug}`} className="bg-sunken relative block aspect-4/5">
                      <Image src={product.primaryImage} alt={product.title} fill sizes="13rem" className="object-cover" />
                    </Link>
                    <div className="p-3">
                      <h3 className="text-ink line-clamp-2 text-sm font-medium">{product.title}</h3>
                      <p className="text-ink mt-1.5 font-semibold">{formatMoney(product.sellingPrice)}</p>
                      <button
                        type="button"
                        onClick={() => setChosen(product)}
                        disabled={product.stockLevel === 'OUT_OF_STOCK'}
                        className="bg-ink text-canvas mt-2.5 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-medium disabled:opacity-50"
                      >
                        <ShoppingBag className="size-4" aria-hidden />
                        {product.stockLevel === 'OUT_OF_STOCK' ? 'Sold out' : settings.ctaLabel || 'Add to bag'}
                      </button>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <DemoChooser product={chosen} onClose={() => setChosen(null)} />
    </main>
  );
}

/** The clip in a frame, with the three controls a shopper actually uses. */
function Player({ demo, settings }: { demo: ProductDemoData; settings: DemoPageSettings }) {
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(settings.startMuted);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const node = video.current;
    if (!node || !settings.autoplay) return;
    void node.play().catch(async () => {
      node.muted = true;
      setMuted(true);
      try {
        await node.play();
      } catch {
        setPaused(true);
      }
    });
    // Read once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const node = video.current;
    if (!node) return;
    if (node.paused) void node.play().catch(() => toast.error('Tap play again to start the video.'));
    else node.pause();
  };

  return (
    <div className="relative mx-auto aspect-9/16 w-full max-w-[min(28rem,calc(78vh*9/16))] overflow-hidden rounded-3xl bg-black shadow-xl">
      {demo.videoUrl ? (
        <video
          ref={video}
          src={demo.videoUrl}
          poster={demo.posterUrl ?? undefined}
          muted={muted}
          playsInline
          loop
          preload="metadata"
          className="absolute inset-0 size-full object-cover"
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onTimeUpdate={(event) => {
            const { currentTime, duration } = event.currentTarget;
            if (Number.isFinite(duration) && duration > 0) setProgress(currentTime / duration);
          }}
        />
      ) : demo.posterUrl ? (
        <Image src={demo.posterUrl} alt={demo.title} fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
      ) : null}

      {demo.videoUrl ? (
        <>
          <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-white/25">
            <span className="block h-full bg-white" style={{ width: `${progress * 100}%` }} />
          </span>
          <button
            type="button"
            onClick={toggle}
            aria-label={paused ? 'Play demo' : 'Pause demo'}
            className="absolute inset-0 grid place-items-center"
          >
            <span className={cn('grid size-16 place-items-center rounded-full bg-black/50 text-white transition-opacity', paused ? 'opacity-100' : 'opacity-0')}>
              {paused ? <Play className="ml-1 size-7" /> : <Pause className="size-7" />}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMuted((value) => !value)}
            aria-label={muted ? 'Unmute video' : 'Mute video'}
            className="absolute bottom-3 right-3 grid size-11 place-items-center rounded-full bg-black/50 text-white"
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
        </>
      ) : (
        <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 p-4 text-xs text-white">Product preview · a video hasn’t been added yet</p>
      )}
    </div>
  );
}

/** The piece the clip is about, ready to buy: every option as a chip, one button. */
function LeadPiece({ product, settings, sellerSlug }: { product: DemoProduct; settings: DemoPageSettings; sellerSlug: string }) {
  const [variantId, setVariantId] = useState('');
  const [pending, start] = useTransition();
  const selected = product.variants.find((variant) => variant.id === variantId) ?? null;

  return (
    <aside className="bg-raised border-line rounded-3xl border p-5 shadow-sm lg:sticky lg:top-6">
      <div className="flex gap-4">
        <Link href={`/product/${product.slug}`} className="bg-sunken relative aspect-4/5 w-24 shrink-0 overflow-hidden rounded-xl">
          <Image src={product.primaryImage} alt={product.title} fill sizes="6rem" className="object-cover" />
        </Link>
        <div className="min-w-0">
          <p className="text-faint text-2xs font-semibold uppercase tracking-wider">In this video</p>
          <h2 className="text-ink mt-1 line-clamp-2 text-base font-semibold">
            <Link href={`/product/${product.slug}`}>{product.title}</Link>
          </h2>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <span className="text-ink text-xl font-bold">{formatMoney(selected?.sellingPrice ?? product.sellingPrice)}</span>
            {product.discountPercent > 0 ? (
              <>
                <s className="text-muted text-sm">{formatMoney(product.mrp)}</s>
                <span className="text-success-700 text-sm font-medium">{product.discountPercent}% off</span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="text-faint text-2xs font-semibold uppercase tracking-wider">Choose</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {product.variants.map((variant) => {
            const soldOut = variant.available < 1;
            return (
              <button
                key={variant.id}
                type="button"
                aria-pressed={variantId === variant.id}
                disabled={soldOut}
                onClick={() => setVariantId(variant.id)}
                className={cn(
                  'min-h-10 rounded-full border px-3 text-xs font-medium',
                  variantId === variant.id ? 'border-ink bg-ink text-canvas' : 'border-line-control text-ink',
                  soldOut && 'line-through opacity-40',
                )}
              >
                {variant.color} · {variant.size}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Button
        size="cta"
        shape="pill"
        className="mt-5"
        loading={pending}
        onClick={() => {
          if (!variantId) {
            toast.error('Choose an option first');
            return;
          }
          start(async () => {
            const result = await addToBag({ productId: product.id, variantId, quantity: 1 });
            if (result.ok) toast.success('Added to your bag');
            else toast.error(result.error ?? 'Unable to add this item');
          });
        }}
      >
        {!pending ? <ShoppingBag className="size-4" /> : null}
        {settings.ctaLabel || 'Add to bag'}
      </Button>

      {settings.seeLive ? (
        <SeeLiveButton productId={product.id} variantId={variantId || null} sizeLabel={selected?.size ?? null} label="Call the store" className="mt-2.5" />
      ) : null}

      <div className="text-muted mt-4 flex flex-wrap justify-between gap-2 text-xs">
        <Link href={`/product/${product.slug}`} className="underline underline-offset-2">
          Full details and size guide
        </Link>
        {settings.visitStore ? (
          <Link href={`/store/${sellerSlug}`} className="text-accent-ink font-medium">
            Visit store →
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
