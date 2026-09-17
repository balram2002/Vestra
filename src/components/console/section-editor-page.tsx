'use client';

import { ArrowLeft, Eye, EyeOff, RotateCcw, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { HomeSection } from '@/domain/types';
import { cn } from '@/lib/cn';
import { setSectionActive } from '@/server/actions/admin';
import { resetSection, updateSection } from '@/server/actions/sections';

import { DESCRIPTIONS, LABELS, SectionForm } from './section-form';
import { SectionPreview } from './section-preview';

/**
 * Editing a section, as a page.
 *
 * It was a dialog, and a dialog was the wrong shape for it: a hand-picked rail
 * is a search, an ordered list of twenty products and a dozen settings, and
 * the one thing an editor most needs -- to SEE the result -- had nowhere to go.
 * As a page it has the room for both: the form on one side, the real section
 * rendered from the live catalogue on the other.
 *
 * WHAT ASKS TWICE, AND WHY
 *
 *   saving a LIVE section      shoppers see it the moment it is saved
 *   hiding or showing it       it leaves or joins the page for everyone
 *   resetting it               an edit is thrown away; typed, because it
 *                              cannot be undone with a click
 *   discarding changes         the only copy of that work is on this screen
 *
 * Saving a hidden section does not ask: nothing a shopper can see changes.
 *
 * Visibility and reset are unavailable while there are unsaved changes. Both
 * reload the section from the server, and doing either mid-edit would quietly
 * throw the draft away -- so the page says "save or discard first" instead.
 */

function editable(section: HomeSection) {
  const { title, subtitle, href, ctaLabel, visibleOn, startsAt, endsAt, config } = section;
  return { title, subtitle, href, ctaLabel, visibleOn, startsAt, endsAt, config };
}

export function SectionEditorPage({
  section,
  back,
  displayedCategories,
}: {
  section: HomeSection;
  back: { href: string; label: string };
  displayedCategories: Array<{ id: string; label: string; imageUrl: string | null }>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(section);
  const [pending, startTransition] = useTransition();
  const [confirmingSave, setConfirmingSave] = useState(false);

  const dirty = JSON.stringify(editable(draft)) !== JSON.stringify(editable(section));
  const name = section.title || LABELS[section.kind] || section.kind;

  // Closing the tab on unsaved work asks the browser to ask first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? 'That did not go through.');
        return;
      }
      toast.success(done);
      // The server page re-renders with the saved section, and remounts this
      // editor from it -- so the draft and the saved copy agree again.
      router.refresh();
    });
  };

  const persist = () =>
    run(
      () => updateSection({ sectionId: section.id, patch: editable(draft) }),
      section.isActive ? 'Saved, and live on the shop' : 'Saved',
    );

  const save = () => {
    if (section.isActive) setConfirmingSave(true);
    else persist();
  };

  const blockedReason = dirty ? 'Save or discard your changes first' : undefined;

  return (
    <div className="pb-24 lg:pb-8">
      {/* ------------------------------------------------------ the bar */}
      <div className="border-line bg-canvas/90 sticky top-0 z-20 -mx-4 border-b px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={back.href}
              className="text-muted hover:text-ink inline-flex items-center gap-1 text-2xs"
            >
              <ArrowLeft className="size-3" aria-hidden />
              {back.label}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h1 className="text-ink truncate text-lg font-semibold">{name}</h1>
              <span className="bg-sunken text-muted rounded px-1.5 py-0.5 text-3xs font-medium uppercase tracking-wide">
                {LABELS[section.kind] ?? section.kind}
              </span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-2xs font-medium',
                  section.isActive ? 'bg-success-50 text-success-700' : 'bg-sunken text-muted',
                )}
              >
                {section.isActive ? 'Live' : 'Hidden'}
              </span>
              {dirty ? (
                <span className="bg-warning-50 text-warning-700 rounded-full px-2 py-0.5 text-2xs font-medium">
                  Unsaved changes
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <ConfirmDialog
              trigger={
                <Button type="button" size="sm" variant="ghost" disabled={!dirty || pending}>
                  <Undo2 className="size-4" aria-hidden />
                  Discard
                </Button>
              }
              title="Discard your changes?"
              description="Everything you changed since the last save is thrown away. The section on the shop is not touched."
              confirmLabel="Discard changes"
              tone="danger"
              onConfirm={() => setDraft(section)}
            />

            <ConfirmDialog
              trigger={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={dirty || pending}
                  title={blockedReason}
                >
                  <RotateCcw className="size-4" aria-hidden />
                  Reset
                </Button>
              }
              title="Reset this section?"
              description="Its words, contents, layout and schedule go back to how the section shipped. Where it sits on the page, and whether it is live, stay as they are."
              confirmLabel="Reset section"
              tone="danger"
              requireText="RESET"
              onConfirm={() =>
                run(() => resetSection({ sectionId: section.id }), 'Section reset to its default')
              }
            />

            <ConfirmDialog
              trigger={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={dirty || pending}
                  title={blockedReason}
                >
                  {section.isActive ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                  {section.isActive ? 'Hide' : 'Show'}
                </Button>
              }
              title={section.isActive ? 'Hide this section?' : 'Show this section?'}
              description={
                section.isActive
                  ? 'It comes off the page for every shopper straight away. Nothing is deleted, and it can be shown again at any time.'
                  : 'It joins the page for every shopper straight away, exactly as the preview shows it.'
              }
              confirmLabel={section.isActive ? 'Hide section' : 'Show section'}
              tone={section.isActive ? 'danger' : 'default'}
              onConfirm={() =>
                run(
                  () => setSectionActive({ sectionId: section.id, isActive: !section.isActive }),
                  section.isActive ? 'Hidden from the page' : 'Live on the page',
                )
              }
            />

            <Button type="button" size="sm" onClick={save} disabled={!dirty || pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        {DESCRIPTIONS[section.kind] ? (
          <p className="text-muted mt-1 text-xs">{DESCRIPTIONS[section.kind]}</p>
        ) : null}
      </div>

      {/* ---------------------------------------------------- the work */}
      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
          <SectionForm draft={draft} update={setDraft} displayedCategories={displayedCategories} />
        </div>

        <aside className="min-w-0 xl:sticky xl:top-28 xl:self-start">
          <SectionPreview section={section} draft={draft} dirty={dirty} />
        </aside>
      </div>

      <ConfirmDialog
        open={confirmingSave}
        onOpenChange={setConfirmingSave}
        title="Publish these changes?"
        description="This section is live. Shoppers see the changes the moment you save — the preview shows exactly what they will get."
        confirmLabel="Save and publish"
        onConfirm={persist}
      />
    </div>
  );
}
