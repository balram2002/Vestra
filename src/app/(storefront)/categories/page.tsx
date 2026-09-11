import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { absoluteUrl } from '@/config/site';
import type { Category } from '@/domain/types';
import { getCategoryTree } from '@/server/services/catalog';

export const metadata: Metadata = {
  title: 'Shop by category',
  description:
    'Every department on VestraWAB — womenswear, menswear, kids, beauty, footwear, accessories and home.',
  alternates: { canonical: absoluteUrl('/categories') },
};

/**
 * The category index.
 *
 * Browsing the catalogue used to require the mega menu, which is a pointer
 * affordance: it opens on hover, lays out four columns, and on a phone it
 * collapses into a hamburger nobody opens. So the entire taxonomy was
 * effectively desktop-only, and "Shop" had nowhere to go on mobile.
 *
 * Departments as headings with their children beneath, rather than an
 * accordion. A shopper on this page is looking for a department they already
 * have in mind, and every tap that only reveals more taps is a tap that found
 * them nothing.
 */
export default function CategoriesPage() {
  return (
    <div className="gutter shell-max py-6 sm:py-10">
      <header className="mb-6 sm:mb-8">
        <h1 className="font-display text-ink text-2xl sm:text-3xl">Shop by category</h1>
        <p className="text-muted mt-1.5 text-sm">
          Every department, and what sits inside it.
        </p>
      </header>

      <Suspense fallback={<CategoriesSkeleton />}>
        <Departments />
      </Suspense>
    </div>
  );
}

async function Departments() {
  const categories = await getCategoryTree();

  const departments = categories.filter((category) => category.depth === 0);
  const byParent = new Map<string, Category[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const siblings = byParent.get(category.parentId) ?? [];
    siblings.push(category);
    byParent.set(category.parentId, siblings);
  }

  if (departments.length === 0) {
    return <p className="text-muted text-sm">Nothing to browse yet.</p>;
  }

  return (
    <div className="space-y-8 sm:space-y-10">
      {departments.map((department) => {
        const children = byParent.get(department.id) ?? [];

        return (
          <section key={department.id} aria-labelledby={`dept-${department.id}`}>
            <div className="border-line mb-3 flex items-baseline justify-between gap-3 border-b pb-2">
              <h2 id={`dept-${department.id}`} className="font-display text-ink text-lg sm:text-xl">
                {department.name}
              </h2>
              <Link
                href={`/category/${department.slug}`}
                className="text-accent-ink inline-flex min-h-11 min-w-11 shrink-0 items-center justify-end text-xs font-medium underline-offset-4 hover:underline lg:min-h-0 lg:min-w-0"
              >
                All {department.name.toLowerCase()}
              </Link>
            </div>

            {children.length > 0 ? (
              /*
               * Two columns on a phone rather than one.
               *
               * Category names are short, and a single column of eight would
               * push the next department off the screen entirely — the whole
               * point of this page is seeing the shape of the catalogue.
               */
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
                {children.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={`/category/${child.slug}`}
                      className="text-muted hover:text-ink flex min-h-11 items-center text-sm transition-colors lg:min-h-0 lg:py-2"
                    >
                      {child.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function CategoriesSkeleton() {
  return (
    <div className="space-y-10" aria-hidden>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index}>
          <div className="skeleton mb-3 h-6 w-40 rounded" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }, (_, cell) => (
              <div key={cell} className="skeleton h-8 rounded" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
