import { Check } from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * Checkout progress.
 *
 * Shows all four steps, including the ones not reached. Someone who can see
 * there are two steps left behaves differently from someone who cannot, and
 * hiding the length of a checkout is a reliable way to lose people at step two.
 *
 * ---------------------------------------------------------------------------
 * TWO PRESENTATIONS, ONE LIST
 * ---------------------------------------------------------------------------
 * Below `sm` this is a COUNTER and a bar: "Step 2 of 4 — Address & payment".
 * Four labels laid out horizontally at 320px either wrap to three ragged lines
 * or truncate to "Addre…", and both cost more vertical space than the
 * information is worth at the exact moment someone is trying to pay.
 *
 * Above `sm` it is the full rail with a connecting track. The track is the part
 * that is usually missing: without it the markers are four unrelated dots, and
 * with it they read as one journey with a measurable amount left.
 *
 * The markup is a single `<ol>` in both cases — the same list, styled two ways
 * — so assistive tech gets one ordered list with one `aria-current="step"`
 * rather than a duplicated set of hidden nodes announcing the flow twice.
 *
 * ---------------------------------------------------------------------------
 * THE TRACK
 * ---------------------------------------------------------------------------
 * Each step after the first owns the segment of track to its LEFT, drawn as a
 * pseudo-element. Owning it per-step rather than as one absolutely positioned
 * bar behind everything means the geometry needs no measurement: the segment
 * simply spans the gap its own list item creates, at any number of steps and
 * any label length.
 *
 * A completed segment is filled and scales in from its leading edge, so
 * advancing a step draws the line forward instead of blinking it on.
 */
const STEPS = ['Bag', 'Address & payment', 'Payment', 'Confirmed'];

export function CheckoutSteps({ current }: { current: number }) {
  // Clamped so an out-of-range step cannot produce a negative-width bar or an
  // undefined label — a checkout is the last place to render nonsense.
  const step = Math.max(0, Math.min(STEPS.length - 1, current));
  const percent = (step / (STEPS.length - 1)) * 100;

  return (
    <div className="mt-5">
      {/* ------------------------------------------------ phone: counter */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-ink text-sm font-semibold">{STEPS[step]}</p>
          <p className="text-faint tabular shrink-0 text-2xs font-medium">
            Step {step + 1} of {STEPS.length}
          </p>
        </div>

        {/*
          `aria-hidden` because the line above already states the position in
          words. A progressbar role here would announce "33 percent", which is
          a less useful sentence than "Step 2 of 4".
        */}
        {/*
          The fill is full-width and SCALED, not sized.

          `transition-[width]` was the obvious way to write this, and width is a
          layout property: every frame of the advance relayouts the bar and its
          parent. `scaleX` from the leading edge composites, and on a track this
          simple the two are visually identical.

          The floor of 0.06 keeps a sliver visible on step one — a progress bar
          at exactly zero reads as "not started" rather than "started".
        */}
        <div className="bg-sunken mt-2 h-1 overflow-hidden rounded-full" aria-hidden>
          <div
            className="bg-ink h-full w-full origin-left rounded-full transition-transform duration-(--duration-slow) ease-(--ease-out)"
            style={{ transform: `scaleX(${Math.max(percent / 100, 0.06)})` }}
          />
        </div>
      </div>

      {/* -------------------------------------------------- desktop: rail */}
      <ol className="hidden items-center sm:flex">
        {STEPS.map((label, index) => {
          const done = index < step;
          const active = index === step;

          return (
            <li
              key={label}
              className={cn(
                'relative flex min-w-0 items-center gap-2',
                // Every step but the first stretches to absorb the row's spare
                // width, which is what makes the track segments equal.
                index > 0 && 'flex-1 pl-3',
                /*
                 * The segment of track to this step's left.
                 *
                 * `origin-left` plus `scale-x` rather than a width transition:
                 * width relayouts the whole row on every advance, and the row
                 * contains four labels that would each be re-measured.
                 */
                index > 0 && [
                  'before:bg-line before:absolute before:left-0 before:right-full before:top-1/2',
                  'before:h-px before:w-full before:-translate-y-1/2',
                  'after:absolute after:left-0 after:top-1/2 after:h-px after:w-full',
                  'after:-translate-y-1/2 after:origin-left after:bg-ink',
                  'after:transition-transform after:duration-(--duration-slow) after:ease-(--ease-out)',
                  done || active ? 'after:scale-x-100' : 'after:scale-x-0',
                ],
              )}
            >
              <span
                className={cn(
                  'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full',
                  'text-2xs font-semibold transition-colors duration-(--duration-base)',
                  done && 'bg-success-fill text-white',
                  // A ring rather than a larger circle: growing the marker on
                  // the active step shifts the track segments either side of it.
                  active && 'bg-ink text-canvas ring-4 ring-(--accent-soft)',
                  !done && !active && 'bg-sunken text-faint',
                )}
                aria-hidden
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
              </span>

              <span
                className={cn(
                  'relative z-10 truncate pr-3 text-xs',
                  // The label sits on the page ground, and the track runs
                  // underneath it — so it needs a ground of its own or the line
                  // strikes through the words.
                  'bg-canvas',
                  active ? 'text-ink font-semibold' : done ? 'text-muted' : 'text-faint',
                )}
                aria-current={active ? 'step' : undefined}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
