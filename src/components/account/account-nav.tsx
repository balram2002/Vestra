import Link from 'next/link';

import { cn } from '@/lib/cn';

/**
 * Account section navigation.
 *
 * Shared across every account screen so the section always looks like one
 * place rather than five unrelated pages that happen to share a URL prefix.
 */
const LINKS = [
  { href: '/account', label: 'Overview' },
  { href: '/orders', label: 'Orders' },
  { href: '/account/returns', label: 'Returns' },
  { href: '/account/reviews', label: 'Reviews' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/notifications', label: 'Notifications' },
  { href: '/account/support', label: 'Help' },
];

export function AccountNav({ current }: { current: string }) {
  return (
    <nav
      className="scrollbar-none border-line -mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-2"
      aria-label="Your account"
    >
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={link.href === current ? 'page' : undefined}
          className={cn(
            'shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors',
            link.href === current
              ? 'bg-ink text-canvas font-medium'
              : 'text-muted hover:bg-sunken hover:text-ink',
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
