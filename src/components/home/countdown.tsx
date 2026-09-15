'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * Time left, for a section that ends.
 *
 * A CLIENT COMPONENT because a countdown rendered on the server is a lie the
 * moment it is cached: the page is served from a CDN for minutes at a time, and
 * a prerendered "02:14:09" would be wrong for everyone after the first second.
 * The deadline is data; the counting happens here.
 *
 * It stops at zero rather than counting into negatives, and renders nothing at
 * all once the window has closed -- the section itself disappears on the next
 * revalidation, and a timer reading "00:00:00" in the meantime looks broken
 * rather than finished.
 *
 * `suppressHydrationWarning` is not used and not needed: the first client
 * render is the same "--" the server produced, and the real figure appears on
 * the first tick.
 */
export function Countdown({ to, className }: { to: string; className?: string }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const deadline = Date.parse(to);
    if (Number.isNaN(deadline)) return;

    const tick = () => setLeft(Math.max(0, deadline - Date.now()));
    tick();

    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [to]);

  if (left === null) {
    return (
      <span className={cn('text-faint tabular text-xs', className)} aria-hidden>
        --:--:--
      </span>
    );
  }
  if (left <= 0) return null;

  const seconds = Math.floor(left / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  const pad = (value: number) => String(value).padStart(2, '0');
  const label = days > 0 ? `${days}d ${pad(hours)}h ${pad(minutes)}m` : `${pad(hours)}:${pad(minutes)}:${pad(rest)}`;

  return (
    <span
      className={cn(
        'bg-danger-50 text-danger-700 tabular inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        className,
      )}
      // Announced once, not every second: a live region ticking on a screen
      // reader is unusable.
      aria-label={`Ends in ${label}`}
    >
      <span aria-hidden className="bg-danger-600 size-1.5 animate-pulse rounded-full" />
      <span aria-hidden>Ends in {label}</span>
    </span>
  );
}
