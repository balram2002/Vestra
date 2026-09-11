import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/**
 * Table primitives.
 *
 * `console/data-table.tsx` covers the common case — a column spec and an array
 * of rows. These are for the tables that cannot be expressed that way: an
 * invoice's line items, a settlement's deduction breakdown, a variant matrix
 * with an editable cell. Before this they were hand-rolled per screen, and the
 * padding, the header treatment and the row rule drifted between them.
 *
 * The rules a dense table has to follow, encoded here so no screen has to
 * remember:
 *
 *  - the WRAPPER scrolls, never the page. A wide table that makes the whole
 *    document scroll sideways is the single most common responsive regression,
 *    and it is invisible in a full-page screenshot;
 *  - the header is sticky, so scrolling to row 200 still says what column three
 *    is;
 *  - numeric cells are right-aligned and tabular-figured, so a column of money
 *    can be scanned down rather than read across;
 *  - row height is constant. A table whose rows change height as content
 *    wraps cannot be scanned at all.
 */

export function TableFrame({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('border-line overflow-hidden rounded-lg border', className)} {...props}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <table
      className={cn('w-full border-collapse text-left text-sm', className)}
      {...props}
    />
  );
}

export function THead({ className, sticky = true, ...props }: ComponentProps<'thead'> & { sticky?: boolean }) {
  return (
    <thead
      className={cn(
        'bg-sunken text-faint',
        // `sticky` on <thead> needs the scroll container above it, which
        // TableFrame provides. Without a background it would show rows through.
        sticky && 'sticky top-0 z-10',
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={className} {...props} />;
}

export function Tr({
  className,
  interactive,
  ...props
}: ComponentProps<'tr'> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        // `relative` so a `.row-link` inside has something to fill.
        'border-line relative border-b last:border-b-0',
        interactive &&
          'hover:bg-sunken/60 transition-colors duration-(--duration-instant) ease-(--ease-out)',
        className,
      )}
      {...props}
    />
  );
}

export function Th({
  className,
  numeric,
  secondary,
  ...props
}: ComponentProps<'th'> & { numeric?: boolean; secondary?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        'border-line border-b px-3 py-2.5 text-2xs font-medium uppercase tracking-[0.1em]',
        numeric ? 'text-right' : 'text-left',
        secondary && 'hidden sm:table-cell',
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  numeric,
  secondary,
  ...props
}: ComponentProps<'td'> & { numeric?: boolean; secondary?: boolean }) {
  return (
    <td
      className={cn(
        'h-11 px-3 py-2.5 align-middle',
        numeric ? 'tabular text-right' : 'text-left',
        secondary && 'hidden sm:table-cell',
        className,
      )}
      {...props}
    />
  );
}
