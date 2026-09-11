import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/**
 * Alert.
 *
 * A banner that says something happened, or is about to.
 *
 * The icon is not decoration. "Colour is never the only signal" is a rule in
 * this system, and an alert is the place it matters most: a red panel and an
 * amber panel are the same panel to a viewer with deuteranopia, and identical
 * in a greyscale print of a support screenshot. So the tone picks the icon as
 * well as the ground, and the two cannot disagree.
 *
 * `role` follows severity rather than being hard-coded. `danger` announces
 * immediately because it usually means an action failed; the rest are polite,
 * because a status note interrupting a screen reader mid-sentence is worse than
 * the note arriving a moment later.
 */
const alertVariants = cva('flex gap-3 rounded-lg border p-3.5', {
  variants: {
    tone: {
      info: 'bg-info-50 border-info-100 text-info-700',
      success: 'bg-success-50 border-success-100 text-success-700',
      warning: 'bg-warning-50 border-warning-100 text-warning-700',
      danger: 'bg-danger-50 border-danger-100 text-danger-700',
      neutral: 'bg-sunken border-line text-muted',
    },
  },
  defaultVariants: { tone: 'info' },
});

const ICON = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: OctagonAlert,
  neutral: Info,
} as const;

export interface AlertProps
  extends Omit<ComponentProps<'div'>, 'title'>,
    VariantProps<typeof alertVariants> {
  title?: React.ReactNode;
  /** Right-hand slot: a retry, a dismiss, a link to the thing that fixes it. */
  action?: React.ReactNode;
  /** Drop the icon only when the alert is inside something already marked. */
  hideIcon?: boolean;
}

export function Alert({
  tone = 'info',
  title,
  action,
  hideIcon,
  className,
  children,
  ...props
}: AlertProps) {
  const Icon = ICON[tone ?? 'info'];

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    >
      {hideIcon ? null : <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />}

      <div className="min-w-0 flex-1">
        {title ? <p className="text-sm font-semibold">{title}</p> : null}
        {children ? (
          <div className={cn('text-sm', title && 'mt-0.5 opacity-90')}>{children}</div>
        ) : null}
      </div>

      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

export { alertVariants };
