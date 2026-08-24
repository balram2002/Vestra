import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/cn';
import { withParam, type RawSearchParams } from '@/lib/product-query';

/**
 * Pagination.
 *
 * Real links with real hrefs, so a crawler can walk the catalogue and a shopper
 * can open page 3 in a new tab. The window around the current page keeps the
 * control from becoming eighty numbers on a large category.
 */
export function Pagination({
  page,
  pageCount,
  params,
  basePath,
}: {
  page: number;
  pageCount: number;
  params: RawSearchParams;
  basePath: string;
}) {
  if (pageCount <= 1) return null;

  const pages = windowed(page, pageCount);
  const href = (target: number) =>
    withParam(params, 'page', target === 1 ? null : String(target), basePath);

  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1">
      <PageLink
        href={href(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        // `rel` helps crawlers understand the sequence.
        rel="prev"
      >
        <ChevronLeft className="size-4" />
      </PageLink>

      {pages.map((entry, index) =>
        entry === 'gap' ? (
          <span key={`gap-${index}`} className="text-faint px-1.5 text-sm" aria-hidden>
            …
          </span>
        ) : (
          <PageLink key={entry} href={href(entry)} active={entry === page} aria-label={`Page ${entry}`}>
            {entry}
          </PageLink>
        ),
      )}

      <PageLink
        href={href(page + 1)}
        disabled={page >= pageCount}
        aria-label="Next page"
        rel="next"
      >
        <ChevronRight className="size-4" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  active = false,
  disabled = false,
  children,
  ...props
}: {
  href: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, 'href' | 'children'>) {
  const className = cn(
    'tabular flex h-9 min-w-9 items-center justify-center rounded-md px-2.5 text-sm transition-colors',
    active
      ? 'bg-accent text-on-inverse font-semibold'
      : 'text-muted hover:bg-sunken hover:text-ink',
    disabled && 'text-faint pointer-events-none opacity-40',
  );

  // A disabled control must not be a link: it would still be focusable and
  // still navigate on Enter.
  if (disabled) {
    return (
      <span className={className} aria-disabled="true">
        {children}
      </span>
    );
  }

  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={className} {...props}>
      {children}
    </Link>
  );
}

/** First, last, and a window around the current page. */
function windowed(page: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);

  const out: Array<number | 'gap'> = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pageCount - 1, page + 1);

  if (from > 2) out.push('gap');
  for (let i = from; i <= to; i++) out.push(i);
  if (to < pageCount - 1) out.push('gap');

  out.push(pageCount);
  return out;
}
