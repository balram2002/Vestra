'use client';

import { ChevronDown, ExternalLink, History, RotateCcw, Send, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';
import {
  discardCompositionDraft,
  publishComposition,
  revertComposition,
  type CompositionResult,
} from '@/server/actions/compositions';
import type { CompositionState } from '@/server/services/compositions';

const FORMAT = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * The line between arranging a page and shoppers seeing it.
 *
 * Everything the builder below does is a draft now. This bar says whether
 * there is anything unpublished, lists it in words, and is the only place the
 * page goes live from -- with the previous versions a click away.
 */
export function CompositionBar({ state }: { state: CompositionState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [expanded, setExpanded] = useState(false);
  const pendingChanges = state.changes.length;

  const finish = (result: CompositionResult, message: string) => {
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(message);
    router.refresh();
  };

  const shown = expanded ? state.changes : state.changes.slice(0, 3);

  return (
    <section
      aria-label="Publishing"
      className={cn(
        'sticky top-2 z-20 rounded-lg border px-4 py-3 shadow-sm backdrop-blur sm:px-5',
        pendingChanges ? 'border-warning-100 bg-warning-50/95' : 'border-line bg-raised/95',
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-ink flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span className={cn('size-2 rounded-full', pendingChanges ? 'bg-warning-fill' : 'bg-success-600')} aria-hidden />
            {pendingChanges
              ? `${pendingChanges} unpublished ${pendingChanges === 1 ? 'change' : 'changes'}`
              : 'Everything here is live'}
          </p>
          <p className="text-muted mt-0.5 text-xs" suppressHydrationWarning>
            Last published {FORMAT.format(new Date(state.publishedAt))} by {state.publishedBy}. Edits below are drafts until you publish.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button asChild size="sm" variant="ghost">
            <a href={`/draft/${state.page}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" aria-hidden />
              Preview draft
            </a>
          </Button>

          <HistoryDialog state={state} pending={pending} onRevert={(revisionId) =>
            startTransition(async () => finish(await revertComposition({ page: state.page, revisionId }), 'That version is live again'))
          } />

          {pendingChanges ? (
            <ConfirmDialog
              trigger={
                <Button type="button" size="sm" variant="ghost" disabled={pending}>
                  <Trash2 className="size-4" aria-hidden />
                  Discard
                </Button>
              }
              title="Discard the draft?"
              description="Every unpublished change is undone, and the builder goes back to exactly what shoppers see now."
              confirmLabel="Discard changes"
              tone="danger"
              onConfirm={() =>
                startTransition(async () => finish(await discardCompositionDraft({ page: state.page }), 'Draft discarded'))
              }
            />
          ) : null}

          <ConfirmDialog
            trigger={
              <Button type="button" size="sm" disabled={pending || !pendingChanges}>
                <Send className="size-4" aria-hidden />
                Publish
              </Button>
            }
            title="Publish this page?"
            description="Shoppers see the page as arranged below, straight away. The current version stays in History."
            confirmLabel="Publish now"
            onConfirm={() =>
              startTransition(async () => {
                finish(await publishComposition({ page: state.page, note: note.trim() || null }), 'Published — live now');
                setNote('');
              })
            }
          >
            <Textarea
              label="Note for the history (optional)"
              rows={2}
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Diwali hero and festive rails"
            />
          </ConfirmDialog>
        </div>
      </div>

      {pendingChanges ? (
        <div className="border-warning-100 mt-2.5 border-t pt-2">
          <ul className="text-ink space-y-0.5 text-xs">
            {shown.map((change) => (
              <li key={change} className="before:text-warning-700 before:mr-1.5 before:content-['•']">
                {change}
              </li>
            ))}
          </ul>
          {state.changes.length > 3 ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="text-warning-700 mt-1 inline-flex items-center gap-1 text-xs font-medium"
              aria-expanded={expanded}
            >
              <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden />
              {expanded ? 'Show fewer' : `Show all ${state.changes.length}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function HistoryDialog({
  state,
  pending,
  onRevert,
}: {
  state: CompositionState;
  pending: boolean;
  onRevert: (revisionId: string) => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost">
          <History className="size-4" aria-hidden />
          History
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Published versions"
        description="The last twenty publishes. Putting one back publishes it again straight away and replaces the draft."
        size="lg"
      >
        <ol className="divide-line -mx-1 divide-y">
          {state.revisions.map((revision, index) => (
            <li key={revision.id} className="flex flex-wrap items-start gap-3 px-1 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-ink text-sm">
                  {revision.action}
                  {index === 0 ? (
                    <span className="bg-success-50 text-success-700 ml-2 rounded-full px-2 py-0.5 text-2xs font-medium">Live</span>
                  ) : null}
                </p>
                <p className="text-muted mt-0.5 text-xs" suppressHydrationWarning>
                  {revision.byName} · {FORMAT.format(new Date(revision.at))} · {revision.sectionCount} sections
                  {revision.bannerCount ? `, ${revision.bannerCount} banners` : ''} on
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
                  description="It goes live straight away, and the builder is reset to it. Unpublished changes are replaced."
                  confirmLabel="Put it back"
                  onConfirm={() => onRevert(revision.id)}
                />
              ) : null}
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
