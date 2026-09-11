import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import type { Paise } from '@/lib/money';

/**
 * Price.
 *
 * The single place discount presentation is decided, and the most-read thing in
 * the shop. It appears at five sizes across a card, a rail, a PDP, a bag line
 * and an order summary; writing it out each time is how one screen ends up
 * striking through the MRP and another shows it plain.
 *
 * The rules this encodes:
 *
 *  - **The payable figure leads** and is the heaviest thing in the group. It is
 *    the number being asked for.
 *  - **The MRP appears only when there is a real saving.** A struck-through
 *    price equal to the selling price is a dark pattern, and here it is an
 *    impossibility rather than a policy.
 *  - **The saving is in `danger`**, which exists for exactly this and for low
 *    stock, and nothing else in the system may use it. That is what keeps a
 *    discount reading as urgent rather than as decoration.
 *  - **Everything is `tabular`**, so a column of prices in a bag lines up and
 *    does not jitter as a quantity changes.
 *
 * The struck-through figure is a real `<s>` element, not a `line-through`
 * class. Assistive tech announces the former as struck; the latter is invisible
 * to it, so a screen-reader user hears two prices with no indication which one
 * they are being charged. The `sr-only` "Was" makes it unambiguous either way.
 */
export function PriceBlock({
  sellingPrice,
  mrp,
  discountPercent,
  size = 'md',
  className,
}: {
  sellingPrice: Paise;
  mrp: Paise;
  discountPercent: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const hasDiscount = discountPercent > 0 && mrp > sellingPrice;

  /*
   * Tracking tightens as the figure grows.
   *
   * Default letter-spacing is tuned for text, and a price is not text — it is a
   * short run of digits read as one shape. At 15px the default is right; at
   * 30px on a PDP it opens a visible gap between the rupee sign and the first
   * numeral, and the number stops reading as a single value. This is the same
   * reason the display steps in `tokens.css` carry their own negative tracking.
   */
  const scale = {
    sm: { price: 'text-sm', rest: 'text-2xs' },
    md: { price: 'text-md tracking-[-0.012em]', rest: 'text-xs' },
    lg: { price: 'text-xl tracking-[-0.02em]', rest: 'text-sm' },
    xl: { price: 'text-3xl tracking-[-0.03em]', rest: 'text-md' },
  }[size];

  return (
    <div className={cn('tabular flex flex-wrap items-baseline gap-x-2 gap-y-0.5', className)}>
      <span className={cn('text-ink font-semibold', scale.price)}>
        {formatMoney(sellingPrice)}
      </span>

      {hasDiscount ? (
        <>
          <s className={cn('text-faint', scale.rest)}>
            <span className="sr-only">Was </span>
            {formatMoney(mrp)}
          </s>
          <span className={cn('text-danger-600 font-semibold', scale.rest)}>
            {discountPercent}% off
          </span>
        </>
      ) : null}
    </div>
  );
}

/**
 * A single money value in a summary row.
 *
 * For an order total, a shipping line, a settlement figure — anywhere a column
 * of amounts has to align. `free` renders the word rather than ₹0, because
 * "Free" is the thing people are looking for and a zero makes them look twice.
 *
 * The minus sign is U+2212, not a hyphen: it is the same width as a digit, so a
 * discount line stays in column with the amounts above it.
 */
export function Amount({
  value,
  negative = false,
  strong = false,
  free = false,
  className,
}: {
  value: Paise;
  negative?: boolean;
  strong?: boolean;
  free?: boolean;
  className?: string;
}) {
  if (free) {
    return <span className={cn('text-success-700 text-sm font-medium', className)}>Free</span>;
  }

  return (
    <span
      className={cn(
        'tabular text-ink text-sm',
        strong && 'font-semibold',
        negative && 'text-success-700',
        className,
      )}
    >
      {negative ? '−' : ''}
      {formatMoney(value)}
    </span>
  );
}
