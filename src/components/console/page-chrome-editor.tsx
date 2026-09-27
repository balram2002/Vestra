'use client';

import { ExternalLink, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  CHROME_MODE_LABEL,
  CHROME_MODES,
  CHROME_PAGES,
  CHROME_PART_HINT,
  CHROME_PART_LABEL,
  CHROME_PARTS,
  DEFAULT_PAGE_CHROME,
  normalisePath,
  type ChromeMode,
  type ChromeOverride,
  type ChromePageKey,
  type ChromePart,
  type ChromeRule,
  type PageLayoutRules,
} from '@/domain/page-chrome';
import { cn } from '@/lib/cn';
import { saveAppearance } from '@/server/actions/appearance';

import { BlockHistory } from './block-history';

const ALL_ON: ChromeRule = { strip: 'all', header: 'all', footer: 'all', bottomNav: 'all' };

/**
 * Which frame each page wears.
 *
 * A table, because the question is two-dimensional: every page family down the
 * side, every piece of the frame across the top. Each cell says where that
 * piece shows -- everywhere, only on desktop, only on phones, or not at all.
 * Below it, single pages can override their family: one landing page with no
 * header, without taking the header off every page like it.
 *
 * Drafted, not saved per click, and every save is kept in History.
 */
export function PageChromeEditor({ initial }: { initial: PageLayoutRules }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const persist = (next: PageLayoutRules, message: string) => {
    setError(null);
    startTransition(async () => {
      const result = await saveAppearance({
        block: 'pageChrome',
        value: { ...next, overrides: next.overrides.map((override) => ({ ...override, path: normalisePath(override.path) })) },
      });
      if (!result.ok) {
        setError(result.error ?? 'That did not save.');
        toast.error(result.error ?? 'That did not save.');
        return;
      }
      setSaved(next);
      setDraft(next);
      toast.success(message);
      router.refresh();
    });
  };

  const setCell = (page: ChromePageKey, part: ChromePart, mode: ChromeMode) =>
    setDraft({ ...draft, pages: { ...draft.pages, [page]: { ...draft.pages[page], [part]: mode } } });

  const allOn = (part: ChromePart) => CHROME_PAGES.every((page) => draft.pages[page.key][part] === 'all');
  const setColumn = (part: ChromePart, mode: ChromeMode) =>
    setDraft({
      ...draft,
      pages: Object.fromEntries(
        CHROME_PAGES.map((page) => [page.key, { ...draft.pages[page.key], [part]: mode }]),
      ) as PageLayoutRules['pages'],
    });

  const setOverride = (id: string, patch: Partial<ChromeOverride>) =>
    setDraft({ ...draft, overrides: draft.overrides.map((item) => (item.id === id ? { ...item, ...patch } : item)) });

  return (
    <div className="mt-6 space-y-6">
      <section className="border-line bg-raised rounded-lg border" aria-label="Frame by page">
        <header className="border-line flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-ink text-sm font-semibold">Frame by page</h2>
            <p className="text-muted mt-0.5 text-xs">
              Where the promotion strip, header, footer and phone bottom bar show, for each kind of page. Anything not
              listed keeps the full frame.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {dirty ? <span className="text-warning-700 text-2xs font-medium">Unsaved</span> : null}
            <BlockHistory block="pageChrome" title="Page layout" />
            <ConfirmDialog
              trigger={
                <Button type="button" size="xs" variant="ghost" disabled={pending}>
                  <RotateCcw className="size-3.5" aria-hidden />
                  Reset
                </Button>
              }
              title="Show the full frame everywhere?"
              description="Every page gets its promotion strip, header, footer and bottom bar back, and single-page rules are removed. The current rules stay in History."
              confirmLabel="Reset"
              tone="danger"
              onConfirm={() => persist(DEFAULT_PAGE_CHROME, 'Full frame restored on every page')}
            />
            <Button type="button" size="xs" disabled={pending || !dirty} onClick={() => persist(draft, 'Saved — live on the shop')}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </header>

        {error ? (
          <p className="bg-danger-50 text-danger-700 border-line border-b px-4 py-2 text-xs sm:px-5" role="alert">
            {error}
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-184 text-sm">
            <thead>
              <tr className="border-line border-b">
                <th scope="col" className="text-faint px-4 py-3 text-left text-2xs font-semibold uppercase tracking-wider sm:px-5">
                  Page
                </th>
                {CHROME_PARTS.map((part) => (
                  <th key={part} scope="col" className="px-3 py-3 text-center align-bottom">
                    <span className="text-ink block text-xs font-semibold">{CHROME_PART_LABEL[part]}</span>
                    <span className="text-faint block text-2xs font-normal">{CHROME_PART_HINT[part]}</span>
                    <label className="text-muted mt-1.5 inline-flex items-center gap-1 text-2xs">
                      <input
                        type="checkbox"
                        className="accent-ink size-3.5"
                        checked={allOn(part)}
                        onChange={(event) => setColumn(part, event.target.checked ? 'all' : 'none')}
                        aria-label={`${CHROME_PART_LABEL[part]} everywhere, on every page`}
                      />
                      All on
                    </label>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {CHROME_PAGES.map((page) => {
                const rule = draft.pages[page.key];
                const bare = CHROME_PARTS.every((part) => rule[part] === 'none');
                return (
                  <tr key={page.key} className={cn(bare && 'bg-sunken/60')}>
                    <th scope="row" className="px-4 py-2 text-left font-normal sm:px-5">
                      <span className="text-ink block text-sm font-medium">{page.label}</span>
                      <span className="text-faint block font-mono text-2xs">{page.example}</span>
                    </th>
                    {CHROME_PARTS.map((part) => (
                      <td key={part} className="px-3 py-2 text-center">
                        <ModeSelect
                          part={part}
                          value={rule[part]}
                          onChange={(mode) => setCell(page.key, part, mode)}
                          label={`${CHROME_PART_LABEL[part]} on ${page.label}`}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------------------------------------------ overrides */}
      <section className="border-line bg-raised rounded-lg border" aria-label="Single pages">
        <header className="border-line flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-ink text-sm font-semibold">Single pages</h2>
            <p className="text-muted mt-0.5 text-xs">
              One exact page with its own frame, ahead of its family’s rule — a campaign landing page with no header, say.
            </p>
          </div>
          <Button
            type="button"
            size="xs"
            variant="secondary"
            disabled={draft.overrides.length >= 50}
            onClick={() =>
              setDraft({
                ...draft,
                overrides: [...draft.overrides, { id: `path-${Math.random().toString(36).slice(2, 8)}`, path: '/', rule: ALL_ON }],
              })
            }
          >
            <Plus className="size-3.5" aria-hidden />
            Add a page
          </Button>
        </header>

        {draft.overrides.length === 0 ? (
          <p className="text-muted px-4 py-5 text-sm sm:px-5">No single-page rules. Every page follows its family above.</p>
        ) : (
          <ul className="divide-line divide-y">
            {draft.overrides.map((override) => (
              <li key={override.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <label className="min-w-48 flex-1">
                  <span className="sr-only">Page path</span>
                  <input
                    value={override.path}
                    onChange={(event) => setOverride(override.id, { path: event.target.value })}
                    placeholder="/sell-with-us/apply"
                    className="border-line-control bg-canvas text-ink h-9 w-full rounded-md border px-2.5 font-mono text-sm"
                  />
                </label>
                {CHROME_PARTS.map((part) => (
                  <div key={part} className="flex flex-col items-center gap-0.5">
                    <span className="text-faint text-3xs uppercase tracking-wide">{CHROME_PART_LABEL[part]}</span>
                    <ModeSelect
                      part={part}
                      value={override.rule[part]}
                      onChange={(mode) => setOverride(override.id, { rule: { ...override.rule, [part]: mode } })}
                      label={`${CHROME_PART_LABEL[part]} on ${override.path}`}
                    />
                  </div>
                ))}
                <a
                  href={normalisePath(override.path)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted hover:text-ink hover:bg-sunken grid size-8 place-items-center rounded-md"
                  aria-label={`Open ${override.path}`}
                  title="Open the page"
                >
                  <ExternalLink className="size-4" aria-hidden />
                </a>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, overrides: draft.overrides.filter((item) => item.id !== override.id) })}
                  className="text-danger-600 hover:bg-sunken grid size-8 place-items-center rounded-md"
                  aria-label={`Remove the rule for ${override.path}`}
                  title="Remove"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-muted border-line border-t px-4 py-3 text-2xs sm:px-5">
          Sign-in pages, the reels feed and live calls have their own full-screen frames and are not affected. The
          promotion strip also follows its own switch and schedule under Appearance. Changes apply when you press Save
          above.
        </p>
      </section>
    </div>
  );
}

/** Where one piece shows. The bottom bar is phone-only, so it is simply on or off. */
function ModeSelect({
  part,
  value,
  onChange,
  label,
}: {
  part: ChromePart;
  value: ChromeMode;
  onChange: (mode: ChromeMode) => void;
  label: string;
}) {
  const modes = part === 'bottomNav' ? (['all', 'none'] as const) : CHROME_MODES;
  return (
    <select
      value={part === 'bottomNav' && value !== 'none' ? 'all' : value}
      onChange={(event) => onChange(event.target.value as ChromeMode)}
      aria-label={label}
      className={cn(
        'h-8 rounded-md border px-2 text-xs font-medium',
        value === 'all'
          ? 'border-line-control bg-raised text-ink'
          : value === 'none'
            ? 'border-line bg-sunken text-muted'
            : 'border-info-100 bg-info-50 text-info-700',
      )}
    >
      {modes.map((mode) => (
        <option key={mode} value={mode}>
          {part === 'bottomNav' ? (mode === 'all' ? 'On' : 'Off') : CHROME_MODE_LABEL[mode]}
        </option>
      ))}
    </select>
  );
}
