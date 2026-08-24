import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ConsoleTabs } from '@/components/console/console-tabs';
import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { Pager } from '@/components/console/pager';
import { USER_ROLE_LABEL } from '@/domain/enums';
import type { User } from '@/domain/types';
import { formatDateShort, formatMoney, maskEmail, maskPhone } from '@/lib/format';
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

/**
 * User directory.
 *
 * Contact details are MASKED. A support agent looking someone up needs to
 * confirm they have the right person, which a masked address does; they do not
 * need a full address book on screen in an open-plan office. The password hash
 * is projected out in the query, so it never leaves the database at all.
 */
export default function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; page?: string }>;
}) {
  return (
    <>
      <h1 className="font-display text-ink text-xl">Users</h1>
      <p className="text-muted mt-1 text-sm">
        Everyone with an account, including staff and seller owners.
      </p>

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <UserTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function UserTable({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; page?: string }>;
}) {
  const [params] = await Promise.all([searchParams, requirePermission('user:read')]);
  const role = params.role ?? 'ALL';
  const page = Number.parseInt(params.page ?? '1', 10) || 1;

  const { rows, total, pageSize } = await listUsers({ role, page });

  const columns: Column<User>[] = [
    {
      key: 'person',
      header: 'Person',
      render: (user) => (
        <div className="min-w-0">
          <p className="text-ink truncate text-xs font-medium">{user.fullName}</p>
          <p className="text-faint truncate text-2xs">{maskEmail(user.email)}</p>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (user) => (
        <span className="text-muted text-xs">
          {user.roles.map((r) => USER_ROLE_LABEL[r]).join(', ')}
        </span>
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
      secondary: true,
      render: (user) => (
        <span
          className={
            user.status === 'ACTIVE' ? 'text-success-600 text-xs' : 'text-danger-600 text-xs'
          }
        >
          {user.status.toLowerCase()}
        </span>
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
      key: 'joined',
      header: 'Joined',
      numeric: true,
      render: (user) => (
        <span className="text-faint text-2xs">{formatDateShort(user.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="mt-6">
      <ConsoleTabs basePath="/admin/users" param="role" current={role} tabs={TABS} />

      <p className="text-faint mt-4 text-xs">
        {total.toLocaleString('en-IN')} {total === 1 ? 'person' : 'people'}
      </p>

      <DataTable
        className="mt-2"
        columns={columns}
        rows={rows}
        rowKey={(user) => user.id}
        caption="Users"
        empty={<TableEmpty title="No users" body="Nobody matches this filter." />}
      />

      <Pager
        basePath="/admin/users"
        params={{ role }}
        page={page}
        total={total}
        pageSize={pageSize}
      />
    </div>
  );
}
