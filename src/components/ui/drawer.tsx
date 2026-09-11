'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/cn';

import { CLOSE_BUTTON, OVERLAY } from './dialog';

/**
 * Drawer.
 *
 * A dialog that arrives from an edge and is sized to a LIST rather than to a
 * sentence: navigation, a filter rail, a long form. It is `Dialog` underneath —
 * same focus trap, same inert page, same Escape — so there is one overlay
 * behaviour in the app rather than two that drift. The scrim and the close
 * button are literally the same constants.
 *
 * Why a separate component instead of a `Dialog` variant: a drawer is
 * full-height and edge-anchored, which changes the scroll model entirely. Its
 * body is the only thing that scrolls and it must reach the bottom of the
 * viewport, so the header and footer are pinned rather than being part of a
 * centred box that grows to fit.
 *
 * `side` defaults to `left` because that is where navigation lives. Filters
 * open from the `right` on a phone, where the thumb that opened them already
 * is. `bottom` is for a short set of choices — a sort order, a size picker —
 * that would look lost in a full-height panel.
 */

export const Drawer = RadixDialog.Root;
export const DrawerTrigger = RadixDialog.Trigger;
export const DrawerClose = RadixDialog.Close;

export function DrawerContent({
  title,
  description,
  side = 'left',
  children,
  footer,
  className,
}: {
  title: string;
  description?: string;
  side?: 'left' | 'right' | 'bottom';
  children: React.ReactNode;
  /** Pinned to the bottom edge — "Apply filters" must never scroll away. */
  footer?: React.ReactNode;
  className?: string;
}) {
  const bottom = side === 'bottom';

  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className={cn(OVERLAY)} />

      <RadixDialog.Content
        aria-describedby={undefined}
        className={cn(
          'bg-raised border-line fixed z-50 flex flex-col shadow-xl',
          bottom
            ? [
                'inset-x-0 bottom-0 max-h-[82dvh] rounded-t-2xl border-t',
                'motion-safe:data-[state=open]:animate-[mrd-slide-from-bottom_var(--duration-drawer)_var(--ease-out)]',
                'motion-safe:data-[state=closed]:animate-[mrd-slide-to-bottom_var(--duration-base)_var(--ease-in)]',
              ]
            : [
                'inset-y-0 w-[min(23rem,90vw)]',
                side === 'left'
                  ? [
                      'left-0 border-r',
                      'motion-safe:data-[state=open]:animate-[mrd-slide-from-left_var(--duration-drawer)_var(--ease-out)]',
                      'motion-safe:data-[state=closed]:animate-[mrd-slide-to-left_var(--duration-base)_var(--ease-in)]',
                    ]
                  : [
                      'right-0 border-l',
                      'motion-safe:data-[state=open]:animate-[mrd-slide-from-right_var(--duration-drawer)_var(--ease-out)]',
                      'motion-safe:data-[state=closed]:animate-[mrd-slide-to-right_var(--duration-base)_var(--ease-in)]',
                    ],
              ],
          className,
        )}
      >
        {bottom ? (
          <span
            aria-hidden
            className="bg-line-strong mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full"
          />
        ) : null}

        <div className="border-line flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <RadixDialog.Title className="text-ink truncate text-sm font-semibold">
              {title}
            </RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="text-muted mt-0.5 truncate text-xs">
                {description}
              </RadixDialog.Description>
            ) : null}
          </div>

          <RadixDialog.Close aria-label="Close" className={cn(CLOSE_BUTTON, '-mr-2')}>
            <X className="size-4" aria-hidden />
          </RadixDialog.Close>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>

        {footer ? (
          <div
            className={cn(
              'border-line bg-raised flex items-center gap-2 border-t p-3',
              'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
            )}
          >
            {footer}
          </div>
        ) : null}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
