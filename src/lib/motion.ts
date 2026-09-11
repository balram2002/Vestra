import type { Transition } from 'framer-motion';

/**
 * MERIDIAN — the motion vocabulary.
 * ===========================================================================
 * Every animated component in the three apps draws its timing from here, for
 * exactly the same reason every component draws its colour from `tokens.css`:
 * motion tuned per component is motion that disagrees with itself, and a shop
 * where the drawer, the sheet and the carousel each ease differently feels
 * assembled rather than designed.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE IS SHORT
 * ---------------------------------------------------------------------------
 * It was twice this size, carrying a full set of entrance variants, press
 * responses, drawer slides and reduced-motion helpers. Nothing imported any of
 * them, and the reason turned out to be structural rather than accidental:
 *
 *   - ENTRANCES are CSS. `.stagger`, `.reveal` and the `animate-*` utilities in
 *     `global.css` run on server-rendered markup with no hydration at all, so a
 *     framer-motion entrance variant would be a client component per card on a
 *     grid of forty-eight.
 *   - PRESSES are CSS. `active:scale-[0.97]` on `Button` costs nothing and works
 *     on a Server Component; a `whileTap` would make every button in the app a
 *     client island.
 *   - OVERLAY SLIDES are CSS. Radix's `Presence` defers unmounting until a CSS
 *     animation ends, so drawers and dialogs animate both ways from
 *     `data-[state]` classes — without lifting every overlay's open state into
 *     its caller, which is what `AnimatePresence` would require.
 *
 * So framer-motion is reserved for the cases CSS genuinely cannot express: a
 * value being driven frame by frame (the carousel's scroll spring), a value
 * derived from another value (slide depth and parallax), and a stagger that has
 * to re-run on a state change rather than on mount (the hero's copy).
 *
 * What remains below is what those cases actually use. A vocabulary with
 * fourteen unused entries is a vocabulary that drifts from the code it claims
 * to describe, and the next person cannot tell which half is real.
 *
 * ---------------------------------------------------------------------------
 * WHEN A SPRING IS RIGHT, AND WHEN IT IS NOT
 * ---------------------------------------------------------------------------
 * A spring is the correct model for anything a finger can interrupt — a
 * carousel being dragged, a sheet being pulled, a card being pressed. Physics
 * is what lets a release CONTINUE naturally instead of snapping onto a timeline
 * the user was not following.
 *
 * A spring is the WRONG model for a colour change, an opacity fade, or anything
 * that is not travelling through space. Those get a duration and a curve,
 * because "how bouncy is this fade" is not a question with an answer. Those
 * cases stay in CSS entirely — see the `--duration-*` and `--ease-*` tokens.
 *
 * ---------------------------------------------------------------------------
 * READING THE NUMBERS
 * ---------------------------------------------------------------------------
 *
 *   stiffness   how hard the spring pulls. Higher arrives sooner.
 *   damping     how much the system resists. Lower overshoots more.
 *   mass        scales the whole response. Heavier feels slower and more solid.
 *
 * The ratio that decides the CHARACTER is `damping / (2 * sqrt(stiffness *
 * mass))`. Below 1 it overshoots; at 1 it is critically damped and settles
 * without ever passing its target. Most of these sit just under 1 — a few
 * percent of overshoot is what reads as "alive", and more than about ten
 * percent reads as "toy".
 */

/* ------------------------------------------------------------------ springs */

export const spring = {
  /**
   * The default. For a panel, a sheet, a drawer — anything with real size.
   *
   * Critically damped on purpose: something the size of a drawer that bounces
   * reads as flimsy, and a drawer is the one surface people open dozens of
   * times in a session.
   *
   * Used by the mobile navigation's drill-down and by the PDP's zoom scale.
   */
  base: { type: 'spring', stiffness: 340, damping: 36, mass: 0.9 },

  /**
   * Carousel and rail travel.
   *
   * Softer and heavier than `base`, which is what gives a slide its glide. The
   * damping ratio here is ~0.92, so it settles with the faintest overshoot —
   * enough that the slide feels like it has weight and ARRIVES, rather than
   * stopping dead on a mark.
   *
   * The hero's copy stack uses it too, so the words settle in sympathy with the
   * slide they are sitting on rather than on an unrelated timeline.
   */
  glide: { type: 'spring', stiffness: 250, damping: 30, mass: 1.05 },

  /**
   * A release after a drag.
   *
   * Lower stiffness than `glide`, because the velocity handed in by the gesture
   * is already doing most of the work. A stiff spring fights the throw, and the
   * flick feels sticky.
   */
  fling: { type: 'spring', stiffness: 190, damping: 27, mass: 1 },

  /**
   * A pointer follower — the PDP's zoom origin, a cursor-tracked highlight.
   *
   * Very soft and heavily damped, so it TRAILS the pointer instead of tracking
   * it exactly. Tracking a cursor exactly produces a second cursor: the image
   * snaps to every jitter of the hand and the effect feels nervous.
   */
  follow: { type: 'spring', stiffness: 120, damping: 24, mass: 0.7 },
} satisfies Record<string, Transition>;

/* ------------------------------------------------------------------- tweens */

/**
 * Durations, mirrored from the CSS tokens.
 *
 * Duplicated in TypeScript rather than read from the stylesheet because
 * framer-motion needs a number, and `getComputedStyle` inside a render path is
 * a forced reflow. The two lists must move together — that is the cost of the
 * duplication, and it is far cheaper than the reflow.
 */
const duration = {
  fast: 0.15,
  base: 0.22,
  slow: 0.32,
} as const;

/** The CSS `--ease-*` curves, as coefficient arrays. */
const ease = {
  out: [0.16, 1, 0.3, 1],
  in: [0.7, 0, 0.84, 0],
} as const;

export const tween = {
  fast: { duration: duration.fast, ease: ease.out },
  base: { duration: duration.base, ease: ease.out },
  slow: { duration: duration.slow, ease: ease.out },
  /** For an exit. Leaving should always be quicker than arriving. */
  exit: { duration: duration.fast, ease: ease.in },
} satisfies Record<string, Transition>;

/* ------------------------------------------------------------------ helpers */

/**
 * Per-child stagger index, for the CSS `.stagger` utility.
 *
 * `.stagger` in `global.css` reads `--i` off each child to compute its delay,
 * which is what lets a staggered grid stay plain server-rendered markup — no
 * per-item client component, no hydration cost per card, no JavaScript timer.
 *
 * This exists so callers write `style={staggerIndex(i)}` rather than casting at
 * every call site: a CSS custom property is not part of React's
 * `CSSProperties`, and the cast is exactly the kind of noise that gets copied
 * wrong.
 *
 * It lives HERE and not in `ui/reveal.tsx` on purpose: that module is
 * `'use client'`, and a function exported from a client module is a client
 * reference, not something a Server Component is allowed to call.
 */
export function staggerIndex(index: number): React.CSSProperties {
  return { '--i': index } as React.CSSProperties;
}
