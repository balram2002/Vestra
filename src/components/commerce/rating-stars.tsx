import { Star } from 'lucide-react';

import { cn } from '@/lib/cn';
import { formatCompactNumber, formatRating } from '@/lib/format';

/**
 * Rating.
 *
 * Rendered as ONE filled star plus the figure, rather than five glyphs: at card
 * size five stars are illegible, and a shopper scanning a grid reads "4.3" far
 * faster than they count pips. The five-star bar is reserved for the PDP review
 * summary, where there is room for it to mean something.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A GREEN PILL
 * ---------------------------------------------------------------------------
 * The obvious treatment — a filled green badge with the number reversed out —
 * is what most Indian marketplaces ship, and it has two problems here.
 *
 * The first is contrast: white on a green light enough to read as "good" never
 * clears 4.5:1 at the 11px a card renders it at, so the badge either fails WCAG
 * or stops looking positive. That is a real constraint, not a preference.
 *
 * The second is louder. A grid of forty cards each carrying a saturated green
 * chip puts forty pieces of colour in front of the merchandise, and the
 * photography is what is being sold. Colour on this page belongs to the
 * product, the sale flash and the primary action — in that order — and a rating
 * is none of the three.
 *
 * So the star carries the hue (`sand`, the premium accent, at badge scale which
 * is the only scale it is allowed) and the number is set in ink. It reads as
 * quality without spending any of the page's attention budget, and it passes on
 * contrast because ink on canvas always does.
 *
 * A product with no reviews renders NOTHING, not "0.0" — a zero reads as a bad
 * score rather than an absent one, and that is a meaningful difference to a
 * seller who has just listed.
 */
export function RatingStars({
  rating,
  count,
  size = 'sm',
  showCount = true,
  className,
}: {
  rating: number;
  /**
   * How many ratings the figure aggregates. Pass null where the rating is a
   * single person's own score — one review has no count, and rendering "1"
   * beside it would imply an aggregate.
   */
  count: number | null;
  size?: 'sm' | 'md';
  showCount?: boolean;
  className?: string;
}) {
  if (count === 0) return null;

  /*
   * Below 3.5 the star loses its fill.
   *
   * A hollow star is the honest shape for a rating that is not a
   * recommendation, and it survives greyscale and colour blindness in a way
   * that swapping a green chip for an amber one does not — the difference is in
   * the FORM, not only in the hue.
   */
  const good = rating >= 3.5;

  return (
    <span className={cn('inline-flex items-baseline gap-1.5', className)}>
      <span
        className={cn(
          'tabular text-ink inline-flex items-center gap-1 font-semibold',
          size === 'sm' ? 'text-2xs' : 'text-xs',
        )}
      >
        <Star
          className={cn(
            'translate-y-px',
            size === 'sm' ? 'size-3' : 'size-3.5',
            good ? 'text-sand-500' : 'text-faint',
          )}
          fill={good ? 'currentColor' : 'none'}
          strokeWidth={good ? 0 : 1.75}
          aria-hidden
        />
        {formatRating(rating)}
      </span>

      {showCount && count !== null ? (
        <span className={cn('text-faint tabular', size === 'sm' ? 'text-2xs' : 'text-xs')}>
          ({formatCompactNumber(count)})
        </span>
      ) : null}
    </span>
  );
}
