import { cn } from '@/lib/cn';

/**
 * A queue count in the console nav.
 *
 * Rendered by a Suspense'd server component so the surrounding nav stays part
 * of the static shell. Zero renders nothing at all — a badge showing "0" is
 * visual noise that trains people to ignore badges.
 */
export function QueueBadge({ count, tone = 'urgent' }: { count: number; tone?: 'urgent' | 'muted' }) {
  if (count <= 0) return null;

  return (
    <span
      className={cn(
        'tabular rounded-full px-1.5 py-0.5 text-2xs font-semibold',
        tone === 'urgent' ? 'bg-danger-50 text-danger-700' : 'bg-sunken text-muted',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
