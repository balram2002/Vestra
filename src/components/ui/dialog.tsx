'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * Dialog.
 *
 * On Radix rather than the native `<dialog>` element, because the parts that
 * are hard are the parts Radix already gets right: focus is trapped and
 * restored to whatever opened it, the page behind is inert to a screen reader,
 * Escape and outside-click close, and the scroll position of the page does not
 * jump when the scrollbar disappears.
 *
 * What is ours:
 *
 *  - it becomes a BOTTOM SHEET below `sm`. A centred box on a phone puts the
 *    primary action in the middle of the screen, out of thumb reach, and a
 *    keyboard opening under it pushes the whole thing off the top. Rising from
 *    the bottom edge keeps the actions where the thumb already is;
 *  - the content scrolls, the frame does not. A long confirm — a return with
 *    twelve line items — must not push its own buttons off the bottom;
 *  - the close button is a real 44px target with a name, not a 12px glyph;
 *  - the overlay is BLURRED as well as darkened. A flat scrim reads as a sheet
 *    of paper over the page; a blur reads as depth, and it also stops a busy
 *    product grid from competing with the dialog's own type;
 *  - motion is transform and opacity only, and the whole thing is disabled
 *    under `prefers-reduced-motion` by the global guard.
 *
 * `title` is required by the type, not optional-with-a-fallback: a dialog with
 * no accessible name announces as "dialog" and nothing else. `description` is
 * optional but wired to `aria-describedby` when present.
 */

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

/** Shared by every overlay in the system, so there is one scrim and not four. */
export const OVERLAY = [
  'fixed inset-0 z-50 bg-(--surface-overlay) backdrop-blur-[3px]',
  'motion-safe:data-[state=open]:animate-[mrd-fade-in_var(--duration-base)_var(--ease-out)]',
  'motion-safe:data-[state=closed]:animate-[mrd-fade-out_var(--duration-fast)_var(--ease-in)]',
] as const;

/** The 44px close control every overlay carries in its top-right corner. */
export const CLOSE_BUTTON = [
  'text-muted hover:bg-sunken hover:text-ink grid size-11 shrink-0 place-items-center rounded-full',
  'transition-colors duration-(--duration-base) ease-(--ease-out)',
  'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
] as const;

export function DialogContent({
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Pinned below the scrolling body so actions never scroll away. */
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className={cn(OVERLAY)} />

      <RadixDialog.Content
        /* Radix warns when a dialog has no description; say so explicitly. */
        aria-describedby={undefined}
        className={cn(
          'bg-raised border-line fixed z-50 flex flex-col border shadow-xl',
          // Phone: a sheet on the bottom edge, full width, rounded at the top.
          'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl',
          'motion-safe:data-[state=open]:animate-[mrd-slide-from-bottom_var(--duration-drawer)_var(--ease-out)]',
          'motion-safe:data-[state=closed]:animate-[mrd-slide-to-bottom_var(--duration-base)_var(--ease-in)]',
          // Tablet up: a centred box.
          'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2',
          'sm:max-h-[85dvh] sm:w-[calc(100vw-3rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl',
          'sm:motion-safe:data-[state=open]:animate-[mrd-pop_var(--duration-slow)_var(--ease-out)]',
          'sm:motion-safe:data-[state=closed]:animate-[mrd-pop-out_var(--duration-fast)_var(--ease-in)]',
          size === 'sm' && 'sm:max-w-sm',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-2xl',
          className,
        )}
      >
        {/*
          The grabber.

          Phone only, and purely a signal: it says "this came from the bottom
          edge and can go back there", which is the convention every native
          sheet has trained people on. It is not a drag handle here — Radix owns
          the open state — so it is `aria-hidden` rather than pretending to be a
          control that does nothing.
        */}
        <span
          aria-hidden
          className="bg-line-strong mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full sm:hidden"
        />

        <div className="border-line flex items-start justify-between gap-4 border-b p-5">
          <div className="min-w-0">
            <RadixDialog.Title className="text-ink text-md font-semibold leading-tight">
              {title}
            </RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="text-muted mt-1 text-sm">
                {description}
              </RadixDialog.Description>
            ) : null}
          </div>

          <RadixDialog.Close aria-label="Close" className={cn(CLOSE_BUTTON, '-m-2')}>
            <X className="size-4" aria-hidden />
          </RadixDialog.Close>
        </div>

        {/* The body scrolls; the header and footer do not. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>

        {footer ? (
          <div
            className={cn(
              'border-line bg-raised flex flex-wrap items-center justify-end gap-2 border-t p-4',
              // Clears the home indicator on a notched phone, where the last
              // few pixels of a bottom sheet are otherwise not tappable.
              'pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4',
            )}
          >
            {footer}
          </div>
        ) : null}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
