import type { HomeSection } from './types';

/**
 * Planning a homepage reset, as a pure function.
 *
 * The reset writes to many sections at once, and the only hard part is deciding
 * WHICH stored section each shipped one is. That decision lives here, apart from
 * the database, so it can be tested against real states -- a renamed rail, a
 * hidden hero, sections somebody added -- instead of being trusted.
 *
 * THE RULES, IN ORDER
 *
 *   1. A section stamped with a `defaultKey` IS that shipped section, whatever
 *      it has been renamed to, wherever it has been moved, hidden or not.
 *   2. An unstamped section is a shipped one if its kind and title match --
 *      which is what a freshly seeded homepage looks like.
 *   3. A shipped section nothing matches is created.
 *   4. Everything left over was added by somebody. It is HIDDEN and moved below
 *      the shipped layout, never deleted.
 *
 * Stamped rows are matched in a first pass, before any title matching, so an
 * unstamped look-alike can never claim a shipped section its stamped original
 * is still holding.
 */

export interface ShippedSection extends HomeSection {
  defaultKey: string;
}

export interface ResetPlan {
  /** Stored sections put back to a shipped default. */
  restore: Array<{ id: string; entry: ShippedSection; position: number }>;
  /** Shipped sections with no stored counterpart. */
  create: Array<{ entry: ShippedSection; position: number }>;
  /** Everything else: hidden, below the shipped layout, in its current order. */
  hide: Array<{ id: string; position: number }>;
}

export function planHomeReset(current: HomeSection[], defaults: ShippedSection[]): ResetPlan {
  const claimedRows = new Set<string>();
  const matched = new Map<string, string>();

  // Pass 1: stamped rows claim their own shipped section.
  for (const entry of defaults) {
    const stamped = current.find(
      (section) => !claimedRows.has(section.id) && section.defaultKey === entry.defaultKey,
    );
    if (stamped) {
      claimedRows.add(stamped.id);
      matched.set(entry.defaultKey, stamped.id);
    }
  }

  // Pass 2: unstamped rows, by kind and title, for whatever is still unclaimed.
  for (const entry of defaults) {
    if (matched.has(entry.defaultKey)) continue;
    const lookalike = current.find(
      (section) =>
        !claimedRows.has(section.id) &&
        !section.defaultKey &&
        section.kind === entry.kind &&
        (section.title ?? null) === (entry.title ?? null),
    );
    if (lookalike) {
      claimedRows.add(lookalike.id);
      matched.set(entry.defaultKey, lookalike.id);
    }
  }

  const plan: ResetPlan = { restore: [], create: [], hide: [] };

  defaults.forEach((entry, position) => {
    const id = matched.get(entry.defaultKey);
    if (id) plan.restore.push({ id, entry, position });
    else plan.create.push({ entry, position });
  });

  current
    .filter((section) => !claimedRows.has(section.id))
    .forEach((section, index) => {
      plan.hide.push({ id: section.id, position: defaults.length + index });
    });

  return plan;
}
