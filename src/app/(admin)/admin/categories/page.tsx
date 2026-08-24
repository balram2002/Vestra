import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { requirePermission } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';
import { formatCompactNumber } from '@/lib/format';

export const metadata: Metadata = { title: 'Categories' };

/**
 * Taxonomy.
 *
 * Rendered as the tree it actually is, not a flat table. The hierarchy IS the
 * information here: a catalogue manager needs to see that "Kurtas and suit
 * sets" sits under "Ethnic wear" under "Women", because that path is what
 * drives the mega menu, the facets and the tax slab.
 */
export default function AdminCategoriesPage() {
  return (
    <>
      <h1 className="font-display text-ink text-xl">Categories</h1>
      <p className="text-muted mt-1 text-sm">
        The taxonomy behind the mega menu, facets and tax slabs.
      </p>

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <CategoryTree />
      </Suspense>
    </>
  );
}

async function CategoryTree() {
  await requirePermission('catalog:read');

  const categoryCol = await collections.categories();
  const categories = toEntities(
    await categoryCol.find({}).sort({ depth: 1, position: 1 }).toArray(),
  );

  const byParent = new Map<string | null, typeof categories>();
  for (const category of categories) {
    const key = category.parentId;
    byParent.set(key, [...(byParent.get(key) ?? []), category]);
  }

  const render = (parentId: string | null, depth: number): React.ReactNode => {
    const children = byParent.get(parentId) ?? [];
    if (children.length === 0) return null;

    return (
      <ul className={depth === 0 ? 'space-y-2' : 'mt-1 space-y-1'}>
        {children.map((category) => (
          <li key={category.id}>
            <div
              className="border-line bg-raised flex items-center gap-3 rounded-md border px-3 py-2"
              style={{ marginLeft: depth * 20 }}
            >
              <Link
                href={`/category/${category.slug}`}
                className="text-ink min-w-0 flex-1 truncate text-xs font-medium hover:underline"
              >
                {category.name}
              </Link>

              <span className="text-faint shrink-0 text-2xs">
                {formatCompactNumber(category.productCount)} styles
              </span>
              <span className="text-faint shrink-0 text-2xs">GST {category.taxRatePercent}%</span>
              <span
                className={
                  category.returnable
                    ? 'text-success-600 shrink-0 text-2xs'
                    : 'text-danger-600 shrink-0 text-2xs'
                }
              >
                {category.returnable ? 'returnable' : 'final sale'}
              </span>
            </div>

            {render(category.id, depth + 1)}
          </li>
        ))}
      </ul>
    );
  };

  return <div className="mt-6">{render(null, 0)}</div>;
}
