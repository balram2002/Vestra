import { Copy, Plus, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { CouponToggle } from '@/components/console/admin-actions';
import { CampaignBadge, UsageMeter } from '@/components/console/campaigns/campaign-badge';
import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { PageHeader } from '@/components/console/page-header';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatDateShort } from '@/lib/format';
import { getSessionUser } from '@/server/auth/session';
import { hasPermission } from '@/server/auth/rbac';
import {
  listAdminCoupons,
  type CouponFilter,
  type CouponRow,
  type CouponSort,
} from '@/server/services/coupons-admin';

export const metadata: Metadata = { title: 'Coupons' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTERS: Array<{ key: CouponFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'paused', label: 'Paused' },
  { key: 'exhausted', label: 'Used up' },
  { key: 'expired', label: 'Expired' },
  { key: 'archived', label: 'Archived' },
];

const SORTS: Array<{ key: CouponSort; label: string }> = [
  { key: 'newest', label: 'Newest' },
  { key: 'ending', label: 'Ending soonest' },
  { key: 'most-used', label: 'Most used' },
];

/**
 * Coupons: every code, what it does in one sentence, and where it stands.
 *
 * The filter, search and sort live in the URL, so a filtered list is a link
 * someone can send ("these are the ones ending this week"), and the back
 * button does what it should.
 */
export default function AdminCouponsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Coupons"
        description="Codes shoppers type in the bag: what each one gives, who can use it, and how it is doing."
        actions={
          <Suspense fallback={null}>
            <NewCouponAction />
          </Suspense>
        }
      />
      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <CouponList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function CouponList({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filter = (FILTERS.find((item) => item.key === one(params.status))?.key ?? 'all') as CouponFilter;
  const sort = (SORTS.find((item) => item.key === one(params.sort))?.key ?? 'newest') as CouponSort;
  const q = one(params.q) ?? '';

  const [{ rows, counts }, user] = await Promise.all([listAdminCoupons({ q, filter, sort }), getSessionUser()]);
  const canWrite = Boolean(user && hasPermission(user.permissions, 'coupon:write'));

  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { status: filter === 'all' ? null : filter, sort: sort === 'newest' ? null : sort, q: q || null, ...patch };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const qs = next.toString();
    return qs ? `/admin/coupons?${qs}` : '/admin/coupons';
  };

  const columns: Column<CouponRow>[] = [
    {
      key: 'code',
      header: 'Coupon',
      render: ({ coupon }) => (
        <Link href={`/admin/coupons/${coupon.id}`} className="group block min-w-0">
          <span className="text-ink tabular block font-mono text-xs font-semibold group-hover:underline">{coupon.code}</span>
          <span className="text-faint block truncate text-2xs">{coupon.title}</span>
        </Link>
      ),
    },
    {
      key: 'rules',
      header: 'What it does',
      secondary: true,
      render: ({ summary }) => <span className="text-muted line-clamp-2 max-w-md text-xs">{summary}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: ({ status, archived }) => <CampaignBadge status={status} archived={archived} />,
    },
    {
      key: 'usage',
      header: 'Used',
      numeric: true,
      render: ({ coupon }) => <UsageMeter used={coupon.usedCount} limit={coupon.totalUsageLimit} />,
    },
    {
      key: 'window',
      header: 'Runs',
      secondary: true,
      render: ({ coupon }) => (
        <span className="text-faint text-2xs whitespace-nowrap">
          {formatDateShort(coupon.startsAt)} – {formatDateShort(coupon.endsAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: ({ coupon, status, archived }) => (
        <div className="flex items-center justify-end gap-1">
          {canWrite && !archived && status !== 'expired' ? (
            <CouponToggle couponId={coupon.id} code={coupon.code} isActive={coupon.isActive} />
          ) : null}
          {canWrite ? (
            <Link
              href={`/admin/coupons/new?from=${coupon.id}`}
              className="text-muted hover:text-ink hover:bg-sunken grid size-8 place-items-center rounded-md"
              aria-label={`Duplicate ${coupon.code}`}
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

        <form action="/admin/coupons" className="flex items-center gap-2">
          {filter !== 'all' ? <input type="hidden" name="status" value={filter} /> : null}
          {sort !== 'newest' ? <input type="hidden" name="sort" value={sort} /> : null}
          <label className="border-line bg-raised flex h-9 items-center gap-2 rounded-md border px-2.5">
            <Search className="text-faint size-4" aria-hidden />
            <span className="sr-only">Search coupons</span>
            <input
              name="q"
              defaultValue={q}
              placeholder="Code or title"
              className="text-ink placeholder:text-faint w-36 bg-transparent text-sm outline-none sm:w-48"
            />
          </label>
        </form>
      </div>

      <div className="text-muted flex flex-wrap items-center gap-2 text-xs">
        <span>Sort:</span>
        {SORTS.map((item) => (
          <Link
            key={item.key}
            href={href({ sort: item.key === 'newest' ? null : item.key })}
            aria-current={sort === item.key ? 'true' : undefined}
            className={cn('rounded px-1.5 py-0.5', sort === item.key ? 'bg-sunken text-ink font-medium' : 'hover:text-ink')}
          >
            {item.label}
          </Link>
        ))}
        {q ? (
          <span className="ml-auto">
            {rows.length} matching “{q}” ·{' '}
            <Link href={href({ q: null })} className="underline underline-offset-2">
              clear
            </Link>
          </span>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={({ coupon }) => coupon.id}
        caption="Coupons"
        empty={
          <TableEmpty
            title={q ? 'No coupons match' : filter === 'all' ? 'No coupons yet' : 'None here'}
            body={q ? 'Try part of the code, or clear the search.' : 'Create one to start running offers.'}
          />
        }
      />
    </div>
  );
}

/** Only someone who can write coupons gets the button; everyone else reads the list. */
async function NewCouponAction() {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.permissions, 'coupon:write')) return null;
  return (
    <Button asChild size="sm">
      <Link href="/admin/coupons/new">
        <Plus className="size-3.5" aria-hidden />
        New coupon
      </Link>
    </Button>
  );
}
