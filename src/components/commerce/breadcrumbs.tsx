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
      {/*
        One line that scrolls, rather than wrapping.
        
        A product title inside a breadcrumb wraps to two or three lines on a
        phone, and those lines sit directly above the photograph — the most
        valuable space on the page spent restating the title that appears again
        forty pixels below. Scrolling keeps the trail complete and costs one row.
      */}
      <ol className="text-faint scrollbar-none flex items-center gap-1 overflow-x-auto whitespace-nowrap text-xs sm:flex-wrap sm:whitespace-normal">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={item.href} className="flex shrink-0 items-center gap-1">
              {last ? (
                <span aria-current="page" className="text-muted max-w-[14rem] truncate sm:max-w-none">
                  {item.label}
                </span>
              ) : (
                <>
                  <Link
                  href={item.href}
                  className="hover:text-accent-ink inline-flex min-h-11 min-w-11 items-center justify-center transition-colors lg:min-h-0 lg:min-w-0"
                >
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
