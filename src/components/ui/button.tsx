import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/**
 * Button.
 *
 * Built entirely on the semantic tokens (`bg-accent`, `text-ink`,
 * `border-line-control`) rather than Tailwind's stock palette, so the whole
 * system re-themes from `tokens.css` and nothing here reads as unstyled shadcn.
 *
 * ---------------------------------------------------------------------------
 * ONE LOUD VARIANT
 * ---------------------------------------------------------------------------
 * There is exactly one. Two competing primaries on a screen is the commonest
 * hierarchy mistake there is, and the reason a marketplace PDP can end up with
 * a red-on-white "Buy" beside a white-on-red "Add to bag" where neither wins.
 *
 * `inverse` is the second-loudest and exists for one situation: a near-black
 * button on a pale editorial surface. That is the premium-retail signature, and
 * it outranks the brand colour in that context precisely BECAUSE it carries no
 * colour at all.
 *
 * ---------------------------------------------------------------------------
 * FIVE DETAILS THAT MATTER MORE THAN THEY LOOK
 * ---------------------------------------------------------------------------
 *
 *  - `loading` keeps the label MOUNTED and the width stable, adding only a
 *    leading spinner. Swapping the label out makes the layout jump and loses
 *    the accessible name mid-action, which is the moment it matters most.
 *  - `aria-busy` and `disabled` move together, so assistive tech announces the
 *    pending state instead of silently refusing clicks.
 *  - the outlined variants use `border-line-control` / `border-accent-control`,
 *    the two border roles held to WCAG 1.4.11's 3:1. The decorative hairline is
 *    not an option here: the outline of a secondary button IS the thing that
 *    says it is a button.
 *  - the press is a `scale`, never a shadow or a margin. It composites, so it
 *    holds 60fps on the cheapest phone in the catalogue.
 *  - every solid variant carries a 1px inner top highlight. Real objects catch
 *    light on their upper edge; a flat fill does not, and that single line is
 *    most of the difference between a button that looks moulded and one that
 *    looks painted on.
 */

/**
 * The mobile floor for a control's hit area.
 *
 * Every size below `lg` is dense enough to fail a thumb: `sm` is 34px tall,
 * `icon-sm` is 32 square. Rather than a per-call-site fix, the minimum lives on
 * the size variant and lifts at `lg`, which is the width at which the consoles
 * dock their rail and become pointer-driven.
 *
 * `min-w` matters as much as `min-h`: a flex child gives up its width first, so
 * a control can pass a height check while being squeezed to 20px wide.
 *
 * `inline` is deliberately excluded — it exists for text links inside prose,
 * which WCAG 2.5.8 carves out for exactly the same reason.
 */
const TAP = 'min-h-11 min-w-11 lg:min-h-0 lg:min-w-0';

/**
 * The moulded edge.
 *
 * An inset hairline of white at 16% along the top, and a matching darkening
 * along the bottom. Applied only to variants with a solid fill, because on a
 * transparent or near-white ground it is either invisible or dirt.
 */
const MOULD = 'shadow-[inset_0_1px_0_0_rgb(255_255_255/0.16),inset_0_-1px_0_0_rgb(0_0_0/0.08)]';

