import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

/**
 * Breadcrumbs.
 *
 * The last entry is the current page, so it is rendered as text with
 * `aria-current` rather than a link to itself. The separators are `aria-hidden`
 * — a screen reader announcing "chevron right" between every level is noise,
 * and the `<ol>` already conveys the hierarchy.
 */
export function Breadcrumbs({
  items,
}: {
  items: Array<{ href: string; label: string }>;
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb">
      <ol className="text-faint flex flex-wrap items-center gap-1 text-xs">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={item.href} className="flex items-center gap-1">
              {last ? (
                <span aria-current="page" className="text-muted">
                  {item.label}
                </span>
              ) : (
                <>
                  <Link href={item.href} className="hover:text-accent-ink transition-colors">
                    {item.label}
                  </Link>
                  <ChevronRight className="size-3 shrink-0" aria-hidden />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
