import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageHeader } from '@/components/console/page-header';
import { SectionToggle } from '@/components/console/admin-actions';
import { Badge } from '@/components/ui/badge';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';
import { formatDateShort } from '@/lib/format';

export const metadata: Metadata = { title: 'Homepage' };

/**
 * Homepage composition.
 *
 * The homepage is DATA, not code: this list is the actual render order of
 * `app/(storefront)/page.tsx`. Reordering or disabling a row here changes the
 * shop, which is the whole reason the sections are stored rather than
 * hardcoded.
 */
export default function AdminCmsPage() {
  return (
    <>
      <PageHeader
        title="Homepage"
        description="The sections the storefront renders, in order. This list is the homepage."
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <Sections />
      </Suspense>
    </>
  );
}

async function Sections() {
  await requirePermission('cms:write');

  const [sectionCol, bannerCol] = await Promise.all([
    collections.homeSections(),
    collections.banners(),
  ]);

  const [sections, banners] = await Promise.all([
    sectionCol.find({}).sort({ position: 1 }).toArray().then(toEntities),
    bannerCol.find({}).sort({ placement: 1, position: 1 }).toArray().then(toEntities),
  ]);

  return (
    <div className="mt-6 space-y-8">
      <section>
        <h2 className="text-ink mb-2 text-md font-semibold">Sections</h2>

        <ol className="space-y-2">
          {sections.map((section, index) => (
            <li
              key={section.id}
              className="border-line bg-raised flex items-center gap-3 rounded-md border px-4 py-3"
            >
              <span className="text-faint tabular w-5 shrink-0 text-xs">{index + 1}</span>

              <div className="min-w-0 flex-1">
                <p className="text-ink truncate text-xs font-medium">
                  {section.title ?? section.kind.replace(/_/g, ' ').toLowerCase()}
                </p>
                <p className="text-faint truncate text-2xs">
                  {section.kind}
                  {section.config.source ? ` - ${section.config.source.toLowerCase()}` : ''}
                  {section.config.limit ? ` - ${section.config.limit} items` : ''}
                </p>
              </div>

              <SectionToggle
                sectionId={section.id}
                label={section.title ?? section.kind}
                isActive={section.isActive}
              />
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="text-ink mb-2 text-md font-semibold">Banners</h2>

        <ul className="grid gap-2 sm:grid-cols-2">
          {banners.map((banner) => (
            <li
              key={banner.id}
              className="border-line bg-raised rounded-md border px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-ink truncate text-xs font-medium">{banner.headline}</p>
                  <p className="text-faint truncate text-2xs">{banner.placement}</p>
                </div>
                <Badge tone={banner.isActive ? 'success' : 'neutral'} size="sm">
                  {banner.isActive ? 'Live' : 'Hidden'}
                </Badge>
              </div>

              <p className="text-muted mt-1.5 line-clamp-2 text-2xs">{banner.subheadline}</p>
              <p className="text-faint mt-1.5 text-2xs">
                {banner.href} - updated {formatDateShort(banner.updatedAt)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
