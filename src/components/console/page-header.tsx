import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/cn';

/**
 * The top of every console page.
 *
 * Every one of the thirty-three console pages hand-wrote the same `<h1>` and
 * `<p>` pair, and each put its primary action somewhere different — some in the
 * heading row, some under the table, most nowhere. A console is learned by
 * position: the person clearing a queue expects "New listing" and "Export" to be
 * in the same place on every screen, and a layout that moves them makes every
 * page a small search.
 *
 * So there is one header, and the action slot is always top-right on a wide
 * screen and wraps UNDER the title on a narrow one rather than squeezing it —
 * a title truncated to "Settleme…" to make room for a button is a worse
 * trade than one more row.
 */
export function PageHeader({
  back,
  title,
  description,
  eyebrow,
  actions,
  meta,
  className,
}: {
  /**
   * The parent list, for a detail page. The breadcrumb says where you are; this
   * is the one-tap way back, where the thumb and the eye already are.
   */
  back?: { href: string; label: string };
  title: React.ReactNode;
  description?: React.ReactNode;
  /** A small kicker above the title — a parent entity, a status. */
  eyebrow?: React.ReactNode;
  /** Primary and secondary actions for the page. */
  actions?: React.ReactNode;
  /** A row under the description — badges, key figures, timestamps. */
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        {back ? (
          <Link
            href={back.href}
            className="text-muted hover:text-ink focus-visible:outline-accent -ml-1 mb-2 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium transition-colors duration-(--duration-fast) focus-visible:outline-2"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? <div className="eyebrow mb-1.5">{eyebrow}</div> : null}
        <h1 className="text-ink text-xl font-semibold leading-tight tracking-[-0.018em] break-words sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="text-muted mt-1.5 max-w-2xl text-sm">{description}</p>
        ) : null}
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>

      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

/**
 * A titled block within a page — "Recent orders", "Payout account".
 *
 * The same idea one level down: a section with a heading and an optional
 * action, so a page is built from repeated, predictable parts rather than
 * one-off markup per screen.
 */
export function PageSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-ink text-md font-semibold leading-tight">{title}</h2>
          {description ? <p className="text-muted mt-1 text-xs">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
