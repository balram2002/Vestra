'use client';

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
import type { MotionValue, Transition } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';

/**
 * Carousel.
 *
 * A HYBRID, and the hybrid is the whole design. Two approaches are normally on
 * offer and each gives up something the other keeps:
 *
 *   native scroll-snap    momentum, rubber-banding, trackpad gestures, a real
 *                         scrollbar and correct touch behaviour, all for free
 *                         and all working before hydration — but every
 *                         programmatic move is `scrollTo({behavior:'smooth'})`,
 *                         whose curve the browser owns and which is a flat,
 *                         characterless ease that no amount of CSS can touch.
 *
 *   transform track       total control of the easing — and a reimplementation
 *                         of momentum, overscroll, snap points, keyboard
 *                         scrolling and accessibility, all of which will be
 *                         half a frame behind the platform's.
 *
 * So: the container is a real scroll container, which is what a finger and a
 * trackpad talk to. But every move the COMPONENT initiates — an arrow, a dot,
 * a keypress, autoplay, the release of a drag — is driven by a spring from
 * `lib/motion.ts` writing `scrollLeft` frame by frame, rather than handed to
 * `behavior: 'smooth'`. Touch keeps the operating system's feel; everything
 * else gets ours.
 *
 * Three details make that actually work, and each one fails silently:
 *
 *  1. CSS scroll snapping must be SUSPENDED while the spring runs. A browser
 *     asked to snap while something else writes `scrollLeft` will fight it
 *     every frame, and the slide judders to a halt instead of gliding.
 *  2. `scroll-behavior` must be `auto` on the scroller. Inherited `smooth`
 *     turns each of our per-frame writes into its own tiny animation, which is
 *     the exact jank the spring exists to avoid.
 *  3. A drag must not become a click. The pointer handler tracks distance and
 *     suppresses the click that follows a real drag, or flicking a product rail
 *     opens whichever card the finger happened to lift over.
 *
 * ACCESSIBILITY, which carousels usually get wrong:
 *
 *   - the scroller is focusable and labelled — a scrollable region no keyboard
 *     can reach is unreachable content;
 *   - arrow keys move by a slide, so the keyboard gets the same spring as the
 *     buttons rather than the browser's line-scroll;
 *   - each slide announces its position, because "3 of 8" is the one thing a
 *     screen-reader user cannot see;
 *   - arrows are real buttons that DISABLE at the ends rather than wrapping,
 *     because silent wrapping makes it impossible to tell where a list ends;
 *   - autoplay is opt-in, pauses on hover, focus, touch and a hidden tab, is
 *     never enabled under `prefers-reduced-motion`, and always ships a pause
 *     control. Motion that moves under a reader is hostile, and a hero that
 *     changes while it is being read is the most-complained-about pattern on
 *     the web.
 */

export interface CarouselProps {
  children: React.ReactNode;
  /** Names the region. Required: an unlabelled scroller announces as nothing. */
  label: string;
  /** Previous/next buttons. Pointer only — touch swipes instead. */
  arrows?: boolean;
  /** Position dots. Best for a small number of large slides. */
  dots?: boolean;
  /**
   * A slim progress bar instead of dots.
   *
   * For a long rail, where twenty dots is not an indicator but a second row of
   * controls. Shows how far along the row is, which is the only thing anyone
   * actually reads off a rail's indicator.
   */
  progress?: boolean;
  /**
   * A "03 / 08" readout.
   *
   * The indicator that survives any slide count, and the right choice for an
   * editorial hero where dots would compete with the copy sitting over the
   * image.
   */
  counter?: boolean;
  /**
   * Fade the arrows in on hover rather than showing them at rest.
   *
   * For a product rail, where two permanent glass discs sitting over the
   * merchandise are two pieces of chrome the shopper did not ask for. Never for
   * a hero: there the arrows are the primary way anyone moves it.
   *
   * Keyboard focus always brings them back — see `ArrowButton`.
   */
  revealArrows?: boolean;
  /** Extra classes for the indicator row, e.g. to pull it onto the slide. */
  indicatorClassName?: string;
  /** Advance on a timer. Ignored under reduced motion. Always ships a pause. */
  autoPlay?: boolean;
  /** Milliseconds between automatic advances. */
  interval?: number;
  /** Dissolve the leading and trailing edges instead of cutting slides off. */
  fadeEdges?: boolean;
  className?: string;
  contentClassName?: string;
  /**
   * Scroll to this slide when it changes.
   *
   * Deliberately not full control: the scroll position stays the source of
   * truth, because it is the thing a finger moves. This is a REQUEST to
   * scroll, which is what an external control — a thumbnail strip, a "next
   * colour" swatch — actually wants.
   */
  activeIndex?: number;
  /** Fired when the scroller settles on a different slide. */
  onActiveChange?: (index: number) => void;
}

