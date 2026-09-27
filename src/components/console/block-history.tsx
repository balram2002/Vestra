'use client';

import { History, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import type { VERSIONED_BLOCKS } from '@/domain/site-content';
import { appearanceHistory, restoreAppearance } from '@/server/actions/appearance';

type VersionedBlock = (typeof VERSIONED_BLOCKS)[number];

/* --------------------------------------------------------------- history */

const WHEN = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Earlier saves of one card, fetched when opened. Putting one back is saved
 * like any edit, so what it replaces goes onto the history in turn.
 */
export function BlockHistory({ block, title }: { block: VersionedBlock; title: string }) {
  const router = useRouter();
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof appearanceHistory>> | null>(null);
  const [pending, startTransition] = useTransition();

  const load = (open: boolean) => {
    if (!open) return;
    startTransition(async () => setVersions(await appearanceHistory({ block })));
  };

  return (
    <Dialog onOpenChange={load}>
      <DialogTrigger asChild>
        <Button type="button" size="xs" variant="ghost">
          <History className="size-3.5" aria-hidden />
          History
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`${title}: earlier versions`}
        description="The last ten saves. Putting one back makes it live on every page straight away."
        size="md"
      >
        {versions === null ? (
          <p className="text-muted text-sm">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="text-muted text-sm">No earlier versions yet. Every save from now on is kept here.</p>
        ) : (
          <ol className="divide-line -mx-1 divide-y">
            {versions.map((version) => (
              <li key={version.id} className="flex items-center gap-3 px-1 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-ink text-sm">Before the save of {WHEN.format(new Date(version.at))}</p>
                  <p className="text-muted text-xs">
                    {version.summary} · replaced by {version.byName}
                  </p>
                </div>
                <ConfirmDialog
                  trigger={
                    <Button type="button" size="xs" variant="ghost" disabled={pending}>
                      <RotateCcw className="size-3.5" aria-hidden />
                      Put back
                    </Button>
                  }
                  title="Put this version back?"
                  description="It goes live on every page straight away. What is there now is kept in the history."
                  confirmLabel="Put it back"
                  onConfirm={() =>
                    startTransition(async () => {
                      const result = await restoreAppearance({ block, versionId: version.id });
                      if (!result.ok) {
                        toast.error(result.error ?? 'That did not work.');
                        return;
                      }
                      toast.success('Put back — live on the shop');
                      router.refresh();
                    })
                  }
                />
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
