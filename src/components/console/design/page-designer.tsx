'use client';

import { CalendarClock, Check, CircleDot, Copy, Pencil, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { designFor, type PageDesignKey } from '@/domain/page-designs';
import { changedFromDefault, sameConfig } from '@/domain/page-designs/config';
import type { DesignConfig, PageDesignState, SettingValue } from '@/domain/page-designs/types';
import { cn } from '@/lib/cn';
import {
  cancelDesignSchedule,
  discardDesignDraft,
  publishDesign,
  revertDesign,
  saveDesignDraft,
  scheduleDesign,
  type DesignResult,
} from '@/server/actions/page-designs';

import { DesignFields } from './design-fields';
import { DesignHistory, formatWhen } from './design-history';
import { DesignPreview } from './design-preview';
import { DesignSketch } from './sketches';

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const AUTOSAVE_MS = 700;

/**
 * The page designer: one screen for any designable storefront page.
 *
 * THREE STATES, NEVER CONFUSED
 *
 *   live        what shoppers see -- changed only by Publish, a due schedule,
 *               or putting back a version from History
 *   draft       what this screen is working on -- saved automatically a
 *               moment after each change, so the preview is always current
 *               and a closed tab loses nothing
 *   scheduled   a draft handed over to go live at a set time
 *
 * Choosing a layout and editing a layout are separate acts: the pencil opens a
 * layout's settings, "Use this layout" makes it the one the draft will publish.
 * So Marketing can prepare Studio while Classic stays live, and preview both.
 */
export function PageDesigner({
  page,
  initial,
  entities,
  entityLabel,
}: {
  page: PageDesignKey;
  initial: PageDesignState;
  entities: Array<{ value: string; label: string }>;
  entityLabel: string;
}) {
  const definition = designFor(page);
  const [state, setState] = useState(initial);
  const [working, setWorking] = useState<DesignConfig>(initial.draft ?? initial.published);
  const [editing, setEditing] = useState<string>(working.variant);
  const [save, setSave] = useState<SaveState>(initial.draft ? 'saved' : 'idle');
  const [reloadKey, setReloadKey] = useState(0);
  const [entity, setEntity] = useState(entities[0]?.value ?? '');
  const [note, setNote] = useState('');
  const [when, setWhen] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<DesignConfig>(working);

  const live = state.published;
  const hasChanges = !sameConfig(working, live);
  const liveMeta = definition.variantMeta[live.variant];
  const editingMeta = definition.variantMeta[editing];

  /* -------------------------------------------------------------- saving */

  const apply = (result: DesignResult, message?: string) => {
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    setState(result.state);
    const next = result.state.draft ?? result.state.published;
    latest.current = next;
    setWorking(next);
    setReloadKey((key) => key + 1);
    if (message) toast.success(message);
    return true;
  };

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSave('saving');
    const result = await saveDesignDraft({ page, config: latest.current });
    if (!result.ok) {
      setSave('error');
      toast.error(result.error);
      return false;
    }
    setState(result.state);
    setSave(result.state.draft ? 'saved' : 'idle');
    setReloadKey((key) => key + 1);
    return true;
  };

  const update = (next: DesignConfig) => {
    latest.current = next;
    setWorking(next);
    setSave('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  };

  const setField = (key: string, value: SettingValue) =>
    update({
      ...working,
      settings: { ...working.settings, [editing]: { ...working.settings[editing], [key]: value } },
    });

  const cancelAutosave = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  // Leaving with a change not yet saved asks first; Ctrl/Cmd+S saves now.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void flush();
      }
    };
    const onLeave = (event: BeforeUnloadEvent) => {
      if (timer.current) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onLeave);
      if (timer.current) clearTimeout(timer.current);
    };
    // `flush` reads refs only; binding once is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------- actions */

  const doPublish = () => {
    cancelAutosave();
    startTransition(async () => {
      const ok = apply(await publishDesign({ page, config: latest.current, note: note.trim() || null }), 'Published — live now');
      if (ok) {
        setNote('');
        setSave('idle');
      }
    });
  };

  const doSchedule = () => {
    const at = new Date(when);
    if (Number.isNaN(at.getTime())) {
      toast.error('Pick a date and time.');
      return;
    }
    cancelAutosave();
    startTransition(async () => {
      const ok = apply(
        await scheduleDesign({ page, config: latest.current, at: at.toISOString() }),
        `Scheduled for ${formatWhen(at.toISOString())}`,
      );
      if (ok) {
        setScheduleOpen(false);
        setSave('idle');
      }
    });
  };

  const doDiscard = () => {
    cancelAutosave();
    startTransition(async () => {
      if (apply(await discardDesignDraft({ page }), 'Draft discarded — back to what is live')) setSave('idle');
    });
  };

  const doUnschedule = () =>
    startTransition(async () => {
      apply(await cancelDesignSchedule({ page }), 'Schedule cancelled');
    });

  const doRevert = (revisionId: string) => {
    cancelAutosave();
    startTransition(async () => {
      if (apply(await revertDesign({ page, revisionId }), 'That version is live again')) setSave('idle');
    });
  };

  /* -------------------------------------------------------------- render */

  const settings = working.settings[editing];
  const defaults = definition.defaults[editing];
  const changedCount = changedFromDefault(definition, editing, settings).size;
  const previewPath = entity ? definition.preview.path(entity, editing) : null;

  return (
    <div className="mt-6 space-y-6">
      {/* ----------------------------------------------------- status bar */}
      <div className="border-line bg-raised/95 sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 shadow-sm backdrop-blur sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="text-ink flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span className="bg-success-600 size-2 rounded-full" aria-hidden />
            Live: Variant {liveMeta.number} · {liveMeta.name}
            {hasChanges ? (
              <span className="bg-warning-50 text-warning-700 rounded-full px-2 py-0.5 text-2xs font-medium">
                Draft — not published
              </span>
            ) : null}
          </p>
          <p className="text-muted mt-0.5 text-xs" role="status" aria-live="polite">
            {save === 'pending' || save === 'saving'
              ? 'Saving draft…'
              : save === 'error'
                ? 'The draft did not save. Press Ctrl+S to try again.'
                : hasChanges
                  ? `Draft saved. Will publish Variant ${definition.variantMeta[working.variant].number} · ${definition.variantMeta[working.variant].name}.`
                  : 'Nothing unpublished. Changes save as a draft automatically.'}
          </p>
        </div>

        {state.scheduled ? (
          <div className="bg-info-50 text-info-700 flex items-center gap-2 rounded-md px-3 py-1.5 text-xs">
            <CalendarClock className="size-4" aria-hidden />
            <span suppressHydrationWarning>Goes live {formatWhen(state.scheduled.at)}</span>
            <button
              type="button"
              onClick={doUnschedule}
              disabled={pending}
              className="hover:bg-info-100 grid size-6 place-items-center rounded"
              aria-label="Cancel the schedule"
              title="Cancel the schedule"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          {hasChanges ? (
            <ConfirmDialog
              trigger={
                <Button type="button" size="sm" variant="ghost" disabled={pending}>
                  <Trash2 className="size-4" aria-hidden />
                  Discard
                </Button>
              }
              title="Discard the draft?"
              description="Every unpublished change on this page is thrown away, and the editor goes back to what shoppers see now."
              confirmLabel="Discard draft"
              tone="danger"
              onConfirm={doDiscard}
            />
          ) : null}

          <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="secondary" disabled={pending || !hasChanges}>
                <CalendarClock className="size-4" aria-hidden />
                Schedule
              </Button>
            </DialogTrigger>
            <DialogContent
              title="Schedule this draft"
              description="It goes live on its own at the time you pick, within a few minutes. Until then shoppers keep seeing the current page."
              size="sm"
              footer={
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setScheduleOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={doSchedule} disabled={pending || !when}>
                    Schedule
                  </Button>
                </div>
              }
            >
              <Input
                label="Go live at"
                type="datetime-local"
                value={when}
                onChange={(event) => setWhen(event.target.value)}
                hint="Your local time."
              />
            </DialogContent>
          </Dialog>

          <ConfirmDialog
            trigger={
              <Button type="button" size="sm" disabled={pending || !hasChanges || save === 'saving'}>
                <Send className="size-4" aria-hidden />
                Publish
              </Button>
            }
            title="Publish this page?"
            description={`Every shopper sees Variant ${definition.variantMeta[working.variant].number} · ${definition.variantMeta[working.variant].name}, with these settings, straight away. The current version stays in History.`}
            confirmLabel="Publish now"
            onConfirm={doPublish}
          >
            <Textarea
              label="Note for the history (optional)"
              rows={2}
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Festive layout for the Diwali sale"
            />
          </ConfirmDialog>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)]">
        <div className="min-w-0 space-y-6">
          {/* ------------------------------------------------- layouts */}
          <section aria-label="Layouts" className="grid gap-4 md:grid-cols-3">
            {definition.variants.map((variant) => {
              const info = definition.variantMeta[variant];
              const isLive = live.variant === variant;
              const inDraft = working.variant === variant;
              const selected = editing === variant;
              return (
                <article
                  key={variant}
                  className={cn(
                    'bg-raised flex flex-col overflow-hidden rounded-lg border transition-shadow',
                    selected ? 'border-ink ring-ink shadow-md ring-1' : 'border-line hover:shadow-sm',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setEditing(variant)}
                    className="bg-sunken block h-40 overflow-hidden p-4 text-left"
                    aria-label={`Edit Variant ${info.number}, ${info.name}`}
                  >
                    <DesignSketch sketch={info.sketch} />
                  </button>

                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h2 className="text-ink text-sm font-semibold">
                        Variant {info.number} · {info.name}
                      </h2>
                      {isLive ? (
                        <span className="bg-success-50 text-success-700 rounded-full px-2 py-0.5 text-2xs font-medium">Live</span>
                      ) : null}
                      {inDraft && !isLive ? (
                        <span className="bg-warning-50 text-warning-700 rounded-full px-2 py-0.5 text-2xs font-medium">
                          In draft
                        </span>
                      ) : null}
                    </div>
                    <p className="text-muted flex-1 text-xs leading-relaxed">{info.description}</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Button
                        type="button"
                        size="xs"
                        variant={selected ? 'inverse' : 'secondary'}
                        onClick={() => setEditing(variant)}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                        {selected ? 'Editing' : 'Edit'}
                      </Button>
                      {inDraft ? (
                        <span className="text-success-700 inline-flex items-center gap-1 px-1 text-xs font-medium">
                          <Check className="size-3.5" aria-hidden />
                          In use
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => {
                            update({ ...working, variant });
                            setEditing(variant);
                          }}
                        >
                          <CircleDot className="size-3.5" aria-hidden />
                          Use this layout
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          {/* ------------------------------------------------ settings */}
          <section className="border-line bg-raised rounded-lg border" aria-label={`Variant ${editingMeta.number} settings`}>
            <header className="border-line flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2 className="text-ink text-sm font-semibold">
                  What Variant {editingMeta.number} · {editingMeta.name} shows
                </h2>
                <p className="text-muted mt-0.5 text-xs">
                  {changedCount === 0
                    ? 'As designed. Every switch is at this layout’s default.'
                    : `${changedCount} ${changedCount === 1 ? 'setting differs' : 'settings differ'} from this layout’s default.`}
                  {working.variant !== editing ? ' Not the layout in use — choose “Use this layout” to publish it.' : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="sr-only" htmlFor="copy-from">
                  Copy settings from another layout
                </label>
                <div className="relative">
                  <Copy className="text-muted pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2" aria-hidden />
                  <select
                    id="copy-from"
                    value=""
                    onChange={(event) => {
                      const source = event.target.value;
                      if (!source) return;
                      update({ ...working, settings: { ...working.settings, [editing]: { ...working.settings[source] } } });
                      toast.success(`Copied ${definition.variantMeta[source].name}’s settings`);
                    }}
                    className="border-line bg-raised text-ink h-7 rounded-sm border pl-7 pr-2 text-xs"
                  >
                    <option value="">Copy from…</option>
                    {definition.variants
                      .filter((variant) => variant !== editing)
                      .map((variant) => (
                        <option key={variant} value={variant}>
                          Variant {definition.variantMeta[variant].number} · {definition.variantMeta[variant].name}
                        </option>
                      ))}
                  </select>
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={changedCount === 0}
                  onClick={() => update({ ...working, settings: { ...working.settings, [editing]: { ...defaults } } })}
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  Reset layout
                </Button>
              </div>
            </header>

            <DesignFields groups={definition.groups} settings={settings} defaults={defaults} variant={editing} onChange={setField} />
          </section>
        </div>

        {/* ------------------------------------------------- preview */}
        <div className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          <DesignPreview
            path={previewPath}
            reloadKey={reloadKey}
            entities={entities}
            entity={entity}
            onEntity={setEntity}
            entityLabel={entityLabel}
          />
        </div>
      </div>

      <DesignHistory
        revisions={state.revisions}
        variantMeta={definition.variantMeta}
        pending={pending}
        onRevert={doRevert}
      />
    </div>
  );
}
