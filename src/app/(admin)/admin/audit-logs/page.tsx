import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageHeader } from '@/components/console/page-header';
import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { Badge } from '@/components/ui/badge';
import type { AuditLog } from '@/domain/types';
import { formatDateTime } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Audit log' };

/**
 * Audit trail.
 *
 * Who did what, when, and what the value was before and after. Read-only by
 * construction: an audit log an admin can edit is not an audit log. Entries are
 * written by the services that perform the sensitive action, never from here.
 */
export default function AdminAuditPage() {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every sensitive action, with the before and after. Read-only."
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <AuditTable />
      </Suspense>
    </>
  );
}

async function AuditTable() {
  await requirePermission('audit:read');

  const auditCol = await collections.auditLogs();
  const logs = toEntities(await auditCol.find({}).sort({ occurredAt: -1 }).limit(200).toArray());

  const columns: Column<AuditLog>[] = [
    {
      key: 'when',
      header: 'When',
      render: (log) => (
        <span className="text-muted tabular text-2xs">{formatDateTime(log.occurredAt)}</span>
      ),
    },
    {
      key: 'actor',
      header: 'Who',
      render: (log) => (
        <div className="min-w-0">
          <p className="text-ink truncate text-xs">{log.actorName || 'System'}</p>
          <p className="text-faint text-2xs">{log.actorRole}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (log) => (
        <div className="flex items-center gap-2">
          <span className="text-ink tabular text-xs">{log.action}</span>
          {log.severity === 'CRITICAL' || log.severity === 'WARNING' ? (
            <Badge tone={log.severity === 'CRITICAL' ? 'danger' : 'warning'} size="sm">
              {log.severity.toLowerCase()}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      secondary: true,
      render: (log) => (
        <div className="min-w-0">
          <p className="text-muted truncate text-xs">{log.entityLabel || log.entityType}</p>
          <p className="text-faint tabular truncate text-2xs">{log.entityId}</p>
        </div>
      ),
    },
    {
      key: 'changes',
      header: 'Changed',
      secondary: true,
      render: (log) =>
        log.changes.length === 0 ? (
          <span className="text-faint text-2xs">{log.note ?? '—'}</span>
        ) : (
          // The first change inline, the rest counted. A row is a summary; the
          // full diff belongs on the entry, not in a column.
          <span className="text-muted text-2xs">
            <span className="text-ink">{log.changes[0]!.field}</span>{' '}
            <span className="text-faint line-through">{String(log.changes[0]!.before)}</span>{' '}
            → {String(log.changes[0]!.after)}
            {log.changes.length > 1 ? (
              <span className="text-faint"> +{log.changes.length - 1} more</span>
            ) : null}
          </span>
        ),
    },
  ];

  return (
    <div className="mt-6">
      <DataTable
        columns={columns}
        rows={logs}
        rowKey={(log) => log.id}
        caption="Audit log"
        empty={
          <TableEmpty
            title="Nothing logged yet"
            body="Sensitive actions — approvals, refunds, role changes, suspensions — are recorded here as they happen."
          />
        }
      />
    </div>
  );
}
