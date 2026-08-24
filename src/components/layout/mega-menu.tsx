import Link from 'next/link';

import type { Category } from '@/domain/types';

/**
 * Department mega menu.
 *
 * A Server Component driven entirely by the taxonomy — the menu cannot drift
 * from the catalogue because it IS the catalogue. Adding a shelf in the admin
 * console puts it here on the next `revalidateTag('taxonomy')`.
 *
 * Opening is CSS-only (`group-hover` plus `focus-within`), so the whole
 * navigation ships zero JavaScript and works before hydration. `focus-within`
 * is what makes it keyboard-operable without a JS menu implementation.
 */
export function MegaMenu({
  menu,
}: {
  menu: Array<{ department: Category; groups: Array<{ shelf: Category; leaves: Category[] }> }>;
}) {
  return (
    <nav aria-label="Departments" className="hidden h-full lg:block">
      <ul className="flex h-full items-stretch">
        {menu.map(({ department, groups }) => (
          <li key={department.id} className="group static flex items-stretch">
            <Link
              href={`/category/${department.slug}`}
              className="text-ink hover:text-accent-ink group-hover:text-accent-ink relative flex items-center px-4 text-xs font-semibold uppercase tracking-wider transition-colors"
            >
              {department.name}
              <span className="bg-accent absolute inset-x-3 bottom-0 h-0.5 scale-x-0 transition-transform duration-200 group-hover:scale-x-100 group-focus-within:scale-x-100" />
            </Link>

            {groups.length > 0 ? (
              <div
                className="bg-raised border-line invisible absolute inset-x-0 top-full z-40 border-t opacity-0 shadow-lg transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                // Hidden from assistive tech until it is actually reachable.
                role="group"
                aria-label={department.name}
              >
                <div className="shell-max gutter grid grid-cols-4 gap-x-8 gap-y-6 py-7 xl:grid-cols-5">
                  {groups.map(({ shelf, leaves }) => (
                    <div key={shelf.id}>
                      <Link
                        href={`/category/${shelf.slug}`}
                        className="text-ink hover:text-accent-ink text-xs font-semibold uppercase tracking-wider"
                      >
                        {shelf.name}
                      </Link>
                      <ul className="mt-3 space-y-2">
                        {leaves.map((leaf) => (
                          <li key={leaf.id}>
                            <Link
                              href={`/category/${leaf.slug}`}
                              className="text-muted hover:text-accent-ink text-sm transition-colors"
                            >
                              {leaf.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                  <div className="bg-sunken col-span-1 rounded-md p-5">
                    <p className="font-display text-ink text-lg">{department.name}</p>
                    <p className="text-muted mt-1.5 text-sm">{department.description}</p>
                    <Link
                      href={`/category/${department.slug}`}
                      className="text-accent-ink mt-3 inline-block text-sm font-medium underline-offset-4 hover:underline"
                    >
                      Shop all {department.productCount.toLocaleString('en-IN')} items
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}
