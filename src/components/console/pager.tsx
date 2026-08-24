import Link from 'next/link';

/**
 * Page controls for a console table.
 *
 * Shows the range and the total, not just arrows: "26-50 of 1,412" tells
 * someone whether the filter they applied did anything, which a bare Next
 * button does not. Renders nothing at all for a single page.
 */
export function Pager({
  basePath,
  params,
  page,
  total,
  pageSize,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  total: number;
  pageSize: number;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  const href = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    query.set('page', String(target));
    return `${basePath}?${query.toString()}`;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="mt-4 flex items-center justify-between gap-4">
      <p className="text-faint tabular text-xs">
        {from.toLocaleString('en-IN')}-{to.toLocaleString('en-IN')} of{' '}
        {total.toLocaleString('en-IN')}
      </p>

      <div className="flex items-center gap-4">
        {page > 1 ? (
          <Link href={href(page - 1)} className="text-ink text-xs font-medium hover:underline">
            Previous
          </Link>
        ) : (
          <span className="text-faint text-xs">Previous</span>
        )}

        <span className="text-faint tabular text-xs">
          {page} / {pageCount}
        </span>

        {page < pageCount ? (
          <Link href={href(page + 1)} className="text-ink text-xs font-medium hover:underline">
            Next
          </Link>
        ) : (
          <span className="text-faint text-xs">Next</span>
        )}
      </div>
    </div>
  );
}
