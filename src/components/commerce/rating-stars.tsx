import { Star } from 'lucide-react';

import { cn } from '@/lib/cn';
import { formatCompactNumber, formatRating } from '@/lib/format';

/**
 * Rating.
 *
 * Rendered as a single figure plus a filled star rather than five glyphs: at
 * card size five stars are illegible, and a shopper scanning a grid reads
 * "4.3" far faster than they count pips. The five-star bar is reserved for the
 * PDP review summary, where there is room for it to mean something.
 *
 * A product with no reviews renders NOTHING, not "0.0" — a zero reads as a bad
 * score rather than an absent one.
 */
export function RatingStars({
  rating,
  count,
  size = 'sm',
  showCount = true,
  className,
}: {
  rating: number;
  count: number;
  size?: 'sm' | 'md';
  showCount?: boolean;
  className?: string;
}) {
  if (count === 0) return null;

  // Below 3.5 the badge stops being a recommendation, so it drops the green.
  const tone = rating >= 3.5 ? 'bg-success-500 text-white' : 'bg-warning-500 text-white';

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'tabular inline-flex items-center gap-0.5 rounded-xs font-medium',
          tone,
          size === 'sm' ? 'px-1 py-px text-2xs' : 'px-1.5 py-0.5 text-xs',
        )}
      >
        {formatRating(rating)}
        <Star className={size === 'sm' ? 'size-2.5' : 'size-3'} fill="currentColor" strokeWidth={0} />
      </span>

      {showCount ? (
        <span className={cn('text-faint tabular', size === 'sm' ? 'text-2xs' : 'text-xs')}>
          {formatCompactNumber(count)}
        </span>
      ) : null}
    </span>
  );
}
