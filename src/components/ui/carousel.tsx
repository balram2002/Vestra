'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * Carousel.
 *
 * Built on native scroll-snap rather than a transform-driven track, which is
 * the decision everything else here follows from. A scroll container gives
 * momentum, rubber-banding, trackpad gestures and a scrollbar for free, and on
 * a phone it feels like the operating system because it IS the operating
 * system. A JavaScript track has to reimplement all of that and always feels
 * half a frame behind.
 *
 * What that buys, and what it costs:
 *
 *   + Swipe, momentum and overscroll are the platform's, not ours.
 *   + It works before hydration. The content is laid out and scrollable from
 *     the first paint; the arrows and dots are the only part that needs React.
 *   + No dependency. An embla or swiper is ~20KB to reimplement `overflow-x`.
 *   − Position has to be READ from scroll rather than owned, so the indicators
 *     are derived on scroll instead of being the source of truth.
 *
 * Accessibility is the part carousels usually get wrong, so:
 *
 *   - the scroller is focusable and labelled, because a scrollable region that
 *     cannot be reached by keyboard is unreachable content;
 *   - each slide announces its position, since "3 of 8" is the one thing a
 *     screen-reader user cannot see;
 *   - arrows are real buttons that disable at the ends rather than wrapping,
 *     because silent wrapping makes it impossible to tell where a list ends;
 *   - nothing auto-advances. Motion that moves under a reader is hostile, and
 *     a hero that changes while being read is the most-complained-about
 *     pattern on the web.
 */

export interface CarouselProps {
  children: React.ReactNode;
  /** Names the region. Required: an unlabelled scroller announces as nothing. */
  label: string;
  /** Show the previous/next buttons. Hidden on touch, where swiping is better. */
  arrows?: boolean;
  /** Show position dots. Best for a small number of full-width slides. */
  dots?: boolean;
  /** Extra padding so the first and last slides can align to the page gutter. */
  className?: string;
  contentClassName?: string;
  /**
   * Scroll to this slide when it changes.
   *
   * Optional, and deliberately not full control: the scroll position stays the
   * source of truth, because it is the thing a finger moves. This is a request
   * to scroll, which is what an external control — a thumbnail strip, a "next
   * colour" button — actually wants.
   */
  activeIndex?: number;
  /** Fired when the scroller settles on a different slide. */
  onActiveChange?: (index: number) => void;
}

export function Carousel({
  children,
  label,
  arrows = true,
  dots = false,
  className,
  contentClassName,
  activeIndex,
  onActiveChange,
}: CarouselProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [active, setActive] = useState(0);
  const [pages, setPages] = useState(0);

  /**
   * Derive the indicators from the scroll position.
   *
   * Runs on scroll and on resize. The one-pixel tolerance matters: browsers
   * report fractional scroll positions at non-integer zoom levels, and an exact
   * comparison leaves the "next" arrow enabled at the very end.
   */
  const measure = useCallback(() => {
    const node = scroller.current;
    if (!node) return;

    const max = node.scrollWidth - node.clientWidth;
    setAtStart(node.scrollLeft <= 1);
    setAtEnd(node.scrollLeft >= max - 1);

    const slides = Array.from(node.children) as HTMLElement[];
    if (slides.length === 0) return;

    setPages(slides.length);

    // The slide nearest the leading edge is the one being looked at.
    const left = node.scrollLeft;
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    for (const [index, slide] of slides.entries()) {
      const distance = Math.abs(slide.offsetLeft - node.offsetLeft - left);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    }
    setActive((previous) => {
      if (previous !== nearest) onActiveChange?.(nearest);
      return nearest;
    });
  }, [onActiveChange]);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;

    measure();
    node.addEventListener('scroll', measure, { passive: true });

    // Slides can change width on breakpoint changes and as images load.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const child of Array.from(node.children)) observer.observe(child);

    return () => {
      node.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure, children]);

  /*
   * Follow an external request to change slide.
   *
   * Guarded on the current position so the carousel does not fight its own
   * `onActiveChange`: a swipe reports a new index, the parent echoes it back,
   * and without this the scroller would jump to where it already is.
   */
  useEffect(() => {
    if (activeIndex === undefined || activeIndex === active) return;
    const node = scroller.current;
    const slide = node?.children[activeIndex] as HTMLElement | undefined;
    if (!node || !slide) return;
    node.scrollTo({ left: slide.offsetLeft - node.offsetLeft, behavior: 'smooth' });
    // `active` is intentionally omitted: this should run when the REQUEST
    // changes, not every time the scroll position does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  /** Move by one viewport of the scroller, which is what a page means here. */
  const page = (direction: 1 | -1) => {
    const node = scroller.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.9, behavior: 'smooth' });
  };

  const goTo = (index: number) => {
    const node = scroller.current;
    const slide = node?.children[index] as HTMLElement | undefined;
    if (!node || !slide) return;
    node.scrollTo({ left: slide.offsetLeft - node.offsetLeft, behavior: 'smooth' });
  };

  const scrollable = pages > 1 && !(atStart && atEnd);

  return (
    <div
      className={cn('relative', className)}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
    >
      <div
        ref={scroller}
        /*
         * Focusable only when there is something to scroll. A tab stop that
         * does nothing is a tab stop someone has to get past.
         */
        tabIndex={scrollable ? 0 : -1}
        className={cn(
          'flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth',
          // The scrollbar is noise next to dots and arrows that already say the
          // same thing; the region stays keyboard-scrollable regardless.
          'scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]',
          'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
          contentClassName,
        )}
      >
        {children}
      </div>

      {arrows && scrollable ? (
        <>
          <ArrowButton side="left" disabled={atStart} onClick={() => page(-1)} label={label} />
          <ArrowButton side="right" disabled={atEnd} onClick={() => page(1)} label={label} />
        </>
      ) : null}

      {dots && pages > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {Array.from({ length: pages }, (_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Go to slide ${index + 1} of ${pages}`}
              aria-current={index === active}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
                index === active ? 'bg-ink w-5' : 'bg-line-strong w-1.5 hover:bg-muted',
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One slide.
 *
 * `basis` decides how many are visible, and it is a plain class so each caller
 * can choose per breakpoint — a product rail wants 2.2 on a phone so the cut
 * edge of the third says "there is more", while a hero wants exactly 1.
 */
export function CarouselItem({
  children,
  className,
  index,
  total,
}: {
  children: React.ReactNode;
  className?: string;
  /** 1-based. Supplied together with `total` to announce position. */
  index?: number;
  total?: number;
}) {
  return (
    <div
      className={cn('shrink-0 snap-start', className)}
      role="group"
      aria-roledescription="slide"
      aria-label={index && total ? `${index} of ${total}` : undefined}
    >
      {children}
    </div>
  );
}

function ArrowButton({
  side,
  disabled,
  onClick,
  label,
}: {
  side: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${side === 'left' ? 'Previous' : 'Next'} in ${label}`}
      className={cn(
        'border-line bg-raised/90 text-ink absolute top-1/2 z-10 hidden size-9 -translate-y-1/2',
        'place-items-center rounded-full border shadow-sm backdrop-blur transition-opacity',
        'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
        // Touch devices swipe; arrows are for a pointer.
        'md:grid',
        'disabled:pointer-events-none disabled:opacity-0',
        side === 'left' ? '-left-4' : '-right-4',
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
