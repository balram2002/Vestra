import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import type { StatusMeta, Tone } from '@/domain/enums';
import { cn } from '@/lib/cn';

/**
 * Badge.
 *
 * A READOUT, and never pressable. `Chip` is the pressable sibling, and keeping
 * the two visually distinct is what stops a status pill from looking like a
 * button nobody can press — the single most common confusion in a console.
 *
 * The tone vocabulary is the SAME `Tone` union the domain state machines use
 * (`domain/enums`), which is the entire point: an order status carries its own
 * tone, so rendering it correctly is a lookup rather than a `switch`
 * re-implemented on every screen. Add a status to the domain and every badge in
 * three applications already knows what colour it is.
 *
 * The tint behind each badge is deliberately pale so a queue of forty stays
 * calm. That calm is bought with contrast, which is why the INK on each tint is
 * a -600/-700 step verified by `check-palette.mjs` against the tint composited
 * over the surface a browser actually paints — not against the tint's nominal
 * hex, which is not what anybody sees.
 */
const badgeVariants = cva(
  [
    'inline-flex items-center gap-1.5 whitespace-nowrap font-medium',
    'border transition-colors duration-(--duration-base) ease-(--ease-out)',
    '[&_svg]:size-3 [&_svg]:shrink-0',
  ],
  {
    variants: {
      tone: {
        neutral: 'bg-sunken text-muted border-line-strong',
        info: 'bg-info-50 text-info-700 border-info-100',
        success: 'bg-success-50 text-success-700 border-success-100',
        warning: 'bg-warning-50 text-warning-700 border-warning-100',
        danger: 'bg-danger-50 text-danger-700 border-danger-100',
        accent: 'bg-accent-soft text-accent-ink border-accent-line',
        /** Verified sellers, loyalty tiers, editorial picks. Badge scale only. */
        premium: 'bg-sand-50 text-sand-700 border-sand-200',
      } satisfies Record<Tone, string>,
      size: {
        sm: 'h-5 rounded-xs px-1.5 text-2xs',
        md: 'h-6 rounded-sm px-2 text-xs',
        lg: 'h-7 rounded-md px-2.5 text-sm',
      },
      /** Solid reads louder — for sale flashes and count bubbles. Used sparingly. */
      solid: { true: '', false: '' },
      /** Fully rounded. For a tile overlay or a count, where a pill reads softer. */
      pill: { true: 'rounded-full', false: '' },
    },
    compoundVariants: [
      { solid: true, tone: 'neutral', class: 'bg-inverse text-on-inverse border-transparent' },
      { solid: true, tone: 'info', class: 'bg-info-fill text-white border-transparent' },
      { solid: true, tone: 'success', class: 'bg-success-fill text-white border-transparent' },
      { solid: true, tone: 'warning', class: 'bg-warning-fill text-white border-transparent' },
      { solid: true, tone: 'danger', class: 'bg-danger-fill text-white border-transparent' },
      { solid: true, tone: 'accent', class: 'bg-accent text-on-accent border-transparent' },
      { solid: true, tone: 'premium', class: 'bg-premium-fill text-white border-transparent' },
    ],
    defaultVariants: { tone: 'neutral', size: 'md', solid: false, pill: false },
  },
);

/** The dot's fill per tone. `currentColor` would vanish on a solid badge. */
const DOT: Record<Tone, string> = {
  neutral: 'bg-line-bold',
  info: 'bg-info-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  accent: 'bg-accent',
  premium: 'bg-sand-500',
};

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  /**
   * Lead with a filled dot in the tone's hue.
   *
   * The tint behind a badge is deliberately pale so it stays calm in a dense
   * queue, and pale tints are hard to tell apart at a glance. The dot restores
   * the hue at full strength in 6px, without raising the badge's volume.
   *
   * The WORD still carries the meaning. This is reinforcement, never the signal
   * on its own — colour alone fails WCAG 1.4.1 and fails a colourblind seller
   * on a Tuesday.
   */
  dot?: boolean;
  /**
   * Pulse the dot once on mount.
   *
   * For a badge that has just CHANGED — a queue item moving to "action needed".
   * Never on a static readout, and never looping: a badge that pulses forever is
   * a badge people learn to stop seeing.
   */
  live?: boolean;
}

export function Badge({
  className,
  tone,
  size,
  solid,
  pill,
  dot,
  live,
  children,
  ...props
}: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size, solid, pill }), className)} {...props}>
      {dot && !solid ? (
        <span className="relative grid size-1.5 shrink-0 place-items-center" aria-hidden>
          {live ? (
            <span
              className={cn(
                'absolute inset-0 rounded-full motion-safe:animate-ping-once',
                DOT[tone ?? 'neutral'],
              )}
            />
          ) : null}
          <span className={cn('size-1.5 rounded-full', DOT[tone ?? 'neutral'])} />
        </span>
      ) : null}
      {children}
    </span>
  );
}

/**
 * Render a domain status directly.
 *
 * Takes the `StatusMeta` the enum module already exports, so the label, the
 * tone and the tooltip copy all come from one place and cannot drift per
 * screen.
 */
export function StatusBadge({
  meta,
  size,
  solid,
  dot = true,
  className,
  ...props
}: { meta: StatusMeta } & Omit<BadgeProps, 'tone' | 'children'>) {
  return (
    <Badge
      tone={meta.tone}
      size={size}
      solid={solid}
      dot={dot}
      title={meta.description}
      className={className}
      {...props}
    >
      {meta.label}
    </Badge>
  );
}

/**
 * A count bubble, for a bag icon or a queue tab.
 *
 * `min-w` with centred content rather than a fixed width: "3" and "12" must
 * both sit centred in a pill that grows only as far as it has to, and a fixed
 * width makes one of the two look wrong. Capped at 99+ because a three-digit
 * bag count is a number nobody reads — it is just "a lot".
 *
 * The ring is the detail: the bubble overlaps the icon it counts, and without a
 * ring in the ground colour the two shapes merge into one illegible blob at the
 * exact moment the number matters.
 */
export function CountBubble({
  count,
  className,
  max = 99,
  ...props
}: { count: number; max?: number } & ComponentProps<'span'>) {
  if (count <= 0) return null;

  return (
    <span
      className={cn(
        'bg-accent text-on-accent tabular grid h-4.5 min-w-4.5 place-items-center',
        'rounded-full px-1 text-[10px] font-semibold leading-none',
        'ring-2 ring-(--surface-raised)',
        // Pops in when the number first appears; the spring overshoot is what
        // makes a bag count read as "something was added".
        'motion-safe:animate-pop',
        className,
      )}
      {...props}
    >
      {count > max ? `${max}+` : count}
    </span>
  );
}

/**
 * A discount flash.
 *
 * Split from `Badge` because a sale figure is not a status and must never share
 * its shape. It is the one place in the storefront where a number is allowed to
 * shout, so it takes the danger fill, tabular figures (so "40%" and "10%" are
 * the same width in a grid) and no border at all.
 */
export function SaleFlash({
  percent,
  className,
  ...props
}: { percent: number } & ComponentProps<'span'>) {
  if (percent <= 0) return null;

  return (
    <span
      className={cn(
        'bg-danger-fill tabular inline-flex h-5 items-center rounded-xs px-1.5',
        'text-2xs font-semibold leading-none text-white',
        className,
      )}
      {...props}
    >
      {percent}% OFF
    </span>
  );
}

export { badgeVariants };
