import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { PageHeader } from '@/components/console/page-header';
import { Badge } from '@/components/ui/badge';
import { CONTENT_TEMPLATE_META } from '@/domain/content-pages';
import { cn } from '@/lib/cn';
import { formatDateShort } from '@/lib/format';
import { listContentPages, type ContentPageRow } from '@/server/services/content-pages';

export const metadata: Metadata = { title: 'Content pages' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SECTIONS = ['All', 'Legal', 'Help', 'Company'] as const;

/**
 * Policies, help articles, about and sell with us.
 *
 * They are the shop's own commitments, so every edit is a draft that someone
 * publishes, every publish is kept, and the list says which pages have
 * something waiting.
 */
export default function AdminPagesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Content pages"
        description="Policies, help articles and the about page. Edits are drafts until published, and every published version is kept."
      />
      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-xl" aria-hidden />}>
        <PageTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PageTable({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requested = typeof params.section === 'string' ? params.section : 'All';
  const section = (SECTIONS as readonly string[]).includes(requested) ? requested : 'All';

  const all = await listContentPages();
  const rows = section === 'All' ? all : all.filter((row) => row.section === section);
  const drafts = all.filter((row) => row.hasDraft).length;

  const columns: Column<ContentPageRow>[] = [
    {
      key: 'page',
      header: 'Page',
      render: (row) => (
        <Link href={`/admin/pages/${row.id}`} className="group block min-w-0">
          <span className="text-ink block truncate text-xs font-semibold group-hover:underline">{row.title}</span>
          <span className="text-faint block truncate font-mono text-2xs">/{row.slug}</span>
        </Link>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (row) => (
        <span className="flex flex-wrap gap-1">
          <Badge tone={row.isPublished ? 'success' : 'neutral'} size="sm">
            {row.isPublished ? 'Visible' : 'Hidden'}
          </Badge>
          {row.hasDraft ? (
            <Badge tone="warning" size="sm">
              Draft
            </Badge>
          ) : null}
          {row.noindex ? (
            <Badge tone="neutral" size="sm">
              Not in search
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: 'template',
      header: 'Template',
      secondary: true,
      render: (row) => <span className="text-muted text-xs">{CONTENT_TEMPLATE_META[row.template].name}</span>,
    },
    {
      key: 'section',
      header: 'Section',
      secondary: true,
      render: (row) => <span className="text-muted text-xs">{row.section}</span>,
    },
    {
      key: 'updated',
      header: 'Published',
      numeric: true,
      secondary: true,
      render: (row) => <span className="text-faint text-2xs">{formatDateShort(row.updatedAt)}</span>,
    },
  ];

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Filter by section" className="flex flex-wrap gap-1">
          {SECTIONS.map((item) => {
            const count = item === 'All' ? all.length : all.filter((row) => row.section === item).length;
            return (
              <Link
                key={item}
                href={item === 'All' ? '/admin/pages' : `/admin/pages?section=${item}`}
                aria-current={section === item ? 'page' : undefined}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium',
                  section === item ? 'border-ink bg-ink text-canvas' : 'border-line bg-raised text-muted hover:text-ink',
                )}
              >
                {item}
                <span className={cn('tabular', section === item ? 'text-canvas/70' : 'text-faint')}>{count}</span>
              </Link>
            );
          })}
        </nav>
        {drafts ? (
          <p className="text-warning-700 text-xs font-medium">
            {drafts} {drafts === 1 ? 'page has' : 'pages have'} unpublished changes
          </p>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        caption="Content pages"
        empty={<TableEmpty title="No pages here" body="Pick another section." />}
      />
    </div>
  );
}
