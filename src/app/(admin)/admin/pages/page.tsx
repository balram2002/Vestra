import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { PageHeader } from '@/components/console/page-header';
import { Badge } from '@/components/ui/badge';
import type { CmsPage } from '@/domain/types';
import { formatDateShort } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Pages' };

/**
 * Site pages.
 *
 * Terms, privacy, the returns and grievance policies, the help articles, about
 * and sell with us. They are the shop's own commitments, so they are edited
 * here rather than in code, and every save is in the audit log.
 */
export default function AdminPagesPage() {
  return (
    <>
      <PageHeader
        title="Pages"
        description="Policies, help articles and the about page. Read each one before launch: they are a starting point, and they are your promises to shoppers and sellers."
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-xl" aria-hidden />}>
        <PageTable />
      </Suspense>
    </>
  );
}

function sectionOf(slug: string): string {
  if (slug.startsWith('legal/')) return 'Legal';
  if (slug.startsWith('help/')) return 'Help';
  return 'Company';
}

async function PageTable() {
  await requirePermission('cms:write');

  const pageCol = await collections.cmsPages();
  const pages = toEntities(await pageCol.find({}).sort({ slug: 1 }).toArray());

  const columns: Column<CmsPage>[] = [
    {
      key: 'page',
      header: 'Page',
      render: (page) => (
        <div className="min-w-0">
          <Link
            href={`/admin/pages/${page.id}`}
            className="text-ink hover:text-accent-ink block truncate text-xs font-medium"
          >
            {page.title}
          </Link>
          <p className="text-faint truncate text-2xs">/{page.slug}</p>
        </div>
      ),
    },
    {
      key: 'section',
      header: 'Section',
      secondary: true,
      render: (page) => <span className="text-muted text-xs">{sectionOf(page.slug)}</span>,
    },
    {
      key: 'updated',
      header: 'Updated',
      numeric: true,
      secondary: true,
      render: (page) => <span className="text-faint text-2xs">{formatDateShort(page.updatedAt)}</span>,
    },
    {
      key: 'state',
      header: 'State',
      render: (page) => (
        <Badge tone={page.isPublished ? 'success' : 'neutral'} size="sm">
          {page.isPublished ? 'Published' : 'Unpublished'}
        </Badge>
      ),
    },
    {
      key: 'edit',
      header: '',
      render: (page) => (
        <Link href={`/admin/pages/${page.id}`} className="text-accent-ink text-xs font-medium">
          Edit
        </Link>
      ),
    },
  ];

  return (
    <div className="mt-6">
      <DataTable
        columns={columns}
        rows={pages}
        rowKey={(page) => page.id}
        caption="Site pages"
        empty={
          <TableEmpty
            title="No pages yet"
            body="Run npm run seed:reference to add the policy and help pages, then edit them here."
          />
        }
      />
    </div>
  );
}
