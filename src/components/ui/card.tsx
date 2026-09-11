import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/**
 * Card.
 *
 * The single most repeated shape in this codebase — the same border, ground,
 * radius and padding appeared by hand in dozens of places, which is how a
 * padding drifts from 20 to 24 on one screen and nobody notices for a month.
 *
 * Four surface levels, because a console nests panels inside panels and a card
 * on a card with the same ground is invisible:
 *
 *   raised  the default. Sits on the canvas.
 *   sunken  recedes. For a nested well inside a raised card.
 *   ghost   no ground at all, only the hairline. Grouping without weight.
 *   glass   frosted. For a card laid over photography.
 *
 * `interactive` is a separate prop rather than a variant, because a card can be
 * any surface AND be a link. It adds hover, a focus ring on the card itself and
 * the press response — never a hover-only affordance, so whatever is inside
 * still has to be reachable without a pointer.
 */
const cardVariants = cva('relative border', {
  variants: {
    surface: {
      raised: 'bg-raised border-line',
      sunken: 'bg-sunken border-line',
      ghost: 'bg-transparent border-line',
      glass: 'glass border-line',
    },
    /**
     * Elevation.
     *
     * `flat` is the default, and that is a considered position: premium retail
     * reads flat. A page where every card floats has no hierarchy, because
     * elevation only means something when most things are on the ground.
     */
    elevation: {
      flat: '',
      low: 'shadow-sm',
      mid: 'shadow-md',
      high: 'shadow-lg',
    },
    /** Console cards are tighter than storefront cards. */
    pad: {
      none: '',
      tight: 'p-3.5',
      base: 'p-5',
      loose: 'p-6 sm:p-7',
    },
    /**
     * Corner radius.
     *
     * A card is the surface where the system's geometry is most visible, so it
     * gets a real choice rather than one fixed value: `md` for a dense console
     * panel, `lg` for a storefront card, `xl` and `2xl` for a hero-adjacent
     * feature block. One radius for all four is what makes a design look like a
     * template.
     */
    radius: {
      md: 'rounded-md',
      lg: 'rounded-lg',
      xl: 'rounded-xl',
      '2xl': 'rounded-2xl',
    },
  },
  defaultVariants: { surface: 'raised', elevation: 'flat', pad: 'base', radius: 'lg' },
});

export interface CardProps extends ComponentProps<'div'>, VariantProps<typeof cardVariants> {
  interactive?: boolean;
  /**
   * The element to render.
   *
   * A card is usually a `<div>`, but a card that groups a heading and its
   * content is a `<section>`, and swapping the tag is the difference between a
   * page that has landmarks and one that is a pile of divs. Defaulting to `div`
   * keeps the common case quiet.
   */
  as?: 'div' | 'section' | 'article' | 'aside' | 'li' | 'form';
}

export function Card({
  className,
  surface,
  elevation,
  pad,
  radius,
  interactive,
  as = 'div',
  ...props
}: CardProps) {
  /*
   * Widened to `ElementType` so the props spread type-checks for every tag.
   *
   * `ComponentProps<'div'>` pins `ref` to `HTMLDivElement`, which a `<li>`
   * rejects — and a settlement row genuinely is a list item that looks like a
   * card. The alternative is a generic component whose signature is longer than
   * the component itself, for a prop that only ever takes one of six literals.
   */
  const Tag = as as React.ElementType;

  return (
    <Tag
      className={cn(
        cardVariants({ surface, elevation, pad, radius }),
        interactive && [
          /*
           * `lift` carries the shadow cross-fade on a pseudo-element rather
           * than animating `box-shadow`, which is not a compositable property.
           * On a grid of twenty-four cards, animating the real shadow is a
           * dropped-frame machine; this costs one extra layer and nothing else.
           */
          'lift',
          'transition-[border-color,background-color] duration-(--duration-base) ease-(--ease-out)',
          'hover:border-line-strong',
          'focus-within:outline-accent focus-within:outline-2 focus-within:outline-offset-2',
          // A card is large, so it TRAVELS rather than shrinking. 3px of lift
          // reads as "this is pickable"; a scale reads as a button press, which
          // is a different promise.
          'motion-safe:active:translate-y-0 motion-safe:active:scale-[0.995]',
        ],
        className,
      )}
      {...props}
    />
  );
}

/**
 * Card header.
 *
 * `actions` sits on the end and is deliberately a separate slot: putting a
 * button inside the title's flex row is how a long title ends up pushing the
 * action off the edge on a phone. Here the title truncates and the action does
 * not move.
 */
export function CardHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
  children,
  ...props
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** A small uppercase kicker above the title. For console panels and sections. */
  eyebrow?: React.ReactNode;
} & ComponentProps<'div'>) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)} {...props}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        {title ? (
          <h3 className="text-ink text-md font-semibold leading-tight tracking-[-0.014em]">
            {title}
          </h3>
        ) : null}
        {description ? <p className="text-muted mt-1 text-sm">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * A hairline rule that spans the card's full width, cancelling its padding.
 *
 * The negative margin assumes `pad="base"`. A card using a different padding
 * passes its own — which is exactly why the value is a class and not baked in.
 */
export function CardDivider({ className, ...props }: ComponentProps<'hr'>) {
  return <hr className={cn('border-line -mx-5 my-4 border-t', className)} {...props} />;
}

/**
 * The bottom bar of a card: totals, a confirm, a pair of actions.
 *
 * A sunken ground rather than a border alone, because a footer that only has a
 * rule above it reads as one more row of content instead of as the place where
 * the decisions are.
 */
export function CardFooter({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'bg-sunken border-line -mx-5 -mb-5 mt-5 flex flex-wrap items-center gap-3',
        'rounded-b-[inherit] border-t px-5 py-3.5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * A media-topped card.
 *
 * The image sits flush to three edges, which means it has to inherit the card's
 * radius on the top two corners only — and `rounded-t-[inherit]` is the one way
 * to do that without the child having to know which radius the parent chose.
 *
 * `overflow-hidden` lives here rather than on `Card` itself: a card that clips
 * cannot host a dropdown, a tooltip or a focus ring that extends past its edge,
 * and most cards need to.
 */
export function CardMedia({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'bg-sunken relative -mx-5 -mt-5 mb-4 overflow-hidden rounded-t-[inherit]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { cardVariants };
