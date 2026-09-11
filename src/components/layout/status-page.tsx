import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * The full-page shape behind 401, 403, 404 and the error boundary.
 *
 * These four were four separate hand-built centred columns whose copy structure
 * had already drifted apart — one led with a big "404", the others did not; one
 * offered two exits, another offered one. A visitor who hits two of them in a
 * session should recognise the second as the same kind of page, and a developer
 * adding a fifth should not have to guess the proportions.
 *
 * `tone` colours only the icon disc. The page itself stays on the canvas: a
 * full-bleed red 404 treats a stale bookmark as an emergency, and the calm
 * version is both nicer and more accurate about what went wrong.
 *
 * `code` is optional and set in the mono face, because when it is present it is
 * a thing someone reads out to support down a phone line.
 */
export function StatusPage({
  icon: Icon,
  code,
  title,
  body,
  tone = 'neutral',
  actions,
  footnote,
  className,
}: {
  icon?: LucideIcon;
  /** "404", or an error digest. Rendered as an identifier, not as decoration. */
  code?: string;
  title: string;
  body: string;
  tone?: 'neutral' | 'danger' | 'warning';
  actions?: React.ReactNode;
  footnote?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'gutter shell-max flex min-h-[60dvh] flex-col items-center justify-center py-16 text-center',
        className,
      )}
    >
      {Icon ? (
        <span
          className={cn(
            'mb-5 grid size-12 place-items-center rounded-full',
            tone === 'danger' && 'bg-danger-50 text-danger-700',
            tone === 'warning' && 'bg-warning-50 text-warning-700',
            tone === 'neutral' && 'bg-sunken text-faint',
          )}
          aria-hidden
        >
          <Icon className="size-5" />
        </span>
      ) : null}

      <h1 className="font-display text-ink text-2xl sm:text-3xl">{title}</h1>

      <p className="text-muted mt-2.5 max-w-md text-sm">{body}</p>

      {code ? (
        <p className="text-faint ident mt-4 text-xs">
          <span className="sr-only">Reference </span>
          {code}
        </p>
      ) : null}

      {actions ? (
        <div className="mt-7 flex flex-wrap justify-center gap-2">{actions}</div>
      ) : null}

      {footnote ? <div className="text-faint mt-6 text-xs">{footnote}</div> : null}
    </div>
  );
}
