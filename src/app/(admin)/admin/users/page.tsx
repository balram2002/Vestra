import type { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Suspense } from 'react';

import { UserStatusActions } from '@/components/console/admin-actions';
import { ConsoleTabs } from '@/components/console/console-tabs';
import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { PageHeader } from '@/components/console/page-header';
import { Pager } from '@/components/console/pager';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { USER_ROLE_LABEL } from '@/domain/enums';
import type { User } from '@/domain/types';
import { formatDateShort, formatMoney, maskEmail, maskPhone } from '@/lib/format';
import { hasPermission } from '@/server/auth/rbac';
import { requirePermission } from '@/server/auth/session';
import { listUsers } from '@/server/services/admin';

export const metadata: Metadata = { title: 'Users' };

const TABS = [
  { value: 'ALL', label: 'All' },
  { value: 'CUSTOMER', label: 'Customers' },
  { value: 'SELLER', label: 'Sellers' },
  { value: 'SUPPORT', label: 'Support' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'ADMIN', label: 'Admins' },
];

type UserSearchParams = { role?: string; page?: string; q?: string };

/**
 * User directory.
 *
 * Contact details are MASKED. A support agent looking someone up needs to
 * confirm they have the right person, which a masked address does; they do not
 * need a full address book on screen in an open-plan office. The password hash
 * is projected out in the query, so it never leaves the database at all.
 *
 * Search is a plain GET form, so it works before hydration, survives a reload
 * and can be pasted into a ticket as a link.
 */
export default function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<UserSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone with an account, including staff and seller owners."
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-xl" aria-hidden />}>
        <UserTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function UserTable({ searchParams }: { searchParams: Promise<UserSearchParams> }) {
  const [params, actor] = await Promise.all([searchParams, requirePermission('user:read')]);
  const role = params.role ?? 'ALL';
  const query = (params.q ?? '').trim().slice(0, 80);
  const page = Number.parseInt(params.page ?? '1', 10) || 1;
  const canSuspend = hasPermission(actor.permissions, 'user:suspend');

  const { rows, total, pageSize } = await listUsers({
    role,
    query: query || undefined,
    page,
  });

  const columns: Column<User>[] = [
    {
      key: 'person',
      header: 'Person',
      render: (user) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={user.fullName} src={user.avatarUrl} size="sm" />
          <div className="min-w-0">
            <p className="text-ink truncate text-xs font-medium">{user.fullName}</p>
            <p className="text-faint truncate text-2xs">{maskEmail(user.email)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (user) => (
        <div className="flex flex-wrap gap-1">
          {user.roles.map((r) => (
            <Badge key={r} tone="neutral" size="sm">
              {USER_ROLE_LABEL[r]}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      secondary: true,
      render: (user) => (
        <span className="text-muted tabular text-xs">
          {user.phone ? maskPhone(user.phone) : '-'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (user) => (
        <Badge
          tone={user.status === 'ACTIVE' ? 'success' : user.status === 'SUSPENDED' ? 'danger' : 'neutral'}
          size="sm"
        >
          {user.status === 'ACTIVE' ? 'Active' : user.status === 'SUSPENDED' ? 'Suspended' : user.status.toLowerCase()}
        </Badge>
      ),
    },
    {
      key: 'credit',
      header: 'Credit',
      numeric: true,
      secondary: true,
      render: (user) => (
        <span className="text-ink text-xs">
          {user.creditBalance > 0 ? formatMoney(user.creditBalance) : '-'}
        </span>
      ),
    },
    {
      key: 'seen',
      header: 'Last sign-in',
      numeric: true,
      secondary: true,
      render: (user) => (
        <span className="text-faint text-2xs">
          {user.lastLoginAt ? formatDateShort(user.lastLoginAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'joined',
      header: 'Joined',
      numeric: true,
      render: (user) => (
        <span className="text-faint text-2xs">{formatDateShort(user.createdAt)}</span>
      ),
    },
    ...(canSuspend
      ? [
          {
            key: 'actions',
            header: '',
            render: (user: User) =>
              // Suspending yourself locks you out of the console that would undo it.
              user.id === actor.id ? (
                <span className="text-faint text-2xs">You</span>
              ) : (
                <UserStatusActions userId={user.id} name={user.fullName} status={user.status} />
              ),
          } satisfies Column<User>,
        ]
      : []),
  ];

  return (
    <div className="mt-6">
      <ConsoleTabs basePath="/admin/users" param="role" current={role} tabs={TABS} />

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form action="/admin/users" method="get" role="search" className="w-full sm:max-w-sm">
          {role !== 'ALL' ? <input type="hidden" name="role" value={role} /> : null}
          <Input
            label="Search users"
            hideLabel
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by name or email"
            leading={<Search className="size-4" aria-hidden />}
          />
        </form>

        <p className="text-faint text-xs">
          {total.toLocaleString('en-IN')} {total === 1 ? 'person' : 'people'}
          {query ? (
            <>
              {' '}matching <span className="text-ink font-medium">&ldquo;{query}&rdquo;</span>{' '}
              <Link
                href={role === 'ALL' ? '/admin/users' : `/admin/users?role=${role}`}
                className="text-accent-text ml-1 underline-offset-2 hover:underline"
              >
                Clear
              </Link>
            </>
          ) : null}
        </p>
      </div>

      <DataTable
        className="mt-3"
        columns={columns}
        rows={rows}
        rowKey={(user) => user.id}
        caption="Users"
        empty={
          <TableEmpty
            title={query ? 'Nobody matches that search' : 'No users'}
            body={query ? 'Try part of a name or the start of an email address.' : 'Nobody matches this filter.'}
          />
        }
      />

      <Pager
        basePath="/admin/users"
        params={{ role, q: query || undefined }}
        page={page}
        total={total}
        pageSize={pageSize}
      />
    </div>
  );
}