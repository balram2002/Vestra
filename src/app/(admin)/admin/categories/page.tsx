import type { Metadata } from 'next';
import Link from 'next/link';
import { CornerDownRight } from 'lucide-react';
import { Suspense } from 'react';

import { CategoryToggle } from '@/components/console/admin-actions';
import { CreateCategoryDialog } from '@/components/console/admin-create';
import { EditCategoryDialog } from '@/components/console/catalog-edit';
import { PageHeader } from '@/components/console/page-header';
import { Badge } from '@/components/ui/badge';
import type { Category } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatCompactNumber } from '@/lib/format';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionUser, requirePermission } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Categories' };

/**
 * Taxonomy.
 *
 * Rendered as the tree it actually is, not a flat table. The hierarchy IS the
 * information here: a catalogue manager needs to see that "Kurtas and suit
 * sets" sits under "Ethnic wear" under "Women", because that path is what
 * drives the mega menu, the facets and the tax slab.
 *
 * One card per department, so the tree reads in columns on a wide screen and
 * the nesting inside each card stays shallow enough to scan.
 */
export default function AdminCategoriesPage() {
  return (
    <>
      <PageHeader
        title="Categories"
        description="The taxonomy behind the mega menu, facets and tax slabs."
        actions={
          <Suspense fallback={null}>
            <NewCategoryAction />
          </Suspense>
        }
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-xl" aria-hidden />}>
        <CategoryTree />
      </Suspense>
    </>
  );
}

/** Only someone who can edit the catalogue gets the button. */
async function NewCategoryAction() {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.permissions, 'catalog:write')) return null;

  const categoryCol = await collections.categories();
  const rows = toEntities(
    await categoryCol.find({ depth: { $lte: 1 } }).sort({ depth: 1, position: 1 }).toArray(),
  );
  const byId = new Map(rows.map((category) => [category.id, category]));

  const parents = rows
    .map((category) => ({
      id: category.id,
      label: category.parentId
        ? `${byId.get(category.parentId)?.name ?? ''} / ${category.name}`
        : category.name,
      taxRatePercent: category.taxRatePercent,
      returnable: category.returnable,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return <CreateCategoryDialog parents={parents} />;
}

async function CategoryTree() {
  const user = await requirePermission('catalog:read');
  const canWrite = hasPermission(user.permissions, 'catalog:write');

  const categoryCol = await collections.categories();
  const categories = toEntities(
    await categoryCol.find({}).sort({ depth: 1, position: 1 }).toArray(),
  );

  const byParent = new Map<string | null, Category[]>();
  for (const category of categories) {
    byParent.set(category.parentId, [...(byParent.get(category.parentId) ?? []), category]);
  }

  // Every descendant in display order, flattened into one list per department.
  const descendants = (parentId: string): Category[] =>
    (byParent.get(parentId) ?? []).flatMap((child) => [child, ...descendants(child.id)]);

  const departments = byParent.get(null) ?? [];

  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-2">
      {departments.map((department) => {
        const rows = descendants(department.id);
        const hidden = rows.filter((row) => !row.isActive).length;

        return (
          <section
            key={department.id}
            aria-labelledby={`dept-${department.id}`}
            className="border-line bg-raised overflow-hidden rounded-xl border"
          >
            <header className="border-line flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3">
              <h2 id={`dept-${department.id}`} className="text-ink text-sm font-semibold">
                <Link
                  href={`/category/${department.slug}`}
                  className="underline-offset-2 hover:underline"
                >
                  {department.name}
                </Link>
              </h2>
              <span className="text-faint text-2xs">
                {rows.length} {rows.length === 1 ? 'category' : 'categories'}
                {hidden > 0 ? `${' \u00b7 '}${hidden} hidden` : ''}
              </span>
            </header>

            {rows.length === 0 ? (
              <p className="text-faint px-4 py-6 text-xs">Nothing under this department yet.</p>
            ) : (
              <ul className="divide-line divide-y">
                {rows.map((category) => (
                  <CategoryRow key={category.id} category={category} canWrite={canWrite} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function CategoryRow({ category, canWrite }: { category: Category; canWrite: boolean }) {
  const indent = Math.max(0, category.depth - 1);

  return (
    <li className={cn('flex items-center gap-3 px-4 py-2.5', !category.isActive && 'bg-sunken')}>
      <div className="flex min-w-0 flex-1 items-center gap-2" style={{ paddingLeft: indent * 20 }}>
        {indent > 0 ? (
          <CornerDownRight className="text-faint size-3.5 shrink-0" aria-hidden />
        ) : null}
        {category.isActive ? (
          <Link
            href={`/category/${category.slug}`}
            className="text-ink truncate text-xs font-medium underline-offset-2 hover:underline"
          >
            {category.name}
          </Link>
        ) : (
          <span className="text-muted truncate text-xs font-medium">{category.name}</span>
        )}
        {category.featured ? (
          <Badge tone="accent" size="sm">
            Featured
          </Badge>
        ) : null}
      </div>

      <span className="text-faint tabular hidden shrink-0 text-2xs sm:inline">
        {formatCompactNumber(category.productCount)} styles
      </span>
      <span className="text-faint tabular hidden shrink-0 text-2xs md:inline">
        GST {category.taxRatePercent}%
      </span>
      <Badge tone={category.returnable ? 'neutral' : 'warning'} size="sm">
        {category.returnable ? 'Returnable' : 'Final sale'}
      </Badge>
      {canWrite ? (
        <>
          <EditCategoryDialog
            category={{
              id: category.id,
              name: category.name,
              description: category.description,
              imageUrl: category.imageUrl,
              bannerUrl: category.bannerUrl,
              featured: category.featured,
              isActive: category.isActive,
            }}
          />
          <CategoryToggle
            categoryId={category.id}
            name={category.name}
            isActive={category.isActive}
          />
        </>
      ) : null}
    </li>
  );
}