const buttonVariants = cva(
  [
    'relative inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium select-none tracking-[-0.006em]',
    // No `box-shadow` in the transition list: it repaints, and at these
    // elevations the change is imperceptible anyway — so it simply happens.
    'transition-[background-color,border-color,color,transform,opacity]',
    'duration-(--duration-base) ease-(--ease-out)',
    // Press is 150ms and quicker than the release: leaving should always be
    // faster than arriving.
    'motion-safe:active:scale-[0.97] motion-safe:active:duration-(--duration-fast)',
    'disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        /*
         * The brand action.
         *
         * The glow is `--shadow-accent`, a 24px iris bloom at 42% — barely
         * visible on a white page and clearly present on a dark one, which is
         * exactly the right behaviour for a coloured button that has to sit on
         * two very different grounds.
         */
        primary: `bg-accent text-on-accent ${MOULD} hover:bg-accent-hover`,
        /** Near-black on pale, near-white on dark. The premium retail signature. */
        inverse: `bg-inverse text-on-inverse ${MOULD} hover:opacity-90`,
        secondary:
          'bg-raised text-ink border border-line-control hover:bg-sunken hover:border-line-bold',
        /** A quiet action that still carries the brand. Between ghost and outline. */
        soft: 'bg-accent-soft text-accent-ink hover:bg-accent-soft/60',
        outline:
          'border border-accent-control text-accent-ink bg-transparent hover:bg-accent-soft',
        ghost: 'text-muted hover:bg-sunken hover:text-ink',
        link: 'text-accent-ink underline-offset-4 hover:underline',
        danger: `bg-danger-fill text-white ${MOULD} hover:bg-danger-fill-hover`,
      },
      size: {
        xs: ['h-7 gap-1.5 px-2.5 text-xs', TAP],
        sm: ['h-8.5 px-3.5 text-sm', TAP],
        md: ['h-10 px-4.5 text-base', TAP],
        lg: 'h-11.5 px-6 text-md',
        /** Full-width commerce actions: Add to bag, Place order. */
        cta: 'h-13 w-full px-6 text-md font-semibold',
        icon: ['size-10', TAP],
        'icon-sm': ['size-8.5', TAP],
        /** Already 44 square everywhere. For a control that is always thumb-driven. */
        'icon-touch': 'size-11',
        /** For `link`, which should carry no button geometry — and no minimum. */
        inline: 'h-auto p-0',
      },
      /**
       * Corner treatment.
       *
       * `pill` is the storefront's default for anything a shopper presses — it
       * is the single most recognisable modern-commerce cue, and it reads as
       * approachable in a place that is asking for money. The CONSOLES stay on
       * `default`: a pill in a dense toolbar wastes horizontal space and makes
       * a row of controls look like a row of tags.
       */
      shape: {
        default: 'rounded-lg',
        pill: 'rounded-full',
        square: 'rounded-sm',
      },
    },
    compoundVariants: [
      // The smallest sizes are too short for a 14px radius to still read as a
      // rectangle; they take the tighter corner instead.
      { shape: 'default', size: 'xs', class: 'rounded-sm' },
      { shape: 'default', size: 'sm', class: 'rounded-md' },
      { shape: 'default', size: 'icon-sm', class: 'rounded-md' },
      { shape: 'default', size: 'cta', class: 'rounded-xl' },
      // `inline` is a text link. Any radius on it draws a box that is not there.
      { shape: 'default', size: 'inline', class: 'rounded-none' },
      // The glow belongs to the brand CTA at its two largest sizes only. On a
      // 28px toolbar button it is a smudge.
      { variant: 'primary', size: 'lg', class: 'shadow-(--shadow-accent)' },
      { variant: 'primary', size: 'cta', class: 'shadow-(--shadow-accent)' },
    ],
    defaultVariants: { variant: 'primary', size: 'md', shape: 'default' },
  },
);

export interface ButtonProps
  extends ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element (usually a `Link`) instead of a `<button>`. */
  asChild?: boolean;
  /** Pending state that does not change the button's width. */
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  shape,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, shape }), className);

  /*
   * `asChild` is a separate branch rather than a swapped element type.
   *
   * Radix's `Slot` requires exactly ONE element child, and the spinner would
   * make two — which fails at render, not at typecheck. An `asChild` button is
   * a link anyway, and a link has no pending state of its own, so the spinner
   * has nothing to do here.
   */
  if (asChild) {
    return (
      <Slot className={classes} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

/**
 * An icon-only control.
 *
 * Split out from `Button` because the accessible name is not optional here, and
 * a required prop is the only way to say so. An icon button with no `label` is
 * an unlabelled control, which is the single commonest accessibility failure in
 * any admin console — and a `title` is not a fix, because `title` does not
 * exist on touch.
 */
export function IconButton({
  label,
  children,
  size = 'icon',
  variant = 'ghost',
  shape = 'pill',
  className,
  ...props
}: Omit<ButtonProps, 'aria-label'> & { label: string }) {
  return (
    <Button
      aria-label={label}
      title={label}
      size={size}
      variant={variant}
      shape={shape}
      className={className}
      {...props}
    >
      {children}
    </Button>
  );
}

/**
 * A pair of buttons that share an edge.
 *
 * Used for a quantity stepper and for paired console actions. The children keep
 * their own variants; this only fixes the seam, so a group of `secondary`
 * buttons shows one hairline between them rather than two stacked borders that
 * render 2px thick and slightly darker than every other line on the page.
 */
export function ButtonGroup({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      role="group"
      className={cn(
        'inline-flex items-center',
        '[&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none',
        '[&>*:not(:first-child)]:-ml-px',
        // The hovered/focused member has to win the seam, or its border is
        // painted underneath its neighbour's and the highlight looks clipped.
        '[&>*:focus-visible]:relative [&>*:focus-visible]:z-10 [&>*:hover]:relative [&>*:hover]:z-10',
        className,
      )}
      {...props}
    />
  );
}

export { buttonVariants };
