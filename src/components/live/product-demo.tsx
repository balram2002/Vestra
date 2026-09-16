'use client';

import { ArrowLeft, BadgeCheck, ChevronDown, ChevronUp, Maximize, Pause, Play, RotateCcw, ShoppingBag, Volume2, VolumeX } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition, type CSSProperties } from 'react';
import { toast } from 'sonner';
import { Picture } from '@/components/ui/picture';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ShareMenu } from '@/components/commerce/share-menu';
import { formatMoney } from '@/lib/format';
import { addToBag } from '@/server/actions/cart';
import type { ProductDemoData } from '@/server/services/product-demo';

const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function ProductDemo({ demo }: { demo: ProductDemoData }) {
  const video = useRef<HTMLVideoElement>(null);
  const player = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(demo.durationSeconds);
  const [elapsed, setElapsed] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sheet, setSheet] = useState(32);
  const [controls, setControls] = useState(true);
  const [chosen, setChosen] = useState<ProductDemoData['products'][number] | null>(null);
  const [variantId, setVariantId] = useState('');
  const [pending, start] = useTransition();
  const drag = useRef<{ y: number; value: number; height: number } | null>(null);

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) video.current?.pause(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => {
    const node = video.current;
    if (!node) return;
    // Browsers may reject autoplay with sound. Try it first, then keep the
    // video moving silently and leave a visible sound control for one tap.
    void node.play().catch(async () => {
      node.muted = true;
      setMuted(true);
      try { await node.play(); } catch { setPaused(true); }
    });
  }, []);
  useEffect(() => {
    if (paused || !controls) return;
    const timer = window.setTimeout(() => setControls(false), 2600);
    return () => window.clearTimeout(timer);
  }, [paused, controls]);

  const toggle = async () => {
    if (!video.current) return;
    setControls(true);
    if (video.current.paused) { try { await video.current.play(); } catch { toast.error('Tap play again to start the video.'); } }
    else video.current.pause();
  };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (player.current?.requestFullscreen) await player.current.requestFullscreen();
      else (video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null)?.webkitEnterFullscreen?.();
    } catch { toast.error('Full screen is unavailable in this browser.'); }
  };
  const setSheetBounded = (value: number) => setSheet(Math.max(25, Math.min(72, value)));

  return <main className="demo-layout" style={{ '--demo-sheet': `${sheet}%` } as CSSProperties}>
    <div ref={player} className="demo-player relative min-h-0 min-w-0 overflow-hidden bg-black text-white" onPointerMove={() => setControls(true)}>
      {demo.videoUrl && !failed ? <video ref={video} src={demo.videoUrl} poster={demo.posterUrl ?? undefined} muted={muted} playsInline autoPlay preload="metadata" className="absolute inset-0 size-full object-contain" onPlay={() => setPaused(false)} onPause={() => setPaused(true)} onEnded={() => { setPaused(true); setControls(true); }} onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : demo.durationSeconds)} onDurationChange={(event) => { if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration); }} onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)} onWaiting={() => setLoading(true)} onPlaying={() => setLoading(false)} onCanPlay={() => setLoading(false)} onError={() => { setFailed(true); setLoading(false); }} /> : demo.posterUrl ? <Image src={demo.posterUrl} alt={demo.title} fill sizes="(min-width: 1024px) 65vw, 100vw" priority className="object-contain" /> : <div className="absolute inset-0 grid place-items-center"><ShoppingBag className="size-20 text-white/40" /></div>}
      {demo.videoUrl && !failed ? <div aria-hidden className="absolute inset-x-0 top-0 z-10 h-1 bg-white/25"><span className="block h-full bg-white transition-[width] duration-150" style={{ width: `${duration ? elapsed / duration * 100 : 0}%` }} /></div> : null}

      {demo.videoUrl && !failed ? <button onClick={toggle} aria-label={paused ? 'Play demo' : 'Pause demo'} className="absolute inset-0 grid size-full place-items-center focus-visible:outline-4 focus-visible:outline-white"><span className={`grid size-16 place-items-center rounded-full bg-black/55 transition-opacity ${paused || controls ? 'opacity-100' : 'opacity-0'}`}>{paused ? <Play className="ml-1 size-7" /> : <Pause className="size-7" />}</span></button> : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent p-3 pb-12 sm:p-5 sm:pb-16">
        <div className="pointer-events-auto flex items-center gap-2.5">
          <Link href={`/store/${demo.seller.slug}`} aria-label="Back to store" className="grid size-11 shrink-0 place-items-center rounded-full bg-black/35"><ArrowLeft className="size-5" /></Link>
          <Picture src={demo.seller.logo} name={demo.seller.name} sizes="44px" className="size-11 shrink-0 rounded-full border border-white/30" />
          <Link href={`/store/${demo.seller.slug}`} className="min-w-0 flex-1"><span className="flex items-center gap-1 text-sm font-semibold"><span className="truncate">{demo.seller.name}</span>{demo.seller.verified ? <BadgeCheck className="size-4 shrink-0 text-sky-300" aria-label="Verified seller" /> : null}</span><span className="text-xs text-white/80">Visit store</span></Link>
          <ShareMenu title={demo.title} path={demo.path} showWhatsApp className="bg-black/50 text-white border-white/20" />
        </div>
      </div>
      {loading ? <p role="status" className="pointer-events-none absolute inset-x-0 top-1/2 mt-12 text-center text-sm">Loading video…</p> : null}
      {failed ? <div role="alert" className="absolute inset-x-6 top-1/2 rounded-xl bg-black/80 p-4 text-center text-sm"><p>We couldn’t load this clip. You can still shop below.</p><button className="mt-3 inline-flex min-h-11 items-center gap-2 underline" onClick={() => { setFailed(false); setPaused(true); }}><RotateCcw className="size-4" />Retry video</button></div> : null}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-4 pb-4 pt-12">
        <h1 className="mb-2 line-clamp-2 pr-12 text-sm font-medium text-white sm:text-lg">{demo.title}</h1>
        {!demo.videoUrl ? <p className="text-xs text-white/80">Product preview · a video hasn’t been added yet</p> : !failed ? <div className="flex items-center gap-2">
          <button onClick={toggle} aria-label={paused ? 'Play video' : 'Pause video'} className="grid size-11 shrink-0 place-items-center">{paused ? <Play className="size-5" /> : <Pause className="size-5" />}</button>
          <label className="min-w-0 flex-1"><span className="sr-only">Video timeline</span><input type="range" min={0} max={duration || 1} step={0.1} value={Math.min(elapsed, duration || 1)} disabled={!duration} aria-valuetext={`${timeLabel(elapsed)} of ${timeLabel(duration)}`} onChange={(event) => { const value = Number(event.target.value); if (video.current) video.current.currentTime = value; setElapsed(value); }} className="demo-seek h-8 w-full accent-white" /></label>
          <button onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute video' : 'Mute video'} className="grid size-11 shrink-0 place-items-center">{muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
          <label className="hidden shrink-0 sm:block"><span className="sr-only">Playback speed</span><select className="min-h-11 bg-transparent text-xs text-white" defaultValue="1" onChange={(event) => { if (video.current) video.current.playbackRate = Number(event.target.value); }}><option value="0.5" className="text-black">0.5×</option><option value="1" className="text-black">1×</option><option value="1.5" className="text-black">1.5×</option><option value="2" className="text-black">2×</option></select></label>
          <button onClick={fullscreen} aria-label="Toggle fullscreen" className="grid size-11 shrink-0 place-items-center"><Maximize className="size-4" /></button>
        </div> : null}
      </div>
    </div>

    <section className="demo-products bg-raised text-ink relative flex min-h-0 min-w-0 flex-col rounded-t-3xl lg:rounded-none" aria-label="Featured products">
      <div role="slider" tabIndex={0} aria-label="Featured products panel height" aria-valuemin={25} aria-valuemax={72} aria-valuenow={Math.round(sheet)} aria-valuetext={`${Math.round(sheet)} percent of screen`} aria-orientation="vertical" className="flex h-7 shrink-0 touch-none cursor-ns-resize items-center justify-center lg:hidden" onKeyDown={(event) => { if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) { event.preventDefault(); setSheetBounded(event.key === 'Home' ? 25 : event.key === 'End' ? 72 : sheet + (event.key === 'ArrowUp' ? 8 : -8)); } }} onPointerDown={(event) => { drag.current = { y: event.clientY, value: sheet, height: event.currentTarget.closest('main')!.clientHeight }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (drag.current) setSheetBounded(drag.current.value + (drag.current.y - event.clientY) / drag.current.height * 100); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><span className="bg-line-bold h-1 w-10 rounded-full" /></div>
      <header className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 lg:px-6 lg:pt-7"><div className="min-w-0"><h2 className="font-display text-base font-semibold lg:text-2xl">Featured products</h2><p className="text-muted mt-0.5 text-xs">{demo.products.length} {demo.products.length === 1 ? 'piece' : 'pieces'} in this {demo.videoUrl ? 'demo' : 'preview'}</p></div><div className="flex shrink-0 items-center"><button onClick={() => setSheet(sheet > 50 ? 32 : 72)} className="text-accent-ink flex min-h-11 items-center gap-1 text-xs font-semibold lg:hidden">{sheet > 50 ? 'Collapse' : 'See all'}{sheet > 50 ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}</button><Link href="/bag" aria-label="View bag" className="text-ink grid size-11 place-items-center lg:hidden"><ShoppingBag className="size-5" /></Link></div><Link href={`/store/${demo.seller.slug}`} className="text-accent-ink hidden text-sm lg:block">Visit store →</Link></header>
      <div className={`demo-product-scroll min-h-0 flex-1 overflow-auto overscroll-contain px-4 pb-5 lg:px-6 ${sheet > 50 ? 'is-expanded' : ''}`}>
        <div className="demo-product-grid">
          {demo.products.map((product, index) => <article key={product.id} className="demo-tile border-line bg-canvas min-w-0 overflow-hidden rounded-2xl border shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg">
            <Link href={`/product/${product.slug}`} className="relative block aspect-[4/3] bg-gradient-to-br from-amber-100 to-stone-200"><Image src={product.primaryImage} alt={product.title} fill priority={index < 2} sizes="(min-width: 1024px) 200px, 45vw" className="object-cover" /></Link>
            <div className="p-3"><h3 className="line-clamp-2 text-sm font-medium"><Link href={`/product/${product.slug}`}>{product.title}</Link></h3><p className="mt-2 text-base font-semibold">{formatMoney(product.sellingPrice)}</p>{product.discountPercent > 0 ? <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs"><s className="text-muted">{formatMoney(product.mrp)}</s><span className="text-success-700 font-medium">{product.discountPercent}% off</span></p> : null}
              <button onClick={() => { video.current?.pause(); setVariantId(''); setChosen(product); }} disabled={product.stockLevel === 'OUT_OF_STOCK'} className="bg-ink text-canvas mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-2 text-xs font-medium disabled:opacity-50"><ShoppingBag className="size-4" />{product.stockLevel === 'OUT_OF_STOCK' ? 'Sold out' : 'Choose & add'}</button>
            </div>
          </article>)}
        </div>
      </div>
      <div className="border-line hidden shrink-0 items-center justify-between border-t px-4 py-2 text-xs lg:flex lg:px-6"><span className="text-muted">Secure checkout · Inclusive prices</span><Link href="/bag" className="flex min-h-11 items-center gap-1 font-semibold"><ShoppingBag className="size-4" />View bag</Link></div>
    </section>
    <Dialog open={Boolean(chosen)} onOpenChange={(open) => { if (!open && !pending) setChosen(null); }}><DialogContent title={chosen?.title ?? 'Choose your option'} description="Choose a size and colour before adding to your bag." footer={<Button className="w-full" disabled={!variantId || pending} onClick={() => { if (!chosen || !variantId) return; start(async () => { const result = await addToBag({ productId: chosen.id, variantId, quantity: 1 }); if (result.ok) { toast.success('Added to your bag'); setChosen(null); } else toast.error(result.error ?? 'Unable to add this item'); }); }}>{pending ? 'Adding…' : 'Add to bag'}</Button>}>
      <div className="grid gap-2">{chosen?.variants.map((variant) => <label key={variant.id} className={`border-line flex min-h-12 items-center gap-3 rounded-xl border p-3 text-sm ${variant.available < 1 ? 'opacity-50' : ''}`}><input type="radio" name="demo-variant" value={variant.id} disabled={variant.available < 1} checked={variantId === variant.id} onChange={() => setVariantId(variant.id)} /><span className="flex-1">{variant.color} · {variant.size}{variant.available < 1 ? ' · Sold out' : ''}</span><span>{formatMoney(variant.sellingPrice)}</span></label>)}</div>
      {chosen ? <Link href={`/product/${chosen.slug}`} className="text-accent-ink mt-4 inline-flex min-h-11 items-center text-sm underline">Full product details & size guide</Link> : null}
    </DialogContent></Dialog>
  </main>;
}
