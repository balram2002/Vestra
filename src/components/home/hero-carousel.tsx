'use client';

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import type { AnimationPlaybackControls, MotionValue, PanInfo } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Banner } from '@/domain/types';
import { cn } from '@/lib/cn';
import { spring, tween } from '@/lib/motion';

/**
 * Home hero.
 *
 * The first thing anyone sees, and the single surface most responsible for
 * whether a shop reads as expensive or cheap.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS DOES NOT USE `ui/carousel`
 * ---------------------------------------------------------------------------
 * That component is a real scroll container with a spring writing `scrollLeft`,
 * which is the right trade for a product rail: a rail is a LIST, people flick
 * through it, and the platform's own momentum beats anything written by hand.
 *
 * A hero is not a list. It advances on a timer, it wraps around, and the
 * movement is the point -- it is a title sequence, not a scrollbar. Driving
 * that through a scroll container fights the browser on three fronts at once:
 * snapping has to be suspended mid-animation, a wrap from the last slide to the
 * first is a jump the length of the whole track, and an interrupted autoplay
 * leaves the scroller somewhere between two snap points.
 *
 * So the hero owns its transport: ONE transform, driven by ONE spring.
 *
 * ---------------------------------------------------------------------------
 * HOW THE WRAP WORKS, AND WHY NOTHING EVER TELEPORTS ON SCREEN
 * ---------------------------------------------------------------------------
 * `page` is an unbounded integer, not an index -- it counts steps taken, and it
 * may go negative. The slide shown at a page is `page mod count`, so the track
 * can travel forever in either direction and "last to first" is one step
 * forward like any other.
 *
 * Each slide is then placed at the page NEAREST the one currently at rest, by
 * shortest circular distance. The furthest slide from the viewer is therefore
 * the one whose placement changes when a move completes -- and it is off screen
 * by definition, so the reshuffle is invisible. Placements are computed from
 * the SETTLED page rather than the target, so nothing moves under a spring
 * that is still running.
 *
 * A JUMP TO ANY SLIDE takes the shorter way round for the same reason: the
 * destination has to be a placed slide, or the track would travel into empty
 * space and land on nothing. With five slides, jumping from the first to the
 * last arrives from the left, in one step, which is also what it means.
 *
 * With fewer than three slides there is no "far side" to hide a reshuffle in,
 * so the wrap is switched off and the track simply clamps.
 *
 * ---------------------------------------------------------------------------
 * EVERY WAY IN, ONE WAY THROUGH
 * ---------------------------------------------------------------------------
 * Autoplay, the arrows, the dots, the keyboard and the release of a drag all
 * call `travel`, so there is a single definition of how this thing moves and a
 * single running animation to interrupt. A drag that ends where it started
 * springs back through the same call.
 *
 * Autoplay runs every three seconds and pauses during a drag, in a hidden tab,
 * off-screen, or when reduced motion is requested. Slide chips show progress.
 */

const AUTOPLAY_MS = 3000;

/** How far a drag must go, as a fraction of a slide, to count as a move. */
const DRAG_THRESHOLD = 0.22;

/** Seconds of a fling projected forward, so a flick beats the threshold. */
const FLING_PROJECTION = 0.12;

export function HeroCarousel({ banners }: { banners: Banner[] }) {
  const shown = banners.slice(0, 5);
  const count = shown.length;

  if (count === 0) return null;
  return <Hero shown={shown} count={count} />;
}

