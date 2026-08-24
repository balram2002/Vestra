import Link from 'next/link';

import { cn } from '@/lib/cn';

/**
 * Filter tabs for a console list.
 *
 * Links, not buttons: the filter belongs in the URL so a view can be
 * bookmarked, shared with a colleague, and linked to from a dashboard queue
 * card. Client state here would make every one of those impossible.
 */
export function ConsoleTabs({
  basePath,
  param,
  current,
  tabs,
}: {
  basePath: string;
  param: string;
  current: string;
  tabs: Array<{ value: string; label: string }>;
}) {
  return (
    <nav className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Filter">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={`${basePath}?${param}=${tab.value}`}
          aria-current={tab.value === current ? 'page' : undefined}
          className={cn(
            'shrink-0 rounded-md px-3 py-1.5 text-xs transition-colors',
            tab.value === current
              ? 'bg-ink text-canvas font-medium'
              : 'text-muted hover:bg-sunken hover:text-ink',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
