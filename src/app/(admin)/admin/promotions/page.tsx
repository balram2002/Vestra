import { AlertTriangle, CalendarRange, Copy, List, Plus, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { PromotionToggle } from '@/components/console/admin-actions';
import { CampaignBadge, UsageMeter } from '@/components/console/campaigns/campaign-badge';
import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { PageHeader } from '@/components/console/page-header';
import { Button } from '@/components/ui/button';
import { PROMOTION_TYPE_LABEL } from '@/domain/promotion-rules';
import { cn } from '@/lib/cn';
import { formatDateShort } from '@/lib/format';
import { getSessionUser } from '@/server/auth/session';
import { hasPermission } from '@/server/auth/rbac';
import {
  listAdminPromotions,
  promotionCalendar,
  type PromotionFilter,
  type PromotionRow,
  type PromotionSort,
} from '@/server/services/promotions-admin';

export const metadata: Metadata = { title: 'Promotions' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTERS: Array<{ key: PromotionFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'paused', label: 'Paused' },
  { key: 'exhausted', label: 'Sold out' },
  { key: 'expired', label: 'Ended' },
  { key: 'archived', label: 'Archived' },
];

const SORTS: Array<{ key: PromotionSort; label: string }> = [
  { key: 'priority', label: 'Priority' },
  { key: 'newest', label: 'Newest' },
  { key: 'ending', label: 'Ending soonest' },
];

/**
 * Automatic offers: every sale, bank offer and campaign, as a list or as the
 * next eight weeks on a calendar.
 *
 * The calendar is the reason this screen exists in this shape. Two sales on
 * the same weekend, on the same things, is the most common way a marketplace
 * gives away more than it meant to -- and it is obvious on a timeline and
 * invisible in a table.
 */
export default function AdminPromotionsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Promotions"
        description="Automatic offers with no code: sales, bank offers, store offers and campaigns. New ones start paused."
        actions={
          <Suspense fallback={null}>
            <NewPromotionAction />
          </Suspense>
        }
      />
      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <Promotions searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function Promotions({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const view = one(params.view) === 'calendar' ? 'calendar' : 'list';
  const filter = (FILTERS.find((item) => item.key === one(params.status))?.key ?? 'all') as PromotionFilter;
  const sort = (SORTS.find((item) => item.key === one(params.sort))?.key ?? 'priority') as PromotionSort;
  const q = one(params.q) ?? '';

  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = {
      view: view === 'list' ? null : view,
      status: filter === 'all' ? null : filter,
      sort: sort === 'priority' ? null : sort,
      q: q || null,
      ...patch,
    };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const qs = next.toString();
    return qs ? `/admin/promotions?${qs}` : '/admin/promotions';
  };

  const switcher = (
    <div role="tablist" aria-label="View" className="bg-sunken inline-flex rounded-md p-0.5">
      {[
        { key: 'list', label: 'List', icon: List },
        { key: 'calendar', label: 'Calendar', icon: CalendarRange },
      ].map((item) => (
        <Link
          key={item.key}
          role="tab"
          aria-selected={view === item.key}
          href={href({ view: item.key === 'list' ? null : item.key })}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs font-medium',
            view === item.key ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          <item.icon className="size-3.5" aria-hidden />
          {item.label}
        </Link>
      ))}
    </div>
  );

  if (view === 'calendar') {
    return (
      <div className="mt-6 space-y-4">
        {switcher}
        <Calendar />
      </div>
    );
  }

  const [{ rows, counts }, user] = await Promise.all([listAdminPromotions({ q, filter, sort }), getSessionUser()]);
  const canWrite = Boolean(user && hasPermission(user.permissions, 'promotion:write'));

  const columns: Column<PromotionRow>[] = [
    {
      key: 'offer',
      header: 'Offer',
      render: ({ promotion }) => (
        <Link href={`/admin/promotions/${promotion.id}`} className="group block min-w-0">
          <span className="text-ink block truncate text-xs font-semibold group-hover:underline">{promotion.title}</span>
          <span className="text-faint block text-2xs">{PROMOTION_TYPE_LABEL[promotion.type]} · priority {promotion.priority}</span>
        </Link>
      ),
    },
    {
      key: 'rules',
      header: 'What it does',
      secondary: true,
      render: ({ summary, overlaps }) => (
        <span className="block max-w-md">
          <span className="text-muted line-clamp-2 text-xs">{summary}</span>
          {overlaps > 0 ? (
            <span className="text-warning-700 mt-0.5 inline-flex items-center gap-1 text-2xs font-medium">
              <AlertTriangle className="size-3" aria-hidden />
              Overlaps {overlaps} live {overlaps === 1 ? 'offer' : 'offers'}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: ({ status, archived }) => <CampaignBadge status={status} archived={archived} />,
    },
    {
      key: 'units',
      header: 'Units',
      numeric: true,
      secondary: true,
      render: ({ promotion }) =>
        promotion.stockLimit === null ? (
          <span className="text-faint text-xs">No cap</span>
        ) : (
          <UsageMeter used={promotion.stockSold} limit={promotion.stockLimit} />
        ),
    },
    {
      key: 'window',
      header: 'Runs',
      secondary: true,
      render: ({ promotion }) => (
        <span className="text-faint text-2xs whitespace-nowrap">
          {formatDateShort(promotion.startsAt)} – {formatDateShort(promotion.endsAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: ({ promotion, archived, status }) => (
        <div className="flex items-center justify-end gap-1">
          {canWrite && !archived && status !== 'expired' ? (
            <PromotionToggle promotionId={promotion.id} title={promotion.title} isActive={promotion.isActive} />
          ) : null}
          {canWrite ? (
            <Link
              href={`/admin/promotions/new?from=${promotion.id}`}
              className="text-muted hover:text-ink hover:bg-sunken grid size-8 place-items-center rounded-md"
              aria-label={`Duplicate ${promotion.title}`}
              title="Duplicate"
            >
              <Copy className="size-4" aria-hidden />
            </Link>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {switcher}
        <nav aria-label="Filter by status" className="no-scrollbar -mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1">
          {FILTERS.map((item) => (
            <Link
              key={item.key}
              href={href({ status: item.key === 'all' ? null : item.key })}
              aria-current={filter === item.key ? 'page' : undefined}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium',
                filter === item.key ? 'border-ink bg-ink text-canvas' : 'border-line bg-raised text-muted hover:text-ink',
              )}
            >
              {item.label}
              <span className={cn('tabular', filter === item.key ? 'text-canvas/70' : 'text-faint')}>{counts[item.key]}</span>
            </Link>
          ))}
        </nav>
        <form action="/admin/promotions" className="flex items-center gap-2">
          {filter !== 'all' ? <input type="hidden" name="status" value={filter} /> : null}
          {sort !== 'priority' ? <input type="hidden" name="sort" value={sort} /> : null}
          <label className="border-line bg-raised flex h-9 items-center gap-2 rounded-md border px-2.5">
            <Search className="text-faint size-4" aria-hidden />
            <span className="sr-only">Search promotions</span>
            <input name="q" defaultValue={q} placeholder="Title or badge" className="text-ink placeholder:text-faint w-36 bg-transparent text-sm outline-none sm:w-48" />
          </label>
        </form>
      </div>

      <div className="text-muted flex flex-wrap items-center gap-2 text-xs">
        <span>Sort:</span>
        {SORTS.map((item) => (
          <Link
            key={item.key}
            href={href({ sort: item.key === 'priority' ? null : item.key })}
            aria-current={sort === item.key ? 'true' : undefined}
            className={cn('rounded px-1.5 py-0.5', sort === item.key ? 'bg-sunken text-ink font-medium' : 'hover:text-ink')}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={({ promotion }) => promotion.id}
        caption="Promotions"
        empty={
          <TableEmpty
            title={q ? 'No promotions match' : 'None here'}
            body={q ? 'Try part of the title, or clear the search.' : 'Create one, or pick another status.'}
          />
        }
      />
    </div>
  );
}

const BAR_TONE = {
  live: 'bg-success-fill text-white',
  scheduled: 'bg-info-50 text-info-700 border border-info-100',
  paused: 'bg-warning-50 text-warning-700 border border-dashed border-warning-100',
  expired: 'bg-sunken text-muted',
  exhausted: 'bg-sunken text-muted',
} as const;

async function Calendar() {
  const calendar = await promotionCalendar();

  return (
    <section className="border-line bg-raised overflow-hidden rounded-lg border" aria-label="Next eight weeks">
      <div className="overflow-x-auto">
        <div className="min-w-[48rem]">
          <div className="border-line relative h-9 border-b">
            {calendar.weeks.map((week) => (
              <span
                key={week.label}
                className="text-faint border-line absolute top-0 flex h-full items-center border-l pl-1.5 text-2xs"
                style={{ left: `${week.at}%` }}
              >
                {week.label}
              </span>
            ))}
          </div>

          <div className="relative">
            {calendar.weeks.map((week) => (
              <span key={week.label} aria-hidden className="border-line/60 absolute inset-y-0 border-l" style={{ left: `${week.at}%` }} />
            ))}
            <span aria-hidden className="bg-danger-600 absolute inset-y-0 z-10 w-px" style={{ left: `${calendar.today}%` }} />

            {calendar.bars.length === 0 ? (
              <p className="text-muted px-4 py-10 text-center text-sm">Nothing runs in the next eight weeks.</p>
            ) : (
              <ol className="relative space-y-1.5 py-3">
                {calendar.bars.map((bar) => (
                  <li key={bar.id} className="relative h-8">
                    <Link
                      href={`/admin/promotions/${bar.id}`}
                      title={`${bar.title} · ${formatDateShort(bar.startsAt)} – ${formatDateShort(bar.endsAt)}`}
                      className={cn(
                        'absolute inset-y-0 flex items-center overflow-hidden px-2 text-2xs font-medium whitespace-nowrap hover:opacity-90',
                        BAR_TONE[bar.status],
                        bar.startsBefore ? 'rounded-l-none' : 'rounded-l-md',
                        bar.endsAfter ? 'rounded-r-none' : 'rounded-r-md',
                      )}
                      style={{ left: `${bar.left}%`, width: `${bar.width}%`, minWidth: '1.5rem' }}
                    >
                      <span className="truncate">{bar.title}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
      <footer className="border-line text-muted flex flex-wrap items-center gap-4 border-t px-4 py-2.5 text-2xs">
        <Legend className="bg-success-fill" label="Live" />
        <Legend className="border-info-100 bg-info-50 border" label="Scheduled" />
        <Legend className="border-warning-100 bg-warning-50 border border-dashed" label="Paused" />
        <Legend className="bg-sunken" label="Ended or sold out" />
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-danger-600 h-3 w-px" aria-hidden />
          Today
        </span>
      </footer>
    </section>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-sm', className)} aria-hidden />
      {label}
    </span>
  );
}

async function NewPromotionAction() {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.permissions, 'promotion:write')) return null;
  return (
    <Button asChild size="sm">
      <Link href="/admin/promotions/new">
        <Plus className="size-3.5" aria-hidden />
        New promotion
      </Link>
    </Button>
  );
}
