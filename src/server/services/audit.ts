import 'server-only';

import type { AuditLog, SessionUser } from '@/domain/types';
import { entityId } from '@/lib/ids';

import { collections, toEntities } from '../db/collections';

/**
 * Audit trail.
 *
 * Append-only by construction: this module exposes `record` and reads, and
 * nothing else. There is deliberately no update or delete — an audit log an
 * admin can edit is not an audit log, and the absence of those functions is the
 * enforcement.
 *
 * What gets recorded is the DIFF, not the whole entity. A snapshot of a
 * 40-field document tells a reviewer nothing about what changed; three fields
 * with their before and after values tells them everything. `diff` below
 * computes that, so call sites cannot forget to.
 *
 * Writing is best-effort and never throws. An approval must not fail because
 * the audit collection was briefly unavailable — but the failure is logged
 * loudly, because a silently missing audit entry is worse than a noisy one.
 */

export interface AuditInput {
  actor: Pick<SessionUser, 'id' | 'fullName' | 'activeRole'>;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  changes?: Array<{ field: string; before: unknown; after: unknown }>;
  note?: string | null;
  severity?: AuditLog['severity'];
}

export async function record(input: AuditInput): Promise<void> {
  const entry: AuditLog = {
    id: entityId('aud'),
    actorUserId: input.actor.id,
    actorName: input.actor.fullName,
    actorRole: input.actor.activeRole,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    changes: input.changes ?? [],
    note: input.note ?? null,
    ipAddress: null,
    userAgent: null,
    severity: input.severity ?? 'INFO',
    occurredAt: new Date().toISOString(),
  };

  try {
    const logs = await collections.auditLogs();
    await logs.insertOne({ ...entry, _id: entry.id });
  } catch (error) {
    console.error('[vestra:audit] FAILED TO RECORD', entry.action, entry.entityId, error);
  }
}

/**
 * Field-level diff between two versions of an entity.
 *
 * Only the fields that actually changed survive, compared by value rather than
 * reference so an untouched nested object does not show up as a change.
 */
export function diff<T extends object>(
  before: T,
  after: Partial<T>,
  fields: Array<keyof T>,
): Array<{ field: string; before: unknown; after: unknown }> {
  const changes: Array<{ field: string; before: unknown; after: unknown }> = [];

  for (const field of fields) {
    if (!(field in after)) continue;

    const previous = before[field];
    const next = after[field];
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;

    changes.push({ field: String(field), before: previous, after: next });
  }

  return changes;
}

/* ------------------------------------------------------------------- reads */

export async function listAuditLogs(
  options: { entityType?: string; entityId?: string; actorUserId?: string; limit?: number } = {},
): Promise<AuditLog[]> {
  const filter: Record<string, unknown> = {};
  if (options.entityType) filter.entityType = options.entityType;
  if (options.entityId) filter.entityId = options.entityId;
  if (options.actorUserId) filter.actorUserId = options.actorUserId;

  const logs = await collections.auditLogs();
  return toEntities(
    await logs
      .find(filter)
      .sort({ occurredAt: -1 })
      .limit(options.limit ?? 200)
      .toArray(),
  );
}
