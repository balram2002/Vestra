import { Check } from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * Checkout progress.
 *
 * Shows all four steps, including the ones not reached. Someone who can see
 * there are two steps left behaves differently from someone who cannot, and
 * hiding the length of a checkout is a reliable way to lose people at step two.
 */
const STEPS = ['Bag', 'Address & payment', 'Payment', 'Confirmed'];

export function CheckoutSteps({ current }: { current: number }) {
  return (
    <ol className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs">
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;

        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-full text-2xs font-semibold',
                done && 'bg-success-500 text-white',
                active && 'bg-ink text-canvas',
                !done && !active && 'bg-sunken text-faint',
              )}
              aria-hidden
            >
              {done ? <Check className="size-3" /> : index + 1}
            </span>

            <span
              className={active ? 'text-ink font-medium' : 'text-faint'}
              aria-current={active ? 'step' : undefined}
            >
              {step}
            </span>

            {index < STEPS.length - 1 ? (
              <span className="bg-line mx-1 hidden h-px w-6 sm:block" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
