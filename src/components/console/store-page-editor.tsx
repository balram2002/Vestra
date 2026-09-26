'use client';

import { Check, ExternalLink, Pencil, RotateCcw } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/choice';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import {
  DEFAULT_STORE_PAGE,
  STORE_PAGE_TOGGLE_GROUPS,
  STORE_PAGE_VARIANT_META,
  STORE_PAGE_VARIANTS,
  type ProductStyle,
  type StorePageConfig,
  type StorePageSettings,
  type StorePageVariant,
} from '@/domain/store-page';
import { cn } from '@/lib/cn';
import { saveAppearance } from '@/server/actions/appearance';

/**
 * The store page, arranged.
 *
 * Two decisions on one screen, kept apart on purpose:
 *
 *   WHICH LAYOUT IS LIVE   one button per layout, asks first, saves at once
 *   WHAT EACH LAYOUT SHOWS a draft of switches per layout, saved with Save
 *
 * Editing a layout never makes it live, so Marketing can prepare Spotlight,
 * preview it on a real store, and only then switch every store over.
 */
export function StorePageEditor({
  config,
  sellers,
}: {
  config: StorePageConfig;
  sellers: Array<{ slug: string; name: string }>;
}) {
  const [saved, setSaved] = useState(config);
  const [editing, setEditing] = useState<StorePageVariant>(config.variant);
  const [draft, setDraft] = useState<StorePageSettings>(config.settings[config.variant]);
  const [previewSlug, setPreviewSlug] = useState(sellers[0]?.slug ?? '');
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.settings[editing]);

  const persist = (next: StorePageConfig, message: string, after?: () => void) => {
    startTransition(async () => {
      const result = await saveAppearance({ block: 'storePage', value: next });
      if (!result.ok) {
        toast.error(result.error ?? 'That did not save.');
        return;
      }
      setSaved(next);
      after?.();
      toast.success(message);
    });
  };

  const open = (variant: StorePageVariant) => {
    if (dirty && !window.confirm('Leave this layout? Your unsaved switches will be lost.')) return;
    setEditing(variant);
    setDraft(saved.settings[variant]);
  };

  const set = <K extends keyof StorePageSettings>(key: K, value: StorePageSettings[K]) =>
    setDraft({ ...draft, [key]: value });

  const meta = STORE_PAGE_VARIANT_META[editing];

  return (
    <div className="mt-6 space-y-6">
      {/* ------------------------------------------------------ layouts */}
      <section aria-label="Layouts" className="grid gap-4 md:grid-cols-3">
        {STORE_PAGE_VARIANTS.map((variant) => {
          const info = STORE_PAGE_VARIANT_META[variant];
          const live = saved.variant === variant;
          const selected = editing === variant;
          return (
            <article
              key={variant}
              className={cn(
                'bg-raised flex flex-col overflow-hidden rounded-lg border',
                selected ? 'border-ink ring-ink ring-1' : 'border-line',
              )}
            >
              <button
                type="button"
                onClick={() => open(variant)}
                className="bg-sunken block h-44 overflow-hidden p-4 text-left"
                aria-label={`Edit Variant ${info.number}, ${info.name}`}
              >
                <Thumbnail variant={variant} />
              </button>

              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-ink text-sm font-semibold">
                    Variant {info.number} · {info.name}
                  </h2>
                  {live ? (
                    <span className="bg-success-50 text-success-700 rounded-full px-2 py-0.5 text-2xs font-medium">
                      Live
                    </span>
                  ) : null}
                </div>
                <p className="text-muted flex-1 text-xs leading-relaxed">{info.description}</p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Button type="button" size="xs" variant={selected ? 'inverse' : 'secondary'} onClick={() => open(variant)}>
                    <Pencil className="size-3.5" aria-hidden />
                    {selected ? 'Editing' : 'Edit'}
                  </Button>
                  {previewSlug ? (
                    <Button asChild size="xs" variant="ghost">
                      <a href={`/store/${previewSlug}/preview/${variant}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-3.5" aria-hidden />
                        Preview
                      </a>
                    </Button>
                  ) : null}
                  {!live ? (
                    <ConfirmDialog
                      trigger={
                        <Button type="button" size="xs" disabled={pending}>
                          <Check className="size-3.5" aria-hidden />
                          Make live
                        </Button>
                      }
                      title={`Make ${info.name} the store page?`}
                      description="Every store’s public page switches to this layout straight away, with the switches saved for it. The other layouts keep their settings."
                      confirmLabel="Make it live"
                      onConfirm={() =>
                        persist({ ...saved, variant }, `Variant ${info.number} is live on every store`)
                      }
                    />
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {sellers.length > 0 ? (
        <div className="max-w-sm">
          <Select
            label="Preview with store"
            hint="Previews show the saved switches, on a real store. Save first to preview a change."
            value={previewSlug}
            onChange={(event) => setPreviewSlug(event.target.value)}
          >
            {sellers.map((seller) => (
              <option key={seller.slug} value={seller.slug}>
                {seller.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {/* ------------------------------------------------------- switches */}
      <section className="border-line bg-raised rounded-lg border" aria-label={`Variant ${meta.number} settings`}>
        <header className="border-line flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-ink text-sm font-semibold">
              What Variant {meta.number} · {meta.name} shows
            </h2>
            <p className="text-muted mt-0.5 text-xs">
              {saved.variant === editing
                ? 'This is the live layout. Saving changes every store page straight away.'
                : 'Not live. Save, preview, then make it live when it is ready.'}
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
              title={`Reset ${meta.name}?`}
              description="Its switches go back to how the layout was designed. The other layouts are not touched."
              confirmLabel="Reset"
              tone="danger"
              onConfirm={() => {
                const shipped = DEFAULT_STORE_PAGE.settings[editing];
                persist(
                  { ...saved, settings: { ...saved.settings, [editing]: shipped } },
                  `${meta.name} is back to its original design`,
                  () => setDraft(shipped),
                );
              }}
            />
            <Button
              type="button"
              size="xs"
              disabled={pending || !dirty}
              onClick={() =>
                persist(
                  { ...saved, settings: { ...saved.settings, [editing]: draft } },
                  saved.variant === editing ? 'Saved — live on every store' : 'Saved — preview it before making it live',
                )
              }
            >
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </header>

        <div className="grid gap-x-8 gap-y-6 p-4 sm:p-5 lg:grid-cols-2">
          {STORE_PAGE_TOGGLE_GROUPS.map((group) => (
            <fieldset key={group.title} className="min-w-0">
              <legend className="text-faint mb-1 text-2xs font-semibold uppercase tracking-wider">{group.title}</legend>
              <div className="divide-line divide-y">
                {group.toggles.map((toggle) => (
                  <Switch
                    key={toggle.key}
                    label={toggle.label}
                    description={toggle.description}
                    checked={draft[toggle.key]}
                    onChange={(event) => set(toggle.key, event.target.checked)}
                  />
                ))}
              </div>

              {group.title === 'Products' ? (
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-ink mb-1.5 text-sm font-medium">Product layout</p>
                    <Segmented<ProductStyle>
                      label="Product layout"
                      value={draft.productStyle}
                      onChange={(value) => set('productStyle', value)}
                      options={[
                        { value: 'reels', label: 'Reels' },
                        { value: 'grid', label: 'Grid' },
                      ]}
                      size="sm"
                    />
                    <p className="text-muted mt-1 text-2xs">
                      {editing === 'studio'
                        ? 'Studio shows both as tabs; this is the one it opens on.'
                        : 'Reels are tall 9:16 tiles; the grid is the standard product card.'}
                    </p>
                  </div>
                  <Input
                    label="Section title"
                    value={draft.productsTitle}
                    maxLength={60}
                    onChange={(event) => set('productsTitle', event.target.value)}
                    placeholder="Leave empty for no title"
                  />
                </div>
              ) : null}
            </fieldset>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * A sketch of each layout, so the three can be told apart without opening a
 * preview. Drawn with boxes rather than screenshots: it never goes stale.
 */
function Thumbnail({ variant }: { variant: StorePageVariant }) {
  const tile = 'bg-line rounded-[3px]';
  if (variant === 'spotlight') {
    return (
      <div aria-hidden className="bg-canvas space-y-1.5 rounded-md p-2 shadow-sm">
        <div className="flex h-14 items-center gap-2 rounded-md bg-neutral-800 px-2">
          <span className="size-7 rounded bg-white" />
          <span className="h-3.5 flex-1 rounded-sm bg-white/90" />
        </div>
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => <span key={i} className={cn(tile, 'h-3.5')} />)}
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[0, 1, 2, 3].map((i) => <span key={i} className={cn(tile, 'aspect-9/16')} />)}
        </div>
      </div>
    );
  }
  if (variant === 'studio') {
    return (
      <div aria-hidden className="bg-canvas space-y-1.5 rounded-md p-2 shadow-sm">
        <div className={cn(tile, 'h-5')} />
        <div className="-mt-3 flex items-end gap-2 px-1">
          <span className="size-9 rounded-full bg-[conic-gradient(#f59e0b,#ef4444,#d946ef,#8b5cf6,#f59e0b)] p-[2px]">
            <span className="bg-canvas block size-full rounded-full" />
          </span>
          <span className="flex flex-1 gap-1.5 pb-1">
            {[0, 1, 2].map((i) => <span key={i} className={cn(tile, 'h-2 flex-1')} />)}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-px">
          {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={cn(tile, 'aspect-9/16 rounded-none')} />)}
        </div>
      </div>
    );
  }
  return (
    <div aria-hidden className="bg-canvas space-y-1.5 rounded-md p-2 shadow-sm">
      <div className="h-8 rounded-md bg-gradient-to-br from-amber-100 to-sky-100" />
      <div className="-mt-4 ml-2 size-7 rounded-md border-2 border-white bg-neutral-300" />
      <div className={cn(tile, 'h-2 w-1/2')} />
      <div className={cn(tile, 'h-4')} />
      <div className="flex gap-1">
        <span className={cn(tile, 'h-12 w-1/4')} />
        <span className="grid flex-1 grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => <span key={i} className={tile} />)}
        </span>
      </div>
    </div>
  );
}
