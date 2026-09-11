'use client';

import * as RadixTooltip from '@radix-ui/react-tooltip';

import { cn } from '@/lib/cn';

/**
 * Tooltip.
 *
 * Read this before using it: **a tooltip is never the only way to learn
 * something.** It does not exist on touch, it does not survive a screenshot,
 * and it is gone the moment the pointer moves. So it may hold a helpful aside
 * and nothing else — never the label of an icon-only control, never the reason
 * a button is disabled, never a price.
 *
 * An icon-only control gets an `aria-label` AND, in the consoles, a visible
 * text label. That is the rule the Shopix sidebar breaks by collapsing to seven
 * unlabelled glyphs at 1200px, and the reason our console rail keeps its words.
 *
 * `Provider` is exported so a page can wrap a group of tooltips and share one
 * delay — otherwise every tooltip in a toolbar waits its own 700ms and the
 * second one someone hovers feels broken.
 */

export const TooltipProvider = RadixTooltip.Provider;

export function Tooltip({
  content,
  children,
  side = 'top',
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'bg-inverse text-on-inverse z-50 max-w-56 rounded-md px-2.5 py-1.5 text-2xs shadow-md',
            'motion-safe:data-[state=delayed-open]:animate-[mrd-fade-in_var(--duration-fast)_var(--ease-out)]',
            className,
          )}
        >
          {content}
          <RadixTooltip.Arrow className="fill-(--surface-inverse)" width={10} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
