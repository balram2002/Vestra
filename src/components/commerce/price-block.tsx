import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';

/**
 * Price.
 *
 * The single place discount presentation is decided. Three rules:
 *
 *  - the payable figure is always the most prominent thing;
 *  - the struck-through MRP is only shown when there IS a saving, so no
 *    fake anchor price ever appears;
 *  - figures use tabular numerals, so a price updating in place (quantity
 *    change, coupon applied) does not make the row jitter.
 */
export function PriceBlock({
  sellingPrice,
  mrp,
  discountPercent,
  size = 'md',
  className,
}: {
  sellingPrice: number;
  mrp: number;
  discountPercent: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const hasDiscount = discountPercent > 0 && mrp > sellingPrice;

  const scale = {
    sm: { price: 'text-sm', rest: 'text-2xs' },
    md: { price: 'text-md', rest: 'text-xs' },
    lg: { price: 'text-2xl', rest: 'text-sm' },
  }[size];

  return (
    <div className={cn('tabular flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5', className)}>
      <span className={cn('text-ink font-semibold', scale.price)}>{formatMoney(sellingPrice)}</span>

      {hasDiscount ? (
        <>
          <span className={cn('text-faint line-through', scale.rest)}>{formatMoney(mrp)}</span>
          <span className={cn('text-ember-600 font-medium', scale.rest)}>
            {discountPercent}% off
          </span>
        </>
      ) : null}
    </div>
  );
}
