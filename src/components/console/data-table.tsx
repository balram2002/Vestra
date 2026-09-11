import { cn } from '@/lib/cn';

/**
 * Console table.
 *
 * A Server Component by default: seller and admin tables are read-heavy and
 * paginate on the server, so shipping TanStack Table to the client to render
 * 25 static rows would be paying hydration for nothing. Rows that need an
 * action embed a client island in a cell instead.
 *
 * Three things that make a dense table usable and are easy to leave out:
 *
 *  - numeric columns are right-aligned and tabular-figured, so digits line up
 *    and a column of money can be scanned vertically;
 *  - every table declares its own empty state, because "no rows" and "no rows
 *    matching your filter" need different words and different exits;
 *  - the header is STICKY, so scrolling row 200 still tells you what column
 *    three is. It sticks to the scroll container, not the viewport, which is
 *    what makes it work inside the horizontally scrolling wrapper — a
 *    viewport-sticky header would detach the moment the table scrolled
 *    sideways. This was documented here for a phase before it was actually
 *    implemented; it is real now.
 */

export interface Column<T> {
  key: string;
  header: string;
  /** Right-align and use tabular figures. For money, counts, dates. */
  numeric?: boolean;
  /** Hidden below `sm`. Use for columns that are context, not identity. */
  secondary?: boolean;
  width?: string;
  render: (row: T) => React.ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  caption,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: React.ReactNode;
  caption?: string;
  className?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="border-line rounded-xl border border-dashed p-10 text-center">{empty}</div>
    );
  }

  return (
    <div className={cn('border-line bg-raised overflow-hidden rounded-xl border', className)}>
      {/*
        The wrapper scrolls, not the page: a wide table must never make the
        whole document scroll sideways. `max-h` plus `overflow-y` is what gives
        the sticky header something to stick to — `position: sticky` resolves
        against the nearest scrolling ancestor, so without a vertical scroll
        container here the header would have nothing to hold onto.
      */}
      <div className="max-h-[70dvh] overflow-auto">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}

          <thead>
            <tr className="border-line bg-sunken sticky top-0 z-10 border-b">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    'text-faint bg-sunken px-3 py-2.5 text-2xs font-semibold uppercase tracking-[0.1em]',
                    column.numeric ? 'text-right' : 'text-left',
                    column.secondary && 'hidden sm:table-cell',
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                // `relative` so a `.row-link` inside has something to fill.
                className="border-line hover:bg-sunken/70 relative border-b transition-colors last:border-b-0"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-3 py-2.5 align-middle',
                      column.numeric ? 'tabular text-right' : 'text-left',
                      column.secondary && 'hidden sm:table-cell',
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Consistent empty state for console tables. */
export function TableEmpty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-ink text-md font-medium">{title}</p>
      <p className="text-muted mx-auto mt-1.5 max-w-sm text-sm">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