function Hero({ shown, count }: { shown: Banner[]; count: number }) {
  const reduced = useReducedMotion() ?? false;
  const wrap = count >= 3;

  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const running = useRef<AnimationPlaybackControls | null>(null);

  const x = useMotionValue(0);
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);

  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  /** The page the placements are measured from. Only a finished move moves it. */
  const [settled, setSettled] = useState(0);

  const [dragging, setDragging] = useState(false);
  const [awake, setAwake] = useState(true);

  const current = ((page % count) + count) % count;

  /* ------------------------------------------------------------ measuring */

  /*
   * One slide's width IS the step.
   *
   * Each slide carries its own trailing gap, so the measured width already
   * includes it and there is no breakpoint arithmetic duplicated in JavaScript
   * -- the CSS stays the single source of how wide a slide is.
   *
   * Only the TRACK needs this number. Slides place themselves in percentages
   * of their own width, so they are already in the right places on the very
   * first paint, before any measuring has happened.
   */
  useEffect(() => {
    const slide = track.current?.querySelector<HTMLElement>('[data-slide]');
    if (!slide) return;

    const measure = () => {
      const width = slide.offsetWidth;
      stepRef.current = width;
      setStep(width);
      // Keep the current slide in place across a resize or an orientation
      // change; recomputing the target is cheaper than re-running the spring.
      x.set(-pageRef.current * width);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(slide);
    return () => observer.disconnect();
  }, [x]);

  /* -------------------------------------------------------------- moving */

  const travel = useCallback(
    (to: number) => {
      const width = stepRef.current;
      const target = -to * width;

      pageRef.current = to;
      setPage(to);

      running.current?.stop();

      if (reduced || width === 0) {
        x.set(target);
        setSettled(to);
        return;
      }

      running.current = animate(x, target, {
        ...spring.glide,
        onComplete: () => setSettled(to),
      });
    },
    [reduced, x],
  );

  const step1 = useCallback(
    (direction: 1 | -1) => {
      const next = pageRef.current + direction;
      if (wrap) {
        travel(next);
        return;
      }
      // Clamped: at an end, going further is a no-op rather than a dead spring.
      travel(Math.min(count - 1, Math.max(0, next)));
    },
    [count, travel, wrap],
  );

  /** Where a slide sits, in pages, relative to the settled page. */
  const placementOf = useCallback(
    (index: number) => {
      if (!wrap) return index;
      const base = ((settled % count) + count) % count;
      const ahead = (index - base + count) % count;
      const half = Math.floor(count / 2);
      return settled + (ahead > half ? ahead - count : ahead);
    },
    [count, settled, wrap],
  );

  const goTo = useCallback((index: number) => travel(placementOf(index)), [placementOf, travel]);

  /* ------------------------------------------------------------ autoplay */

  /*
   * NOT paused by a resting pointer.
   *
   * Hover-to-pause is the textbook rule and it was wrong here: on a desktop the
   * pointer sits over the middle of the window, which is exactly where the hero
   * is, so autoplay never ran at all. Everything that indicates real intent
   * still stops it -- a finger on the panel, a hidden tab, or the hero scrolled
   * out of view. Focus after clicking an arrow must not stop autoplay forever.
   */
  const paused = dragging || !awake || reduced || count < 2;

  /*
   * `page` is in the dependencies, and that is the whole reset.
   *
   * Without it the timer keeps its own rhythm: someone picks a slide from the
   * dots, and a tick left over from before whips it away half a second later.
   * Re-running on every move gives each slide its full three seconds however
   * it was arrived at.
   */
  useEffect(() => {
    if (paused || step === 0) return;
    const timer = window.setInterval(() => step1(1), AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [paused, step, step1, page]);

  // A hidden tab must not burn through the slides in the background, and an
  // off-screen hero has nobody watching it.
  useEffect(() => {
    const onVisibility = () => setAwake(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);

    const node = viewport.current;
    const observer = node
      ? new IntersectionObserver(([entry]) => setAwake(entry.isIntersecting && !document.hidden), {
          threshold: 0.35,
        })
      : null;
    if (node && observer) observer.observe(node);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
    };
  }, []);

  /* --------------------------------------------------------------- input */

  const onDragEnd = (_event: unknown, info: PanInfo) => {
    setDragging(false);
    const width = stepRef.current || 1;
    const projected = info.offset.x + info.velocity.x * FLING_PROJECTION;

    if (projected < -width * DRAG_THRESHOLD) step1(1);
    else if (projected > width * DRAG_THRESHOLD) step1(-1);
    // Not far enough: the same call springs it back where it came from.
    else travel(pageRef.current);
  };

  return (
    <section
      className="gutter shell-max pt-3 sm:pt-4"
      aria-roledescription="carousel"
      aria-label="Featured collections"
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          step1(1);
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          step1(-1);
        }
      }}
    >
      <div
        ref={viewport}
        className="relative overflow-hidden"
      >
        <motion.div
          ref={track}
          /*
           * The edge swipe must not fire here.
           *
           * This track handles its own horizontal gesture in JavaScript, so it
           * declares `pan-y` to the browser -- which looks like a vertical-only
           * surface to anything walking the DOM. The marker says outright that
           * sideways belongs to the hero.
           */
          data-no-swipe
          className="relative touch-pan-y"
          style={{ x }}
          drag={count > 1 ? 'x' : false}
          dragElastic={0.1}
          dragMomentum={false}
          onPointerDown={() => setDragging(true)}
          /* A tap that never became a drag still has to release the pause. */
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onDragEnd={onDragEnd}
        >
          {/*
            The track has no height of its own: every slide is absolutely
            placed, so the first one is left in flow to give the section its
            height. Sizing the track by hand would need the aspect ratio
            duplicated in three breakpoints.
          */}
          {shown.map((banner, index) => (
            <Slide
              key={banner.id}
              banner={banner}
              first={index === 0}
              placement={placementOf(index)}
              step={step}
              x={x}
              current={index === current}
              total={count}
              index={index}
              reduced={reduced}
            />
          ))}
        </motion.div>

      </div>

      {count > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-3">
          {/*
            The arrows sit WITH the other controls rather than over the panel.

            Floating them at the panel's edges put a glass disc on top of the
            headline at every width where the copy reached the left gutter --
            and a control that covers the words it is meant to reveal is worse
            than one further away. Here they are grouped with the pause and the
            dots, which is also where a hand already is once it has used either.
          */}
          <Arrow side="left" onClick={() => step1(-1)} />

          <ol className="flex items-center gap-1.5">
            {shown.map((banner, index) => (
              <li key={banner.id}>
                <button
                  type="button"
                  onClick={() => goTo(index)}
                  aria-label={`Go to slide ${index + 1} of ${count}`}
                  aria-current={index === current ? 'true' : undefined}
                  className={cn(
                    'hero-progress relative block h-2 overflow-hidden rounded-full transition-all duration-(--duration-base)',
                    'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-4',
                    index === current ? 'bg-line-strong w-9' : 'bg-line-strong hover:bg-muted w-2',
                  )}
                >{index === current ? <span key={page} className={cn('hero-progress-fill absolute inset-y-0 left-0 bg-ink', paused && 'paused')} style={{ animationDuration: `${AUTOPLAY_MS}ms` }} /> : null}</button>
              </li>
            ))}
          </ol>

          <Arrow side="right" onClick={() => step1(1)} />

        </div>
      ) : null}

      {/* Announced only when it is not moving on its own; otherwise it would
          interrupt a screen reader every three seconds. */}
      <p className="sr-only" aria-live={paused ? 'polite' : 'off'}>
        Slide {current + 1} of {count}: {shown[current]?.headline}
      </p>
    </section>
  );
}

