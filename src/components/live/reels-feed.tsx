'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowDown, ArrowUp, Heart, Pause, Play, Radio, Share2, ShoppingBag, Volume2, VolumeX } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatCompactNumber, formatMoney } from '@/lib/format';
import { spring, tween } from '@/lib/motion';
import { useReelSpring } from '@/hooks/use-reel-spring';
import { toggleWishlistItem } from '@/server/actions/wishlist';

/** Commerce reels with custom spring navigation and one active video decoder. */

export interface Reel {
  demoPath: string;
  saved?: boolean;
  id: string;
  /** The clip. Null renders the poster alone, which is a valid reel. */
  videoUrl: string | null;
  posterUrl: string;
  caption: string;
  sellerName: string;
  sellerSlug: string;
  sellerLogoUrl: string;
  /** Whether that shop is taking live calls right now. */
  sellerIsLive: boolean;
  productId: string;
  productSlug: string;
  productTitle: string;
  productImage: string;
  sellingPrice: number;
  mrp: number;
  discountPercent: number;
  likes: number;
}

export function ReelsFeed({ reels }: { reels: Reel[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const reduced = useReducedMotion() ?? false;
  const { viewport, goTo } = useReelSpring(reels.length, reduced);

  if (reels.length === 0) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-950 p-8 text-center">
        <div className="max-w-xs">
          <p className="text-sm font-semibold text-white">No reels yet</p>
          <p className="mt-2 text-xs text-white/70">
            Shops near you haven&apos;t posted any clips. Browse the catalogue instead.
          </p>
          <Button asChild size="lg" shape="pill" className="mt-5">
            {/*
              `next/link` is deliberately NOT used here, which is what the
              disabled rule is about. This leaves the immersive route group for
              the storefront, and a soft navigation across that boundary renders
              one layout inside the other — see `lib/immersive`. An anchor is a
              document navigation, which is the entire requirement.
            */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Start shopping</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={viewport}
      tabIndex={0}
      role="region"
      aria-label="Shopping reels. Use up and down arrow keys to browse."
      data-no-swipe
      className={cn(
        // A full-screen feed owns every gesture inside it, sideways included.
        'h-dvh overflow-hidden overscroll-y-contain bg-slate-950 touch-pan-x',
        // The scrollbar is noise over full-bleed video, and the feed is driven
        // by a thumb rather than by a bar.
        'no-scrollbar',
      )}
    >
      {reels.map((reel, index) => (
        <ReelSlide
          key={reel.id}
          reel={reel}
          index={index}
          active={index === activeIndex}
          muted={muted}
          onActivate={setActiveIndex}
          onToggleMute={() => setMuted((value) => !value)}
        />
      ))}
      <div className="fixed right-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 sm:flex">
        <button type="button" aria-label="Previous reel" disabled={activeIndex === 0} onClick={() => goTo(activeIndex - 1)} className="grid size-11 place-items-center rounded-full bg-black/50 text-white disabled:opacity-30"><ArrowUp className="size-5" /></button>
        <button type="button" aria-label="Next reel" disabled={activeIndex === reels.length - 1} onClick={() => goTo(activeIndex + 1)} className="grid size-11 place-items-center rounded-full bg-black/50 text-white disabled:opacity-30"><ArrowDown className="size-5" /></button>
      </div>
      <p className="sr-only" aria-live="polite">Reel {activeIndex + 1} of {reels.length}</p>
    </div>
  );
}

function ReelSlide({
  reel,
  index,
  active,
  muted,
  onActivate,
  onToggleMute,
}: {
  reel: Reel;
  index: number;
  active: boolean;
  muted: boolean;
  onActivate: (index: number) => void;
  onToggleMute: () => void;
}) {
  const slide = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [liked, setLiked] = useState(reel.saved ?? false);
  const [saving, setSaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const reduced = useReducedMotion() ?? false;

  /*
   * Which reel is on screen.
   *
   * A 60% threshold rather than a hairline: at a low threshold two reels are
   * "visible" through most of a swipe and the active index flickers between
   * them, which restarts both videos. Sixty percent can only ever be true of
   * one slide in a full-height feed.
   */
  useEffect(() => {
    const node = slide.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onActivate(index);
      },
      { threshold: 0.6 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [index, onActivate]);

  /*
   * Play exactly the active reel.
   *
   * `play()` rejects when the browser blocks autoplay, and an unhandled
   * rejection here would surface as a console error on every swipe. It is
   * caught and ignored deliberately: a clip that will not autoplay still shows
   * its poster, which is a reel, and the shopper can tap it.
   */
  useEffect(() => {
    const node = video.current;
    if (!node) return;

    if (active && !paused && !document.hidden) {
      void node.play().catch(() => {});
    } else {
      node.pause();
      // Reset, so returning to a reel starts it rather than resuming a clip
      // that is already half over.
      if (!active) node.currentTime = 0;
    }
    const visibility = () => {
      if (document.hidden) node.pause();
      else if (active && !paused) void node.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [active, paused]);

  const price = reel.sellingPrice;

  return (
    <section
      ref={slide}
      inert={!active}
      className="relative h-dvh w-full snap-start snap-always overflow-hidden"
      aria-label={`${reel.productTitle} from ${reel.sellerName}`}
    >
      {/* ------------------------------------------------------------ media */}

      {reel.videoUrl && !failed ? (
        <video
          ref={video}
          src={reel.videoUrl}
          poster={reel.posterUrl}
          className="absolute inset-0 size-full object-cover"
          playsInline
          loop
          muted={muted}
          onError={() => setFailed(true)}
          // Only the first reel is worth fetching before anybody has swiped.
          preload={index === 0 ? 'auto' : 'none'}
        />
      ) : (
        <Image
          src={reel.posterUrl}
          alt=""
          fill
          sizes="100vw"
          priority={index === 0}
          className="object-cover"
        />
      )}

      {/*
        Two scrims, top and bottom, rather than one over the whole frame.

        A single wash dark enough for the caption would grey out the middle of
        the clip — which is the part being sold. These protect the type at both
        ends and leave the merchandise alone.
      */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/55 to-transparent"
      />
      <div aria-hidden className="scrim absolute inset-x-0 bottom-0 h-2/3" />
      {reel.videoUrl && !failed ? <button type="button" aria-label={paused ? 'Play reel' : 'Pause reel'} onClick={() => setPaused(!paused)} className="absolute left-4 top-20 grid size-11 place-items-center rounded-full bg-black/40 text-white">
        {paused ? <Play className="size-5" /> : <Pause className="size-5" />}
      </button> : null}
      {failed ? <p role="status" className="absolute left-4 top-20 rounded-lg bg-black/50 p-2 text-xs text-white">Video unavailable. You can still shop this look.</p> : null}

      {/* ------------------------------------------------------------- shop */}

      <div className="absolute inset-x-0 top-0 flex items-center gap-2.5 p-4">
        <a
          href={`/store/${reel.sellerSlug}`}
          className="flex min-w-0 items-center gap-2.5 rounded-full"
        >
          <span className="relative size-9 shrink-0 overflow-hidden rounded-full ring-2 ring-white/30">
            {reel.sellerLogoUrl ? (
              <Image src={reel.sellerLogoUrl} alt="" fill sizes="36px" className="object-cover" />
            ) : null}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-white">
              {reel.sellerName}
            </span>
            {reel.sellerIsLive ? (
              <span className="flex items-center gap-1 text-2xs font-medium text-white/80">
                <span className="bg-danger-500 size-1.5 rounded-full" aria-hidden />
                Live now
              </span>
            ) : null}
          </span>
        </a>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className="ml-auto grid size-11 shrink-0 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md transition-transform motion-safe:active:scale-90"
        >
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
      </div>

      {/* ------------------------------------------------------------ rail */}

      {/*
        The action rail sits ABOVE the bottom nav's height, not at the bottom of
        the viewport. The storefront's bottom bar is fixed over this feed, and a
        Save button underneath it is a Save button nobody can press.
      */}
      <div className="absolute bottom-[calc(var(--spacing-bottom-nav)+7.5rem)] right-3 flex flex-col items-center gap-4">
        <RailButton
          label={liked ? 'Remove from wishlist' : 'Save to wishlist'}
          onClick={() => {
            if (saving) return;
            setSaving(true);
            void toggleWishlistItem({ productId: reel.productId }).then((result) => {
              if (result.ok) { setLiked(result.saved ?? false); toast.success(result.saved ? 'Saved to wishlist' : 'Removed from wishlist'); }
              else toast.error(result.error ?? 'Could not save this item');
            }).catch(() => toast.error('Could not save this item')).finally(() => setSaving(false));
          }}
        >
          <motion.span
            // A like is small and immediate, so a visible overshoot reads as
            // energy rather than as wobble.
            animate={reduced ? undefined : { scale: liked ? [1, 1.35, 1] : 1 }}
            transition={tween.base}
            className="block"
          >
            <Heart
              className={cn('size-6', liked ? 'fill-danger-500 text-danger-500' : 'text-white')}
            />
          </motion.span>
        </RailButton>

        <RailButton
          label="Share"
          onClick={() => { void (async () => {
            const url = `${window.location.origin}${reel.demoPath}`;
            try {
              if (navigator.share) await navigator.share({ title: reel.productTitle, url });
              else if (navigator.clipboard) { await navigator.clipboard.writeText(url); toast.success('Link copied.'); }
              else toast.error('Sharing is unavailable in this browser.');
            } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error('Could not share this item.'); }
          })(); }}
        >
          <Share2 className="size-6 text-white" />
        </RailButton>
      </div>

      {/* --------------------------------------------------------- product */}

      <div className="absolute inset-x-0 bottom-[--spacing-bottom-nav] p-4">
        <p className="clamp-2 text-xs leading-relaxed text-white/90">{reel.caption}</p>

        <AnimatePresence initial={false}>
          <motion.div
            key={reel.productId}
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.glide}
            className="glass mt-3 flex items-center gap-3 rounded-2xl p-2.5 shadow-lg"
          >
            <a
              href={`/product/${reel.productSlug}`}
              className="bg-sunken relative size-14 shrink-0 overflow-hidden rounded-xl ring-1 ring-inset ring-black/[0.07]"
            >
              {reel.productImage ? (
                <Image
                  src={reel.productImage}
                  alt=""
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              ) : null}
            </a>

            <div className="min-w-0 flex-1">
              <a
                href={`/product/${reel.productSlug}`}
                className="text-ink clamp-2 text-xs font-medium leading-snug hover:underline"
              >
                {reel.productTitle}
              </a>

              <div className="tabular mt-1 flex items-baseline gap-2">
                <span className="text-ink text-md font-semibold">{formatMoney(price)}</span>
                {reel.discountPercent > 0 ? (
                  <>
                    <s className="text-faint text-2xs">{formatMoney(reel.mrp)}</s>
                    <span className="text-danger-600 text-2xs font-semibold">
                      {reel.discountPercent}% off
                    </span>
                  </>
                ) : null}
              </div>
            </div>

            <Button asChild size="sm" shape="pill" className="shrink-0">
              <a href={`/product/${reel.productSlug}`}>
                <ShoppingBag className="size-3.5" aria-hidden />
                Buy
              </a>
            </Button>
          </motion.div>
        </AnimatePresence>

        {/*
          The live shortcut, and only when the shop is actually open.

          This is the bridge between the two halves of the feature: a shopper
          watching a clip is already interested, and the shop is already
          standing there. Showing it when the shop is closed would be a button
          that starts a sixty-second wait for nobody.
        */}
        {reel.sellerIsLive ? (
          <a
            href={`/product/${reel.productSlug}`}
            className="mt-2.5 flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/15 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-white/25"
          >
            <Radio className="size-4" aria-hidden />
            {reel.sellerName} is live — see it now
          </a>
        ) : null}
      </div>
    </section>
  );
}

function RailButton({
  label,
  onClick,
  count,
  children,
}: {
  label: string;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex flex-col items-center gap-1 transition-transform motion-safe:active:scale-90"
    >
      {children}
      {count !== undefined ? (
        <span className="tabular text-2xs font-medium text-white/90">
          {formatCompactNumber(count)}
        </span>
      ) : null}
    </button>
  );
}
