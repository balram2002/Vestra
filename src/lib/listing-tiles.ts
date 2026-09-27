/**
 * Which editorial tile, if any, follows the product at `index` in a listing:
 * the first after the fourth product -- inside the first screen on a phone,
 * never the very first thing -- then one every seven, so tiles punctuate a
 * grid rather than interrupting every row. Returns -1 when none follows.
 */
export function tileAfter(index: number): number {
  return index >= 3 && (index - 3) % 7 === 0 ? (index - 3) / 7 : -1;
}
