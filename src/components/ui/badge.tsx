import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import type { StatusMeta, Tone } from '@/domain/enums';
import { cn } from '@/lib/cn';

/**
 * Badge.
 *
 * The tone vocabulary is the SAME `Tone` union the domain state machines use
 * (`domain/enums`), which is the point: an order status carries its own tone,
 * so rendering it correctly is a lookup rather than a `switch` re-implemented
 * on every screen. Add a status to the domain and every badge already knows
 * what colour it is.
 */
const badgeVariants = cva(
  [
    'inline-flex items-center gap-1.5 whitespace-nowrap font-medium',
    'border transition-colors',
    "[&_svg]:size-3 [&_svg]:shrink-0",
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
        brass: 'bg-brass-50 text-brass-700 border-brass-200',
      } satisfies Record<Tone, string>,
      size: {
        sm: 'h-5 rounded-xs px-1.5 text-2xs',
        md: 'h-6 rounded-sm px-2 text-xs',
        lg: 'h-7 rounded-sm px-2.5 text-sm',
      },
      /** Solid reads louder — for sale flashes and count bubbles, used sparingly. */
      solid: { true: '', false: '' },
    },
    compoundVariants: [
      { solid: true, tone: 'neutral', class: 'bg-inverse text-on-inverse border-transparent' },
      { solid: true, tone: 'info', class: 'bg-info-600 text-white border-transparent' },
      { solid: true, tone: 'success', class: 'bg-success-600 text-white border-transparent' },
      { solid: true, tone: 'warning', class: 'bg-warning-600 text-white border-transparent' },
      { solid: true, tone: 'danger', class: 'bg-danger-600 text-white border-transparent' },
      { solid: true, tone: 'accent', class: 'bg-accent text-on-inverse border-transparent' },
      { solid: true, tone: 'brass', class: 'bg-brass-600 text-white border-transparent' },
    ],
    defaultVariants: { tone: 'neutral', size: 'md', solid: false },
  },
);

export interface BadgeProps
  extends ComponentProps<'span'>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, solid, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size, solid }), className)} {...props} />;
}

/**
 * Render a domain status directly.
 *
 * Takes the `StatusMeta` the enum module already exports, so the label, tone
 * and tooltip copy all come from one place and cannot drift per screen.
 */
export function StatusBadge({
  meta,
  size,
  solid,
  className,
  ...props
}: { meta: StatusMeta } & Omit<BadgeProps, 'tone' | 'children'>) {
  return (
    <Badge tone={meta.tone} size={size} solid={solid} title={meta.description} className={className} {...props}>
      {meta.label}
    </Badge>
  );
}

export { badgeVariants };
