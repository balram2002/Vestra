'use client';

import { History, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { DesignRevision, VariantMeta } from '@/domain/page-designs/types';

/**
 * The last twenty publishes, newest first.
 *
 * Revert publishes that version again as a NEW revision rather than rewinding
 * the list, so the history never loses the version that was reverted away
 * from -- undoing an undo is one more click, not a lost afternoon.
 */
export function DesignHistory({
  revisions,
  variantMeta,
  pending,
  onRevert,
}: {
  revisions: DesignRevision[];
  variantMeta: Record<string, VariantMeta>;
  pending: boolean;
  onRevert: (revisionId: string) => void;
}) {
  return (
    <section className="border-line bg-raised rounded-lg border" aria-label="History">
      <header className="border-line flex items-center gap-2 border-b px-4 py-3 sm:px-5">
        <History className="text-muted size-4" aria-hidden />
        <h2 className="text-ink text-sm font-semibold">History</h2>
        <span className="text-faint text-2xs">Last {revisions.length || 0} of up to 20 publishes</span>
      </header>

      {revisions.length === 0 ? (
        <p className="text-muted px-4 py-6 text-sm sm:px-5">
          Nothing published from here yet. Every publish is kept, and any of them can be put back.
        </p>
      ) : (
        <ol className="divide-line divide-y">
          {revisions.map((revision, index) => (
            <li key={revision.id} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-ink text-sm">
                  {revision.action}
                  {index === 0 ? (
                    <span className="bg-success-50 text-success-700 ml-2 rounded-full px-2 py-0.5 text-2xs font-medium">
                      Current
                    </span>
                  ) : null}
                </p>
                <p className="text-muted mt-0.5 text-xs">
                  {revision.byName} · <time dateTime={revision.at} suppressHydrationWarning>{formatWhen(revision.at)}</time> · Live layout{' '}
                  {variantMeta[revision.config.variant]?.name ?? revision.config.variant}
                </p>
                {revision.note ? <p className="text-muted mt-1 text-xs italic">“{revision.note}”</p> : null}
              </div>
              {index > 0 ? (
                <ConfirmDialog
                  trigger={
                    <Button type="button" size="xs" variant="ghost" disabled={pending}>
                      <RotateCcw className="size-3.5" aria-hidden />
                      Put back
                    </Button>
                  }
                  title="Put this version back?"
                  description="It is published again straight away, as a new entry in the history. Any unpublished draft is replaced."
                  confirmLabel="Put it back"
                  onConfirm={() => onRevert(revision.id)}
                />
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const FORMAT = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export function formatWhen(iso: string): string {
  return FORMAT.format(new Date(iso));
}
