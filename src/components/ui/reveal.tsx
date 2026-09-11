'use client';

import { useEffect, useRef } from 'react';

import { cn } from '@/lib/cn';

/**
 * Scroll-triggered entrance.
 *
 * Deliberately NOT built on framer-motion, even though the rest of the motion
 * system is. Two reasons, and both are about what this wraps:
 *
 *  1. Its children are almost always SERVER components — a product rail, a
 *     banner grid, a value-prop list. A framer `motion.div` would still work
 *     (children pass straight through), but it drags the animation runtime into
 *     the bundle on every page that reveals anything, to animate two properties
 *     one time. An `IntersectionObserver` plus one attribute is forty lines and
 *     no dependency.
 *  2. The animation is a fade and a short rise. That is a transition, not
 *     physics — nothing here can be interrupted, dragged or thrown, which is
 *     the only thing a spring is actually better at.
 *
 * HOW IT AVOIDS RE-RENDERING AT ALL
 *
 * There is no state. The effect flips a `data-shown` attribute on the DOM node
 * and `global.css` does the rest. Writing to the DOM is what an effect is
 * FOR — synchronising React with an external system — whereas a `setState` here
 * would cascade a render for every revealed section on the page, which on a
 * home page of eight rails is eight renders that change nothing React owns.
 *
 * WHY IT IS SAFE WITHOUT SCRIPTING
 *
 * The element ships VISIBLE. The hidden state is gated on `html.js`, which the
 * theme boot script stamps before the first paint — so `opacity: 0` can only
 * ever apply on a page where this observer is going to run. Without JavaScript,
 * the content is simply there.
 */
export function Reveal({
  children,
  className,
  /** Seconds of delay, for staggering siblings by hand. */
  delay = 0,
  /** How far the element travels. `none` fades only. */
  distance = 'sm',
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  distance?: 'none' | 'sm' | 'md';
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const show = () => {
      node.dataset.shown = 'true';
    };

    // Respect the OS setting before doing anything else: reveal immediately and
    // never observe.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      show();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        show();
        // Once, and only once. A section that re-animates every time it scrolls
        // back into view makes a long page feel broken on the way up.
        observer.disconnect();
      },
      {
        /*
         * Fires slightly BEFORE the element reaches the viewport, so by the
         * time it is actually looked at the animation has already begun. An
         * element that starts animating the instant it becomes visible always
         * reads as late.
         */
        rootMargin: '0px 0px -8% 0px',
        threshold: 0.08,
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const travel = { none: '0px', sm: '10px', md: '22px' }[distance];

  return (
    <Tag
      ref={ref as never}
      className={cn('reveal', className)}
      data-shown="false"
      style={
        {
          '--reveal-travel': travel,
          '--reveal-delay': delay ? `${delay}s` : undefined,
        } as React.CSSProperties
      }
    >
      {children}
    </Tag>
  );
}