/**
 * What a slide needs in order to react to its own position.
 *
 * `scrollX` is the LIVE scroll offset as a motion value, written on every
 * scroll event — including the frames a spring is driving. A slide subscribes
 * to it and derives its own transforms, so depth and parallax cost zero React
 * renders no matter how fast the rail is moving. Putting the scroll offset in
 * state instead would re-render every slide sixty times a second, which is
 * exactly the thing that makes a "premium" carousel drop frames.
 *
 * `viewport` is the scroller's own width, needed to work out where the centre
 * is. It is a motion value rather than a number so a resize does not have to
 * re-render the tree to be picked up.
 */
interface CarouselContextValue {
  scrollX: MotionValue<number>;
  viewport: MotionValue<number>;
  reduced: boolean;
}

const CarouselCtx = createContext<CarouselContextValue | null>(null);

/** Distance in px past which a pointer gesture counts as a drag, not a click. */
const DRAG_THRESHOLD = 6;

/**
 * How far a flick is projected past the finger's release point.
 *
 * This is the standard deceleration projection — velocity multiplied by a time
 * constant — and 0.28s is tuned to land roughly where iOS does. Too high and a
 * light flick throws the rail to its end; too low and a hard flick stops dead
 * under the finger, which feels like the rail is sticky.
 */
const FLING_PROJECTION_MS = 280;