/* ---------------------------------------------------------------- pieces */

function Arrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous slide' : 'Next slide'}
      className={cn(
        // Pointer devices only: a thumb has the whole panel to swipe.
        'text-muted hover:text-ink hidden size-8 shrink-0 place-items-center rounded-full lg:grid',
        'hover:bg-sunken transition-colors duration-(--duration-base)',
        'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

/**
 * The copy stack's entrance.
 *
 * Each line rises 18px on a spring, 70ms apart, and the whole set RE-RUNS every
 * time its slide becomes current -- which is what makes an advance feel
 * authored rather than mechanical.
 *
 * `spring.glide` rather than a tween: it is the same curve the track travels
 * on, so the copy settles in sympathy with the slide instead of on an unrelated
 * timeline. Opacity gets a plain tween, because a fade is not travelling
 * through space -- see the note at the top of `lib/motion`.
 */
const COPY_STACK = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } },
};

const COPY_LINE = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { ...spring.glide, opacity: tween.slow } },
};

function Slide({
  banner,
  first,
  placement,
  step,
  x,
  current,
  index,
  total,
  reduced,
}: {
  banner: Banner;
  /** The one slide left in flow, which gives the track its height. */
  first: boolean;
  placement: number;
  step: number;
  x: MotionValue<number>;
  current: boolean;
  index: number;
  total: number;
  reduced: boolean;
}) {
  /*
   * 44px of counter-drift on the photograph.
   *
   * This is what stops the panel reading as a sheet of paper sliding sideways:
   * the image lags its own frame, so the frame becomes a window rather than a
   * card. Derived from the track's own position, so it follows a drag exactly
   * as it follows the spring.
   */
  const parallax = useTransform(x, (value) => {
    if (reduced || step === 0) return 0;
    const distance = (value + placement * step) / step;
    return Math.max(-1.5, Math.min(1.5, distance)) * -44;
  });

  return (
    <motion.div
      data-slide
      className={cn(
        'w-[88%] pr-3 sm:w-[84%] sm:pr-4 lg:w-[96%]',
        first ? 'relative' : 'absolute inset-y-0 left-0',
      )}
      /*
       * A percentage of the slide's OWN width, which is exactly one step --
       * so this needs no measurement and is right on the first paint.
       */
      style={{ x: `${placement * 100}%` }}
      aria-hidden={!current}
    >
      <Link
        href={banner.href}
        tabIndex={current ? undefined : -1}
        draggable={false}
        aria-roledescription="slide"
        aria-label={`${index + 1} of ${total}: ${banner.headline}`}
        className={cn(
          'group relative isolate flex overflow-hidden rounded-xl sm:rounded-2xl',
          'aspect-4/5 sm:aspect-16/10 lg:aspect-21/9',
          /*
           * A ceiling on a wide screen.
           *
           * 21:9 across a 1600px window is 685px of hero before the header,
           * which is the whole fold -- a shopper scrolls past a shop that has
           * shown them nothing to buy. The cap crops the photograph instead
           * (it is `object-cover`), and leaves the next section peeking, which
           * is what tells someone there is more.
           */
          'lg:max-h-[min(70vh,620px)]',
          'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
        )}
      >
        {/*
          The media layer is overscaled by 10%, and it has to be: the parallax
          translates it by up to 44px against its frame, and without headroom
          that drift would expose the panel's background down one side.
        */}
        <motion.div aria-hidden className="absolute inset-0 scale-110" style={{ x: parallax }}>
          {banner.mobileImageUrl ? (
            <>
              <Image
                src={banner.mobileImageUrl}
                alt={banner.alt}
                fill
                priority={first}
                sizes="88vw"
                draggable={false}
                className="object-cover transition-transform duration-(--duration-hero) ease-out motion-safe:group-hover:scale-[1.04] sm:hidden"
              />
              <Image
                src={banner.imageUrl}
                alt={banner.alt}
                fill
                priority={first}
                sizes="(max-width: 64rem) 80vw, 92vw"
                draggable={false}
                className="hidden object-cover transition-transform duration-(--duration-hero) ease-out motion-safe:group-hover:scale-[1.04] sm:block"
              />
            </>
          ) : (
            <Image
              src={banner.imageUrl}
              alt={banner.alt}
              fill
              priority={first}
              sizes="(max-width: 40rem) 88vw, (max-width: 64rem) 80vw, 92vw"
              draggable={false}
              className="object-cover transition-transform duration-(--duration-hero) ease-out motion-safe:group-hover:scale-[1.04]"
            />
          )}
        </motion.div>

        {/*
          Bottom-weighted on a phone where the copy sits under the image, and
          angled from the leading edge on a wide screen where it sits beside it.
        */}
        <div aria-hidden className="scrim absolute inset-0 sm:hidden" />
        <div aria-hidden className="scrim-start absolute inset-0 hidden sm:block" />

        <motion.div
          variants={COPY_STACK}
          initial="hidden"
          animate={reduced || current ? 'show' : 'hidden'}
          className={cn(
            'relative mt-auto w-full p-5 sm:p-9 lg:p-12',
            'sm:mt-0 sm:flex sm:max-w-2xl sm:flex-col sm:justify-center',
          )}
        >
          <motion.p
            variants={COPY_LINE}
            className="flex items-center gap-2.5 text-2xs font-semibold uppercase tracking-[0.2em] text-white/75"
          >
            {/* The rule DRAWS itself in rather than fading: a 24px hairline that
                simply appears is the one element that would look pasted on. */}
            <motion.span
              aria-hidden
              className="h-px w-6 origin-left bg-white/50"
              variants={{ hidden: { scaleX: 0 }, show: { scaleX: 1, transition: spring.glide } }}
            />
            {banner.eyebrow || 'Featured'}
          </motion.p>

          <motion.h2
            variants={COPY_LINE}
            className="headline mt-4 max-w-2xl text-4xl text-white sm:text-5xl lg:text-6xl"
          >
            {banner.headline}
          </motion.h2>

          {banner.subheadline ? (
            <motion.p
              variants={COPY_LINE}
              className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-white/85 sm:text-md"
            >
              {banner.subheadline}
            </motion.p>
          ) : null}

          {banner.ctaLabel ? (
            <motion.span
              variants={COPY_LINE}
              className={cn(
                'mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-white px-6',
                'text-sm font-semibold text-black',
                'transition-transform duration-(--duration-base) ease-(--ease-out)',
                'motion-safe:group-hover:scale-[1.03]',
                'h-11 sm:h-12',
              )}
            >
              {banner.ctaLabel}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </motion.span>
          ) : null}
        </motion.div>
      </Link>
    </motion.div>
  );
}

/**
 * The hero's placeholder.
 *
 * Exactly the geometry of the real thing at every breakpoint, so nothing on the
 * page moves when the banners land. A skeleton that guesses its own height is a
 * layout shift with extra steps.
 */
export function HeroSkeleton() {
  return (
    <section className="gutter shell-max pt-3 sm:pt-4" aria-hidden>
      {/* The same ceiling as the real panel, or the page jumps when it lands. */}
      <div className="skeleton aspect-4/5 rounded-xl sm:aspect-16/10 sm:rounded-2xl lg:aspect-21/9 lg:max-h-[min(70vh,620px)]" />
    </section>
  );
}
