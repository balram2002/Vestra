import { RotateCcw, ShieldCheck, Truck } from 'lucide-react';

import { Reveal } from '@/components/ui/reveal';
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
const PROPS = [
  {
    icon: Truck,
    title: 'Free delivery above ₹1,199',
    body: 'Standard delivery in 3–6 days, 2–4 across metros. Every estimate is calculated from your pincode, never guessed.',
  },
  {
    icon: RotateCcw,
    title: '14-day returns and exchanges',
    body: 'Unworn, tags intact. Reverse pickup is free whenever the fault is ours, and refunds land within 5 working days.',
  },
  {
    icon: ShieldCheck,
    title: 'Every seller reviewed',
    body: 'Our team approves every store before it can sell, and each store page shows its real record: ratings, dispatch time and returns.',
  },
] as const;

export function ValueProps() {
  return (
    <Reveal as="section" className="gutter shell-max py-12 sm:py-16">
      <ul className="border-line bg-raised stagger grid gap-8 rounded-2xl border p-7 sm:grid-cols-3 sm:gap-10 sm:p-10">
        {PROPS.map(({ icon: Icon, title, body }, index) => (
          <li key={title} style={staggerIndex(index)}>
            <span
              className="bg-accent-soft text-accent-ink grid size-11 place-items-center rounded-full"
              aria-hidden
            >
              <Icon className="size-5" strokeWidth={1.6} />
            </span>

            <h3 className="font-display text-ink mt-4 text-md font-semibold">{title}</h3>
            <p className="text-muted mt-2 text-sm">{body}</p>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}
