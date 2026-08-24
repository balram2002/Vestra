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
 *  - the header is sticky, so scrolling row 200 still tells you what column
 *    three is.
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
      <div className="border-line rounded-lg border border-dashed p-10 text-center">{empty}</div>
    );
  }

  return (
    <div className={cn('border-line overflow-hidden rounded-lg border', className)}>
      {/* The wrapper scrolls, not the page: a wide table must never make the
          whole document scroll sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}

          <thead>
            <tr className="border-line bg-sunken border-b">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    'text-faint px-3 py-2.5 text-2xs font-medium uppercase tracking-[0.1em]',
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
                className="border-line hover:bg-sunken/60 border-b transition-colors last:border-b-0"
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
