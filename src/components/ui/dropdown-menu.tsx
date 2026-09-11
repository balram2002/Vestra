'use client';

import * as Radix from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/**
 * Dropdown menu.
 *
 * Radix underneath, because a menu is the most over-specified widget in
 * WAI-ARIA and every hand-rolled one gets something wrong: arrow-key roving,
 * typeahead, focus returning to the trigger, Escape, and an outside click that
 * dismisses WITHOUT also activating whatever was under it. This file is only
 * the look.
 *
 * It animates on the same `data-[state]` pattern as every other overlay — Radix
 * keeps the panel mounted until the close animation ends, so it leaves as
 * deliberately as it arrived instead of vanishing in a frame.
 */

export const DropdownMenu = Radix.Root;
export const DropdownMenuTrigger = Radix.Trigger;
export const DropdownMenuGroup = Radix.Group;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  ...props
}: ComponentProps<typeof Radix.Content>) {
  return (
    <Radix.Portal>
      <Radix.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'bg-raised border-line z-50 min-w-56 overflow-hidden rounded-xl border p-1.5 shadow-lg',
          // Grows from the edge nearest its trigger, so it reads as coming OUT
          // of the thing that opened it.
          'origin-(--radix-dropdown-menu-content-transform-origin)',
          'motion-safe:data-[state=open]:animate-[mrd-pop_var(--duration-base)_var(--ease-out)]',
          'motion-safe:data-[state=closed]:animate-[mrd-pop-out_var(--duration-fast)_var(--ease-in)]',
          className,
        )}
        {...props}
      />
    </Radix.Portal>
  );
}

const ITEM = [
  'relative flex min-h-10 cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 text-sm',
  'text-ink outline-none transition-colors duration-(--duration-fast)',
  // Radix moves `data-highlighted` with the keyboard as well as the pointer, so
  // one selector covers hover AND arrow-key focus.
  'data-[highlighted]:bg-sunken',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
  "[&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted",
] as const;

export function DropdownMenuItem({
  className,
  destructive = false,
  ...props
}: ComponentProps<typeof Radix.Item> & {
  /** Red text and icon. For sign out, delete, suspend. */
  destructive?: boolean;
}) {
  return (
    <Radix.Item
      className={cn(
        ITEM,
        destructive && 'text-danger-700 [&_svg]:text-danger-700 data-[highlighted]:bg-danger-50',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Radix.CheckboxItem>) {
  return (
    <Radix.CheckboxItem className={cn(ITEM, 'pr-8', className)} {...props}>
      {children}
      <Radix.ItemIndicator className="absolute right-2.5">
        <Check className="text-accent-ink size-4" aria-hidden />
      </Radix.ItemIndicator>
    </Radix.CheckboxItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Radix.Label>) {
  return (
    <Radix.Label
      className={cn(
        'text-faint px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-[0.12em]',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Radix.Separator>) {
  return <Radix.Separator className={cn('bg-line -mx-1.5 my-1.5 h-px', className)} {...props} />;
}