export function Carousel({
  children,
  label,
  arrows = true,
  dots = false,
  progress = false,
  counter = false,
  revealArrows = false,
  indicatorClassName,
  autoPlay = false,
  interval = 5200,
  fadeEdges = false,
  className,
  contentClassName,
  activeIndex,
  onActiveChange,
}: CarouselProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;
  const regionId = useId();

  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [active, setActive] = useState(0);
  const [count, setCount] = useState(0);
  const [ratio, setRatio] = useState(0);
  const [paused, setPaused] = useState(false);
  const [playing, setPlaying] = useState(autoPlay && !reduced);

  /*
   * The scroll position, as a motion value.
   *
   * Springs animate a value, not a DOM property, so this mirrors `scrollLeft`
   * and a subscriber writes each frame back to the element. Keeping it in a
   * ref-like motion value rather than in state matters: a 60fps animation
   * through `setState` is 60 React renders a second for something no component
   * needs to re-render for.
   */
  const position = useMotionValue(0);

  /*
   * The live scroll offset and the scroller's width, published to the slides.
   *
   * These are written from the scroll listener and the ResizeObserver below,
   * never from React state, so a slide can derive depth and parallax from them
   * at compositor rate while the component itself re-renders only when an
   * indicator actually changes.
   */
  const scrollX = useMotionValue(0);
  const viewport = useMotionValue(0);
  const running = useRef<ReturnType<typeof animate> | null>(null);
  /**
   * Tear-down for whatever the current spring set up.
   *
   * A running animation owns two things that must be undone exactly once: the
   * subscription writing frames to `scrollLeft`, and the suspended scroll-snap.
   * Holding them in a ref rather than in the animation's own callbacks is what
   * makes an INTERRUPTED animation clean up — `onComplete` never fires when a
   * second gesture stops the first, and the snap would stay off for good.
   */
  const teardown = useRef<() => void>(() => {});

  /** The settled slide, readable from a timer without making it a dependency. */
  const activeRef = useRef(0);

  /* ------------------------------------------------------------- geometry */

  /**
   * The `scrollLeft` that puts each slide at the start of the SNAPPORT.
   *
   * Not simply `offsetLeft`. A scroller carrying the page gutter has
   * `padding-inline`, and `.gutter` sets a matching `scroll-padding-inline`, so
   * CSS snapping aligns a slide to the content box rather than the padding box.
   * `offsetLeft` is measured from the padding box, so using it directly leaves
   * every spring-driven move one gutter short — the browser then re-snaps the
   * moment the animation ends and the slide visibly jumps sideways by 32px.
   *
   * Subtracting the padding puts our target and the browser's on the same
   * point, which is what makes an arrow press land exactly where a swipe does.
   */
  const offsets = useCallback((): number[] => {
    const node = scroller.current;
    if (!node) return [];

    // One layout read per call, not per slide. Called on gestures, never per
    // frame, so this is nowhere near a hot path.
    const inset = Number.parseFloat(getComputedStyle(node).paddingInlineStart) || 0;

    return Array.from(node.children, (child) => {
      const slide = child as HTMLElement;
      return slide.offsetLeft - node.offsetLeft - inset;
    });
  }, []);

  const nearestOffset = useCallback(
    (target: number): number => {
      const node = scroller.current;
      if (!node) return target;
      const max = node.scrollWidth - node.clientWidth;
      const clamped = Math.max(0, Math.min(max, target));

      let best = clamped;
      let distance = Number.POSITIVE_INFINITY;
      for (const offset of offsets()) {
        const bounded = Math.max(0, Math.min(max, offset));
        const d = Math.abs(bounded - clamped);
        if (d < distance) {
          distance = d;
          best = bounded;
        }
      }
      return best;
    },
    [offsets],
  );

  /**
   * Suspend CSS snapping.
   *
   * A browser asked to snap while JavaScript writes `scrollLeft` fights it on
   * every frame. Returns the restore function rather than pairing two calls,
   * so a caller cannot forget the second half.
   */
  const suspendSnap = useCallback(() => {
    const node = scroller.current;
    if (!node) return () => {};
    node.style.scrollSnapType = 'none';
    return () => {
      // Restoring on the next frame lets the final scroll position settle
      // first; restoring synchronously makes the browser re-snap and undo the
      // last pixel or two of the animation.
      requestAnimationFrame(() => {
        if (scroller.current) scroller.current.style.scrollSnapType = '';
      });
    };
  }, []);

  /** Run the spring from wherever the scroller is to a given offset. */
  const springTo = useCallback(
    (target: number, config: Transition = spring.glide) => {
      const node = scroller.current;
      if (!node) return;

      // Stop the previous spring and undo what it set up, in that order.
      running.current?.stop();
      teardown.current();
      teardown.current = () => {};

      if (reduced) {
        node.scrollLeft = target;
        return;
      }

      const restore = suspendSnap();
      position.set(node.scrollLeft);

      const unsubscribe = position.on('change', (value) => {
        if (scroller.current) scroller.current.scrollLeft = value;
      });

      const done = () => {
        unsubscribe();
        restore();
        teardown.current = () => {};
      };
      teardown.current = done;

      running.current = animate(position, target, { ...config, onComplete: done });
    },
    [position, reduced, suspendSnap],
  );

  /* ------------------------------------------------------------ measuring */

  /**
   * Derive every indicator from the scroll position.
   *
   * The one-pixel tolerance is not slack: browsers report fractional scroll
   * offsets at non-integer zoom levels and on high-DPI displays, and an exact
   * comparison leaves the "next" arrow enabled at the very end of the row.
   */
  const measure = useCallback(() => {
    const node = scroller.current;
    if (!node) return;

    const max = node.scrollWidth - node.clientWidth;
    const left = node.scrollLeft;

    // Published first, and unconditionally: the slides' physics must track the
    // scroll even on frames where no indicator state changes.
    scrollX.set(left);
    viewport.set(node.clientWidth);

    setAtStart(left <= 1);
    setAtEnd(left >= max - 1);
    setRatio(max > 0 ? Math.min(1, Math.max(0, left / max)) : 0);

    const all = offsets();
    if (all.length === 0) return;
    setCount(all.length);

    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    for (const [index, offset] of all.entries()) {
      const d = Math.abs(offset - left);
      if (d < best) {
        best = d;
        nearest = index;
      }
    }

    if (activeRef.current !== nearest) {
      activeRef.current = nearest;
      setActive(nearest);
      onActiveChange?.(nearest);
    }
  }, [offsets, onActiveChange, scrollX, viewport]);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;

    measure();
    node.addEventListener('scroll', measure, { passive: true });

    // Slides change width at breakpoints and as images decode.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const child of Array.from(node.children)) observer.observe(child);

    return () => {
      node.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure, children]);

  // Nothing should keep animating — or keep a subscription — after unmount.
  useEffect(
    () => () => {
      running.current?.stop();
      teardown.current();
    },
    [],
  );

  /* -------------------------------------------------------------- commands */

  const goTo = useCallback(
    (index: number, config?: Transition) => {
      const all = offsets();
      const node = scroller.current;
      if (!node || all.length === 0) return;
      const max = node.scrollWidth - node.clientWidth;
      const bounded = Math.max(0, Math.min(all.length - 1, index));
      springTo(Math.max(0, Math.min(max, all[bounded] ?? 0)), config);
    },
    [offsets, springTo],
  );

  /**
   * Move by one viewport of the scroller, then land on a slide edge.
   *
   * Paging by exactly `clientWidth` leaves a slide half-cut at the leading
   * edge, which then reads as the active one to `measure` and makes the dots
   * disagree with what is on screen. Snapping the paged target to the nearest
   * slide costs nothing and keeps the indicator honest.
   */
  const page = useCallback(
    (direction: 1 | -1) => {
      const node = scroller.current;
      if (!node) return;
      const step = node.clientWidth * 0.86;
      springTo(nearestOffset(node.scrollLeft + direction * step));
    },
    [nearestOffset, springTo],
  );

  /*
   * Follow an external request to change slide.
   *
   * Guarded on the current position so the carousel does not fight its own
   * `onActiveChange`: a swipe reports a new index, the parent echoes it back,
   * and without the guard the scroller springs to where it already is.
   */
  useEffect(() => {
    if (activeIndex === undefined || activeIndex === active) return;
    goTo(activeIndex);
    // `active` is deliberately omitted: this must run when the REQUEST changes,
    // not every time the scroll position does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  /* ------------------------------------------------------------- dragging */

  /**
   * Pointer drag, for a mouse and a pen.
   *
   * Touch is deliberately excluded and handed to the platform: the browser's
   * own touch scrolling has momentum, rubber-banding and a scrollbar we would
   * otherwise have to rebuild, and it runs on the compositor rather than in
   * JavaScript. A rail that "handles" touch itself is a rail that drops frames
   * on the device that matters most.
   */
  const drag = useRef({
    active: false,
    startX: 0,
    startScroll: 0,
    lastX: 0,
    lastT: 0,
    velocity: 0,
    moved: false,
    restore: () => {},
  });

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    // Only the primary button drags; a middle-click is autoscroll and a
    // right-click is a context menu.
    if (event.button !== 0) return;

    const node = scroller.current;
    if (!node) return;

    running.current?.stop();
    setPaused(true);

    drag.current = {
      active: true,
      startX: event.clientX,
      startScroll: node.scrollLeft,
      lastX: event.clientX,
      lastT: performance.now(),
      velocity: 0,
      moved: false,
      restore: suspendSnap(),
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const node = scroller.current;
    if (!state.active || !node) return;

    const dx = event.clientX - state.startX;
    if (!state.moved && Math.abs(dx) > DRAG_THRESHOLD) {
      state.moved = true;
      // Capture only once the gesture is definitely a drag, so a plain click
      // on a card inside the rail is never stolen.
      node.setPointerCapture(event.pointerId);
    }
    if (!state.moved) return;

    const now = performance.now();
    const dt = now - state.lastT;
    if (dt > 0) {
      // px per millisecond, smoothed a little so one stuttering frame near the
      // release does not define the whole flick.
      const instant = (event.clientX - state.lastX) / dt;
      state.velocity = state.velocity * 0.7 + instant * 0.3;
    }
    state.lastX = event.clientX;
    state.lastT = now;

    node.scrollLeft = state.startScroll - dx;
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const node = scroller.current;
    if (!state.active || !node) return;

    state.active = false;
    setPaused(false);
    if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
    state.restore();

    if (!state.moved) return;

    /*
     * Project where the flick was heading, then land on the nearest slide.
     *
     * Dragging leftwards produces a negative velocity and should carry the
     * scroll position to the RIGHT, hence the sign flip. Without the snap the
     * rail stops between two cards, which is the single thing that makes a
     * custom carousel feel unfinished.
     */
    const projected = node.scrollLeft - state.velocity * FLING_PROJECTION_MS;
    springTo(nearestOffset(projected), spring.fling);
  };

  /**
   * Swallow the click that follows a real drag.
   *
   * Capture phase, so it never reaches the card underneath. Without it, every
   * flick of a product rail opens whichever product the pointer was over when
   * the button came up.
   */
  const onClickCapture = (event: React.MouseEvent) => {
    if (!drag.current.moved) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current.moved = false;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(active + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(active - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      goTo(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      goTo(count - 1);
    }
  };

  /* -------------------------------------------------------------- autoplay */

  useEffect(() => {
    if (!playing || reduced || paused || count < 2) return;

    const tick = window.setInterval(() => {
      /*
       * Wrap at the end. Wrapping is acceptable for AUTOplay in a way it is
       * not for an arrow press: nobody is counting, and a hero that stops dead
       * on its last slide looks broken.
       *
       * The current slide is read from a ref rather than from state so the
       * timer does not have to be torn down and rebuilt on every advance —
       * which would reset the interval and make the last slide linger.
       */
      const current = activeRef.current;
      goTo(current >= count - 1 ? 0 : current + 1);
    }, interval);

    return () => window.clearInterval(tick);
  }, [playing, reduced, paused, count, interval, goTo]);

  // A tab nobody is looking at must not keep advancing; it wastes frames and
  // means the hero has moved on by the time anyone comes back.
  useEffect(() => {
    if (!autoPlay) return;
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [autoPlay]);

  /* ---------------------------------------------------------------- render */

  const scrollable = count > 1 && !(atStart && atEnd);
  const showArrows = arrows && scrollable;

  const ctx = useMemo<CarouselContextValue>(
    () => ({ scrollX, viewport, reduced }),
    [scrollX, viewport, reduced],
  );

  const pauseProps = useMemo(
    () =>
      autoPlay
        ? {
            onMouseEnter: () => setPaused(true),
            onMouseLeave: () => setPaused(false),
            onFocusCapture: () => setPaused(true),
            onBlurCapture: () => setPaused(false),
            onTouchStart: () => setPaused(true),
          }
        : {},
    [autoPlay],
  );

  return (
    <section
      className={cn('group/carousel relative', className)}
      aria-roledescription="carousel"
      aria-label={label}
      {...pauseProps}
    >
      <CarouselCtx.Provider value={ctx}>
      <div
        ref={scroller}
        id={regionId}
        role="group"
        aria-label={`${label}, scrollable`}
        /*
         * Focusable only when there is something to scroll. A tab stop that
         * does nothing is a tab stop someone has to get past on every visit.
         */
        tabIndex={scrollable ? 0 : -1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onKeyDown={onKeyDown}
        className={cn(
          'flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain',
          // See the header comment: inherited `smooth` fights the spring.
          '[scroll-behavior:auto]',
          // The scrollbar is noise beside dots and arrows that already say the
          // same thing. The region stays keyboard-scrollable regardless.
          'no-scrollbar',
          'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
          // A grabbable surface should say so, but only where there is a
          // pointer to grab with.
          scrollable && 'md:cursor-grab md:active:cursor-grabbing',
          fadeEdges && 'md:fade-edges-x',
          contentClassName,
        )}
      >
        {children}
      </div>
      </CarouselCtx.Provider>

      {showArrows ? (
        <>
          <ArrowButton
            side="left"
            disabled={atStart}
            onClick={() => page(-1)}
            label={label}
            reveal={revealArrows}
          />
          <ArrowButton
            side="right"
            disabled={atEnd}
            onClick={() => page(1)}
            label={label}
            reveal={revealArrows}
          />
        </>
      ) : null}

      {(dots || progress || counter || autoPlay) && count > 1 ? (
        <div className={cn('mt-4 flex items-center justify-center gap-3', indicatorClassName)}>
          {autoPlay && !reduced ? (
            <PlayPause
              playing={playing}
              onToggle={() => setPlaying((p) => !p)}
              label={label}
              interval={interval}
              cycle={active}
            />
          ) : null}

          {dots ? <Dots count={count} active={active} onSelect={(index) => goTo(index)} /> : null}

          {progress ? <ProgressBar ratio={ratio} /> : null}

          {counter ? <Counter active={active} count={count} /> : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * What a slide publishes to its own contents.
 *
 * `progress` is 0 when the slide is centred in the scroller, -1 one full
 * slide-width to the left, +1 one width to the right. Everything a slide's
 * children might want to do with position — parallax, a tilt, a masked reveal —
 * is derived from this one number.
 */
interface SlideContextValue {
  progress: MotionValue<number>;
  reduced: boolean;
}

const SlideCtx = createContext<SlideContextValue | null>(null);

/**
 * Counter-drift for a slide's media layer.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A HOOK AND NOT A PROP ON `CarouselItem`
 * ---------------------------------------------------------------------------
 * The obvious API is `<CarouselItem parallax={56}>`, with the item translating
 * its own children. That is wrong, and it took building it to see why: a
 * slide's children ARE the panel, so translating them moves the panel inside
 * its own layout box. The gaps between slides go uneven, and a hero panel
 * drifts far enough to overlap the one beside it.
 *
 * Parallax has to move a layer INSIDE the slide, underneath something that
 * clips — and only the slide's own content knows which layer that is. So the
 * carousel publishes the position, and the content decides what moves.
 *
 * ---------------------------------------------------------------------------
 * USING IT
 * ---------------------------------------------------------------------------
 * Apply the returned value as `x` on a media layer that is (a) inside an
 * element with `overflow-hidden`, and (b) overscaled by enough to cover the
 * travel. A layer at its natural size will expose the background at its
 * trailing edge as it drifts.
 *
 * The headroom needed is `distance` pixels on each side, so a 40px drift on a
 * 1000px panel wants about 8% of overscale. `scale-110` covers every case in
 * this codebase with room to spare.
 *
 * Returns a motionless zero outside a carousel, or under reduced motion, so a
 * component using it renders correctly anywhere.
 */
export function useSlideParallax(distance: number): MotionValue<number> {
  const slide = useContext(SlideCtx);
  const fallback = useMotionValue(0);
  const progress = slide?.progress ?? fallback;

  return useTransform(progress, (value) => (!slide || slide.reduced ? 0 : value * distance));
}

/**
 * One slide.
 *
 * Width is a plain class so each caller chooses how many are visible per
 * breakpoint — a product rail wants 2.2 on a phone so the cut edge of the third
 * card says "there is more", while a hero wants one and a peek.
 *
 * ---------------------------------------------------------------------------
 * DEPTH
 * ---------------------------------------------------------------------------
 * With `depth` set, the slide stops being a rectangle that translates and
 * starts behaving like an object at a distance: it recedes and dims as it
 * leaves the centre. Scaling the WHOLE slide is correct here — unlike parallax,
 * which must move a layer inside it — because a slide receding is a statement
 * about the slide itself.
 *
 * It suits a hero, where one panel is the subject and its neighbours genuinely
 * are behind. It is wrong for a product rail: four cards visible at once are all
 * equally shoppable, and dimming three of them makes the row look half-loaded.
 *
 * ---------------------------------------------------------------------------
 * HOW THE POSITION IS DERIVED
 * ---------------------------------------------------------------------------
 *     progress = (slideCentre - viewportCentre) / slideWidth
 *
 * Computed inside `useTransform`, so it recalculates on the compositor's
 * schedule as `scrollX` changes and NEVER through React. A slide's own geometry
 * is measured on mount and again on resize, held in motion values for the same
 * reason.
 *
 * Under `prefers-reduced-motion` every transform collapses to its resting value
 * and the slide is a plain box again. The effect is decorative; the content is
 * identical without it.
 */
export function CarouselItem({
  children,
  className,
  index,
  total,
  depth = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** 1-based. Supplied with `total` to announce position. */
  index?: number;
  total?: number;
  /** Recede and dim as the slide leaves the centre. See the note above. */
  depth?: boolean;
}) {
  const ctx = useContext(CarouselCtx);
  const ref = useRef<HTMLDivElement>(null);

  const slideLeft = useMotionValue(0);
  const slideWidth = useMotionValue(1);

  /*
   * `useEffect`, not `useLayoutEffect`.
   *
   * This module is `'use client'`, but a client component is still rendered on
   * the server for the initial HTML — and `useLayoutEffect` logs a warning
   * there, on every slide, on every request. Measuring after paint is safe only
   * because the transform below refuses to do anything until the scroller has
   * published a real width, so there is no unmeasured frame to catch.
   */
  useEffect(() => {
    const node = ref.current;
    if (!node || !ctx) return;

    const measure = () => {
      // `offsetLeft` is relative to the offset parent, which is the scroll
      // container — the same frame `scrollX` is measured in, so the two are
      // directly comparable without walking the tree.
      slideLeft.set(node.offsetLeft);
      // Guarded against zero: it is a divisor, and a slide with no width yet
      // would otherwise produce NaN transforms that persist after it has one.
      slideWidth.set(node.offsetWidth || 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ctx, slideLeft, slideWidth]);

  const reduced = ctx?.reduced ?? true;

  const progress = useTransform<number, number>(
    [ctx?.scrollX ?? slideLeft, ctx?.viewport ?? slideWidth, slideLeft, slideWidth],
    ([scroll, view, left, width]: number[]) => {
      /*
       * `view` is zero until the carousel's own ResizeObserver has run.
       *
       * Without this guard the first frame computes a progress of 0.5 from
       * placeholder geometry, and every slide mounts visibly scaled down and
       * dimmed before snapping to its real value — a flash on every page load.
       * At rest, an unmeasured slide is simply a slide.
       */
      if (!width || !view) return 0;
      const slideCentre = left + width / 2;
      const viewCentre = scroll + view / 2;
      return (slideCentre - viewCentre) / width;
    },
  );

  // Clamped so a rail scrolled far past a slide does not keep scaling it into
  // nothing; past one slide-width the treatment is already at its limit.
  const distance = useTransform(progress, (value) => Math.min(Math.abs(value), 1));

  const scale = useTransform(distance, [0, 1], [1, 0.94]);
  const opacity = useTransform(distance, [0, 1], [1, 0.55]);

  const slideCtx = useMemo<SlideContextValue>(() => ({ progress, reduced }), [progress, reduced]);

  return (
    <SlideCtx.Provider value={slideCtx}>
      <motion.div
        ref={ref}
        className={cn('shrink-0 snap-start', className)}
        style={depth && !reduced ? { scale, opacity } : undefined}
        role="group"
        aria-roledescription="slide"
        aria-label={index && total ? `${index} of ${total}` : undefined}
      >
        {children}
      </motion.div>
    </SlideCtx.Provider>
  );
}

/* ------------------------------------------------------------- indicators */

function Dots({
  count,
  active,
  onSelect,
}: {
  count: number;
  active: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex items-center">
      {Array.from({ length: count }, (_, index) => (
        /*
          The dot is 6px; the BUTTON is 44.

          A 6px control is unaimable. Padding the hit area rather than growing
          the dot keeps the indicator as quiet as it should be — it is a
          position readout, not a call to action — while giving a thumb
          something it can actually land on.
        */
        <button
          key={index}
          type="button"
          onClick={() => onSelect(index)}
          aria-label={`Go to slide ${index + 1} of ${count}`}
          aria-current={index === active}
          className={cn(
            'group grid size-9 shrink-0 place-items-center rounded-md',
            'focus-visible:outline-accent focus-visible:outline-2 focus-visible:-outline-offset-2',
          )}
        >
          {/*
            One fixed width, squashed with `scaleX`.

            Animating `w-1.5` to `w-6` animates a layout property, which
            relayouts the whole indicator row on every slide change. The pill is
            always 24px and is scaled down when inactive — visually identical,
            and it composites.
          */}
          <span
            aria-hidden
            className={cn(
              'h-1.5 w-6 rounded-full origin-center',
              'transition-[transform,background-color] duration-(--duration-slow) ease-(--ease-spring)',
              index === active
                ? 'bg-ink scale-x-100'
                : 'bg-line-strong scale-x-[0.28] group-hover:bg-line-bold',
            )}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * A scrub readout for a long rail.
 *
 * Not interactive, and deliberately so: a 3px-tall drag target is a promise
 * nobody can keep, and the arrows and the rail itself already move it.
 * `aria-hidden` because the slide count is announced on the slides themselves.
 */
function ProgressBar({ ratio }: { ratio: number }) {
  return (
    <div className="bg-sunken h-[3px] w-24 overflow-hidden rounded-full" aria-hidden>
      <div
        className="bg-ink h-full w-1/3 rounded-full transition-transform duration-(--duration-base) ease-(--ease-out)"
        // Travels across the remaining two thirds of the track.
        style={{ transform: `translateX(${ratio * 200}%)` }}
      />
    </div>
  );
}

/**
 * The slide counter.
 *
 * "03 / 08" in tabular figures, which is the one indicator that stays readable
 * at any slide count — twenty dots is not an indicator, it is a second row of
 * controls. Tabular is not optional here: proportional digits make the counter
 * change width between "1" and "8", and the whole row twitches on every
 * advance.
 *
 * Zero-padded so the width is fixed from the first slide rather than growing at
 * ten, which is the same twitch arriving later.
 */
function Counter({ active, count }: { active: number; count: number }) {
  return (
    <p className="tabular text-faint text-2xs font-medium" aria-hidden>
      <span className="text-ink">{String(active + 1).padStart(2, '0')}</span>
      <span className="mx-1 opacity-40">/</span>
      {String(count).padStart(2, '0')}
    </p>
  );
}

/**
 * Play / pause for autoplay, wearing its own countdown.
 *
 * The ring is an SVG `stroke-dashoffset` animation keyed on the slide index, so
 * it restarts with each advance and shows how long is left before the next one.
 * That turns autoplay from something that happens TO a viewer into something
 * they can see coming — which is most of why autoplay feels hostile when it is
 * not telegraphed.
 *
 * The ring is CSS rather than a motion value on purpose: it is a decorative
 * countdown that nothing reads back, and a per-frame React subscription for it
 * would be sixty renders a second to draw a circle.
 */
function PlayPause({
  playing,
  onToggle,
  label,
  interval,
  cycle,
}: {
  playing: boolean;
  onToggle: () => void;
  label: string;
  interval: number;
  /** Bumped on every advance, so the countdown ring remounts and restarts. */
  cycle: number;
}) {
  const RADIUS = 13;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`${playing ? 'Pause' : 'Play'} ${label}`}
      className={cn(
        'text-faint hover:text-ink relative grid size-9 place-items-center rounded-full transition-colors',
        'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
      )}
    >
      <svg viewBox="0 0 32 32" className="absolute inset-0 size-9 -rotate-90" aria-hidden>
        <circle
          cx="16"
          cy="16"
          r={RADIUS}
          fill="none"
          strokeWidth="1.5"
          stroke="var(--border-subtle)"
        />
        {playing ? (
          <circle
            key={cycle}
            cx="16"
            cy="16"
            r={RADIUS}
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
            stroke="var(--text-primary)"
            strokeDasharray={CIRCUMFERENCE}
            className="motion-safe:[animation-name:mrd-countdown] [animation-timing-function:linear] [animation-fill-mode:forwards]"
            style={
              {
                animationDuration: `${interval}ms`,
                strokeDashoffset: CIRCUMFERENCE,
                '--countdown-length': CIRCUMFERENCE,
              } as React.CSSProperties
            }
          />
        ) : null}
      </svg>

      {playing ? (
        <span aria-hidden className="flex gap-[3px]">
          <span className="h-2.5 w-[3px] rounded-full bg-current" />
          <span className="h-2.5 w-[3px] rounded-full bg-current" />
        </span>
      ) : (
        <span
          aria-hidden
          className="ml-0.5 size-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-current"
        />
      )}
    </button>
  );
}

/**
 * A previous/next arrow.
 *
 * Three decisions that are easy to get wrong:
 *
 *  1. It sits JUST INSIDE the track, never outside it. Hanging the buttons
 *     beyond the scroller is fine inside a padded container and overflows the
 *     document on any full-bleed carousel — which the home hero is at every
 *     width above `md`. Overlaying the edge of the first and last slide is the
 *     usual treatment and it cannot push the page sideways.
 *
 *  2. At the end of the row it DISABLES rather than wrapping. Silent wrapping
 *     makes it impossible to tell where a list ends, and a shopper who cannot
 *     tell just keeps pressing.
 *
 *  3. `reveal` hides it until the carousel is hovered — but only on a pointer
 *     device, and never when something inside has focus. An arrow that fades in
 *     on hover and stays invisible to the keyboard is an arrow the keyboard
 *     cannot find, so `group-focus-within` brings it straight back.
 */
function ArrowButton({
  side,
  disabled,
  onClick,
  label,
  reveal = false,
}: {
  side: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
  label: string;
  reveal?: boolean;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${side === 'left' ? 'Previous' : 'Next'} in ${label}`}
      className={cn(
        'glass text-ink absolute top-1/2 z-10 hidden size-11 -translate-y-1/2 place-items-center',
        'rounded-full shadow-(--shadow-pop)',
        'transition-[opacity,transform,background-color] duration-(--duration-base) ease-(--ease-out)',
        'motion-safe:hover:scale-[1.09] motion-safe:active:scale-95',
        'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
        // Touch swipes; arrows are for a pointer.
        'md:grid',
        'disabled:pointer-events-none disabled:opacity-0',
        reveal &&
          'md:opacity-0 md:group-hover/carousel:opacity-100 md:group-focus-within/carousel:opacity-100',
        side === 'left'
          ? 'left-2 lg:left-3 md:group-hover/carousel:translate-x-0'
          : 'right-2 lg:right-3 md:group-hover/carousel:translate-x-0',
      )}
    >
      <Icon className="size-[1.15rem]" aria-hidden strokeWidth={2.2} />
    </button>
  );
}
