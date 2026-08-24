import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/**
 * Button.
 *
 * Built on the semantic tokens (`bg-accent`, `text-ink`, `border-line`) rather
 * than Tailwind's stock palette, so the whole system re-themes from
 * `tokens.css` and nothing here reads as unstyled shadcn.
 *
 * Two details that matter more than they look:
 *
 *  - `loading` keeps the label MOUNTED and the width stable, adding only a
 *    leading spinner. Swapping the label out makes the layout jump and loses
 *    the accessible name mid-action.
 *  - `aria-busy` and `disabled` move together, so assistive tech announces the
 *    pending state instead of silently refusing clicks.
 */
const buttonVariants = cva(
  [
    'relative inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium select-none',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
    'motion-safe:active:scale-[0.985]',
    'disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-inverse shadow-xs hover:bg-accent-hover',
        secondary:
          'bg-raised text-ink border border-line-strong hover:bg-sunken hover:border-line-bold',
        outline:
          'border border-accent-line text-accent-ink bg-transparent hover:bg-accent-soft',
        ghost: 'text-muted hover:bg-sunken hover:text-ink',
        link: 'text-accent-ink underline-offset-4 hover:underline',
        danger: 'bg-danger-600 text-white hover:bg-danger-700',
        /** For dark hero imagery and console headers. */
        inverse: 'bg-inverse text-on-inverse hover:opacity-90',
      },
      size: {
        xs: 'h-7 rounded-sm px-2.5 text-xs',
        sm: 'h-8 rounded-sm px-3 text-sm',
        md: 'h-10 rounded-md px-4 text-base',
        lg: 'h-11 rounded-md px-6 text-md',
        /** Full-width commerce actions: Add to bag, Place order. */
        cta: 'h-12 w-full rounded-md px-6 text-md uppercase tracking-wide',
        icon: 'size-10 rounded-md',
        'icon-sm': 'size-8 rounded-sm',
        /** For `link`, which should not carry button geometry. */
        inline: 'h-auto p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
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
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);

  /*
   * `asChild` is handled as a separate branch rather than by swapping the
   * element type. Radix's `Slot` requires exactly ONE element child, and the
   * spinner would make two — which fails at render, not at typecheck. An
   * `asChild` button is a link anyway, and a link has no pending state of its
   * own, so the spinner has nothing to do here.
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

export { buttonVariants };
