import { ContentIcon } from '@/components/ui/content-icon';
import { Reveal } from '@/components/ui/reveal';
import type { ValueProp } from '@/domain/site-content';
import { cn } from '@/lib/cn';
import { staggerIndex } from '@/lib/motion';

/**
 * Value props.
 *
 * The last section before the footer, and the one that answers the objections a
 * first-time buyer on a marketplace actually has: will it arrive, can I send it
 * back, and who is this seller.
 *
 * Each one states a NUMBER. "Fast delivery" is a claim; "3–6 days, calculated
 * from your pincode" is a promise, and the difference is the entire reason this
 * section is worth its vertical space. Copy that could appear on any shop is
 * copy nobody reads.
 *
 * The icons are `aria-hidden` and stroked at 1.5 rather than filled: at this
 * size a filled glyph competes with the heading, and the heading is what
 * carries the meaning. They exist to give the eye an entry point per column,
 * not to convey anything on their own.
 */
/**
 * The copy is DATA now.
 *
 * It ships with the three promises below as defaults, and an administrator
 * edits them under Appearance -- because "free delivery above ₹1,199" is a
 * commercial decision that changes without a deploy, and a number that
 * disagrees with the shipping rules is worse than no number at all.
 */
export function ValueProps({ items }: { items: ValueProp[] }) {
  const shown = items.filter((item) => item.isActive);
  if (shown.length === 0) return null;

  return (
    <Reveal as="section" className="gutter shell-max py-12 sm:py-16">
      <ul
        className={cn(
          'border-line bg-raised stagger grid gap-8 rounded-2xl border p-7 sm:gap-10 sm:p-10',
          // The grid follows the count rather than assuming three: two promises
          // in a three-column grid leaves a hole where the third used to be.
          shown.length === 1 && 'sm:grid-cols-1',
          shown.length === 2 && 'sm:grid-cols-2',
          shown.length >= 3 && 'sm:grid-cols-3',
        )}
      >
        {shown.map(({ id, icon, title, body }, index) => (
          <li key={id} style={staggerIndex(index)}>
            <span
              className="bg-accent-soft text-accent-ink grid size-11 place-items-center rounded-full"
              aria-hidden
            >
              <ContentIcon name={icon} className="size-5" />
            </span>

            <h3 className="font-display text-ink mt-4 text-md font-semibold">{title}</h3>
            <p className="text-muted mt-2 text-sm">{body}</p>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}
