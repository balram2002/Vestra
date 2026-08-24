import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { Prose } from '@/components/cms/prose';
import type { CmsPage } from '@/domain/types';
import { formatDate } from '@/lib/format';

/**
 * The shared shell for every policy and help page, so they cannot drift apart
 * in layout, breadcrumb shape or heading hierarchy.
 */
export function CmsPageView({
  page,
  breadcrumbs,
}: {
  page: CmsPage;
  breadcrumbs: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="gutter shell-max py-6">
      <Breadcrumbs items={breadcrumbs} />

      <article className="mt-4">
        <h1 className="font-display text-ink text-2xl sm:text-3xl">{page.title}</h1>
        <p className="text-faint mt-1.5 text-xs">
          Last updated <time dateTime={page.updatedAt}>{formatDate(page.updatedAt)}</time>
        </p>

        <div className="mt-6">
          <Prose markdown={page.body} />
        </div>
      </article>
    </div>
  );
}
