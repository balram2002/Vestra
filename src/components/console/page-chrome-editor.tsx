'use client';

import { RotateCcw } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  CHROME_PAGES,
  CHROME_PART_HINT,
  CHROME_PART_LABEL,
  CHROME_PARTS,
  DEFAULT_PAGE_CHROME,
  type ChromePageKey,
  type ChromePart,
  type PageChrome,
} from '@/domain/page-chrome';
import { cn } from '@/lib/cn';
import { saveAppearance } from '@/server/actions/appearance';

/**
 * Which frame each page wears.
 *
 * A table, because the question is two-dimensional: every page family down the
 * side, every piece of the frame across the top. The column headers switch a
 * piece on or off for every page at once, which is the edit people actually
 * make most ("no footer anywhere in checkout and account").
 *
 * Drafted, not saved per click: turning the header off on the homepage by a
 * stray tap should not reach shoppers before Save.
 */
export function PageChromeEditor({ initial }: { initial: PageChrome }) {
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const persist = (next: PageChrome, message: string) => {
    startTransition(async () => {
      const result = await saveAppearance({ block: 'pageChrome', value: next });
      if (!result.ok) {
        toast.error(result.error ?? 'That did not save.');
        return;
      }
      setSaved(next);
      setDraft(next);
      toast.success(message);
    });
  };

  const setCell = (page: ChromePageKey, part: ChromePart, value: boolean) =>
    setDraft({ ...draft, [page]: { ...draft[page], [part]: value } });

  const allOn = (part: ChromePart) => CHROME_PAGES.every((page) => draft[page.key][part]);

  const setColumn = (part: ChromePart, value: boolean) =>
    setDraft(
      Object.fromEntries(
        CHROME_PAGES.map((page) => [page.key, { ...draft[page.key], [part]: value }]),
      ) as PageChrome,
    );

  return (
    <section className="border-line bg-raised mt-6 rounded-lg border" aria-label="Page layout">
      <header className="border-line flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-ink text-sm font-semibold">Frame by page</h2>
          <p className="text-muted mt-0.5 text-xs">
            Switch the promotion strip, header, footer and phone bottom bar on or off for each kind of page.
            Everything not listed keeps the full frame.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {dirty ? <span className="text-warning-700 text-2xs font-medium">Unsaved</span> : null}
          <ConfirmDialog
            trigger={
              <Button type="button" size="xs" variant="ghost" disabled={pending}>
                <RotateCcw className="size-3.5" aria-hidden />
                Reset
              </Button>
            }
            title="Show the full frame everywhere?"
            description="Every page gets its promotion strip, header, footer and bottom bar back, straight away."
            confirmLabel="Reset"
            tone="danger"
            onConfirm={() => persist(DEFAULT_PAGE_CHROME, 'Full frame restored on every page')}
          />
          <Button
            type="button"
            size="xs"
            disabled={pending || !dirty}
            onClick={() => persist(draft, 'Saved — live on the shop')}
          >
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
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
                      onChange={(event) => setColumn(part, event.target.checked)}
                      aria-label={`${CHROME_PART_LABEL[part]} on every page`}
                    />
                    All
                  </label>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {CHROME_PAGES.map((page) => {
              const rule = draft[page.key];
              const bare = CHROME_PARTS.every((part) => !rule[part]);
              return (
                <tr key={page.key} className={cn(bare && 'bg-sunken/60')}>
                  <th scope="row" className="px-4 py-2.5 text-left font-normal sm:px-5">
                    <span className="text-ink block text-sm font-medium">{page.label}</span>
                    <span className="text-faint block font-mono text-2xs">{page.example}</span>
                  </th>
                  {CHROME_PARTS.map((part) => (
                    <td key={part} className="px-3 py-2.5 text-center">
                      <CellSwitch
                        checked={rule[part]}
                        onChange={(value) => setCell(page.key, part, value)}
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

      <p className="text-muted border-line border-t px-4 py-3 text-2xs sm:px-5">
        Sign-in pages, the reels feed and live calls have their own full-screen frames and are not affected.
        The promotion strip also follows its own switch under Appearance.
      </p>
    </section>
  );
}

/** A compact on/off switch for a table cell; the row and column say what it is. */
function CellSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
        checked ? 'bg-ink' : 'bg-line-control',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'bg-canvas inline-block size-5 rounded-full shadow-sm transition-transform',
          checked ? 'translate-x-5.5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
