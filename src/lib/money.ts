/**
 * Money handling.
 *
 * Every monetary amount in this system is an INTEGER NUMBER OF PAISE.
 * Floating point rupees are never stored, never transported and never summed --
 * accumulated binary-fraction error silently corrupts ledgers, settlements and
 * tax rounding.
 *
 * Conversions happen only at the two boundaries:
 *   - `toPaise` when parsing user / CSV input
 *   - `formatMoney` when rendering
 */

export type Paise = number;

export const PAISE_PER_RUPEE = 100;

export function toPaise(rupees: number): Paise {
  return Math.round(rupees * PAISE_PER_RUPEE);
}

export function toRupees(paise: Paise): number {
  return paise / PAISE_PER_RUPEE;
}

/** Sum with an explicit integer guarantee. */
export function sumPaise(values: readonly Paise[]): Paise {
  let total = 0;
  for (const v of values) total += Math.round(v);
  return total;
}

/**
 * Percentage of an amount, rounded half-up to the nearest paise.
 * Used for discounts, commission and tax -- all of which must be deterministic
 * because they are re-derived on refund.
 */
export function percentOf(amount: Paise, percent: number): Paise {
  return Math.round((amount * percent) / 100);
}

/** Inverse of `percentOf`: what share of `total` is `part`, as a 0..100 number. */
export function percentageOf(part: Paise, total: Paise): number {
  if (total <= 0) return 0;
  return (part / total) * 100;
}

/**
 * Distribute an amount across weighted buckets so the parts sum EXACTLY to the
 * whole. Used to apportion a cart-level coupon or a shipping fee down to line
 * items, which is what makes partial refunds and per-seller settlement add up.
 * Largest-remainder method: leftover paise go to the largest fractional parts.
 */
export function allocateProportionally(amount: Paise, weights: readonly number[]): Paise[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0 || weights.length === 0) return weights.map(() => 0);

  const exact = weights.map((w) => (amount * w) / totalWeight);
  const floored = exact.map((v) => Math.floor(v));
  let remainder = amount - floored.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const result = [...floored];
  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    const target = order[cursor % order.length];
    result[target.i] += 1;
    remainder -= 1;
    cursor += 1;
  }
  return result;
}

/** Clamp a discount so it can never exceed the amount it applies to. */
export function clampDiscount(discount: Paise, cap: Paise): Paise {
  return Math.max(0, Math.min(Math.round(discount), Math.max(0, cap)));
}

/**
 * Extract the tax component from a tax-inclusive price. Indian retail quotes
 * GST-inclusive selling prices, so tax is backed out rather than added on.
 */
export function taxFromInclusive(inclusiveAmount: Paise, ratePercent: number): Paise {
  return Math.round((inclusiveAmount * ratePercent) / (100 + ratePercent));
}

/** Round a rupee amount up to the nearest whole rupee (settlement convention). */
export function roundToRupee(paise: Paise): Paise {
  return Math.round(paise / PAISE_PER_RUPEE) * PAISE_PER_RUPEE;
}
