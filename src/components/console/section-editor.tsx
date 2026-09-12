'use client';

import { ChevronDown, ChevronUp, Plus, Search, Trash2, X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { FileUpload } from '@/components/ui/file-upload';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { HomeSection, HomeSectionConfig } from '@/domain/types';
import { cn } from '@/lib/cn';
import { searchSectionItems, updateSection, type ItemOption } from '@/server/actions/sections';

/**
 * Editing one section.
 *
 * WHAT YOU ARE ASKED DEPENDS ON WHAT THE SECTION IS. A rail asks where its
 * products come from and how many; an editorial block asks for a picture and a
 * paragraph; the promises band asks nothing at all, because its content is site
 * furniture edited under Appearance. Showing every field for every kind is how
 * a builder becomes a form nobody can fill in correctly.
 *
 * HAND-PICKING IS A LIST, NOT A MULTI-SELECT. The order of the list IS the
 * order on the page, so it is arranged with the same arrows that order the
 * sections themselves -- and the same component does products, categories,
 * brands, stores and banners, because from the editor's side they are the same
 * job: find a thing, put it in place.
 */

/** A link worth previewing: an upload, or a complete https address. */
const previewable = (url: string) =>
  /^(https:\/\/[^\s/]+\.[^\s/]+\/\S*|\/api\/media\/\S+|\/[\w./-]+\.(?:jpg|jpeg|png|webp|avif))$/.test(url);

const SOURCES: Array<{ value: NonNullable<HomeSectionConfig['source']>; label: string }> = [
  { value: 'NEW_ARRIVALS', label: 'Newest first' },
  { value: 'BESTSELLERS', label: 'Bestsellers' },
  { value: 'TRENDING', label: 'Trending' },
  { value: 'DEALS', label: 'Biggest discounts' },
  { value: 'MANUAL', label: 'Hand-picked' },
];

const LAYOUTS: Array<{ value: NonNullable<HomeSectionConfig['layout']>; label: string }> = [
  { value: 'CAROUSEL', label: 'Row that scrolls' },
  { value: 'GRID_2', label: 'Grid of 2' },
  { value: 'GRID_3', label: 'Grid of 3' },
  { value: 'GRID_4', label: 'Grid of 4' },
];

const EDITORIAL_LAYOUTS: Array<{ value: NonNullable<HomeSectionConfig['layout']>; label: string }> =
  [
    { value: 'SPLIT', label: 'Picture beside the words' },
    { value: 'BANNER', label: 'Words over the picture' },
  ];

export function SectionEditor({
  section,
  open,
  onOpenChange,
  onSaved,
}: {
  section: HomeSection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  /*
   * The draft starts from the section and stays local.
   *
   * The caller mounts this with a `key` of the section id, so opening a
   * different section gives a fresh component with a fresh draft -- which is
   * React's own answer to "reset state when the subject changes", and avoids
   * an effect that writes state on every render pass.
   */
  const [draft, setDraft] = useState(section);
  const [pending, startTransition] = useTransition();

  const config = draft.config ?? {};
  const setConfig = (patch: Partial<HomeSectionConfig>) =>
    setDraft((current) => ({ ...current, config: { ...current.config, ...patch } }));

  const save = () => {
    startTransition(async () => {
      const result = await updateSection({
        sectionId: section.id,
        patch: {
          title: draft.title,
          subtitle: draft.subtitle,
          href: draft.href,
          ctaLabel: draft.ctaLabel,
          visibleOn: draft.visibleOn,
          startsAt: draft.startsAt,
          endsAt: draft.endsAt,
          config: draft.config,
        },
      });

      if (!result.ok) {
        toast.error(result.error ?? 'That did not save.');
        return;
      }
      toast.success('Section saved');
      onOpenChange(false);
      onSaved();
    });
  };

  const kind = draft.kind;
  const picks = pickerFor(kind, config);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={LABELS[kind] ?? 'Section'}
        description={DESCRIPTIONS[kind] ?? 'How this section looks and what it shows.'}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" size="sm" onClick={save} disabled={pending}>
              {pending ? 'Saving…' : 'Save section'}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          {kind === 'VALUE_PROPS' ? (
            <p className="border-line text-muted rounded-md border border-dashed p-3 text-xs">
              The promises themselves are site-wide copy, edited under{' '}
              <span className="text-ink font-medium">Appearance</span>. This section only decides
              where they appear on the page.
            </p>
          ) : null}

          {kind === 'HERO_CAROUSEL' ? (
            <p className="border-line text-muted rounded-md border border-dashed p-3 text-xs">
              The slides are managed below this list, under{' '}
              <span className="text-ink font-medium">Hero slides</span>.
            </p>
          ) : null}

          {/* ------------------------------------------------------- words */}
          {kind !== 'VALUE_PROPS' && kind !== 'HERO_CAROUSEL' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Heading"
                value={draft.title ?? ''}
                onChange={(event) => setDraft({ ...draft, title: event.target.value || null })}
                maxLength={80}
                placeholder="New in"
                hint="Left blank, the section runs without a heading."
              />
              <Input
                label="Sub-heading"
                value={draft.subtitle ?? ''}
                onChange={(event) => setDraft({ ...draft, subtitle: event.target.value || null })}
                maxLength={200}
                placeholder="Fresh from our newest stores"
              />
            </div>
          ) : null}

          {kind === 'EDITORIAL' ? (
            <>
              <Textarea
                label="Body"
                rows={3}
                value={config.body ?? ''}
                onChange={(event) => setConfig({ body: event.target.value })}
                maxLength={2000}
                placeholder="Two or three sentences."
              />
              <fieldset className="border-line space-y-3 rounded-md border p-3">
                <legend className="text-ink px-1 text-xs font-medium">Picture</legend>

                {previewable(config.imageUrl ?? '') ? (
                  <div className="bg-sunken relative aspect-[21/9] overflow-hidden rounded-md">
                    <Image
                      src={config.imageUrl!}
                      alt=""
                      fill
                      sizes="(max-width: 40rem) 90vw, 36rem"
                      className="object-cover"
                    />
                  </div>
                ) : null}

                {/* The same uploader the banners use, so a picture reaches a
                    section the way it reaches everything else in the console. */}
                <FileUpload
                  purpose="listing"
                  multiple={false}
                  label={config.imageUrl ? 'Replace it: drag one here, or browse' : 'Drag a picture here, or browse'}
                  hint="Leave it empty for a band of type with no picture."
                  onUploaded={(file) => setConfig({ imageUrl: file.url })}
                />

                <Input
                  label="Or a link to the picture"
                  value={config.imageUrl ?? ''}
                  onChange={(event) => setConfig({ imageUrl: event.target.value })}
                  maxLength={600}
                  placeholder="https://… or /hero/name.jpg"
                />
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Arrangement"
                  value={config.layout ?? 'SPLIT'}
                  onChange={(event) =>
                    setConfig({ layout: event.target.value as HomeSectionConfig['layout'] })
                  }
                >
                  {EDITORIAL_LAYOUTS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Ground"
                  value={config.theme ?? 'light'}
                  onChange={(event) =>
                    setConfig({ theme: event.target.value as HomeSectionConfig['theme'] })
                  }
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="accent">Accent</option>
                </Select>
              </div>
            </>
          ) : null}

          {/* ----------------------------------------------------- contents */}
          {kind === 'PRODUCT_RAIL' ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label="Products"
                value={config.source ?? 'BESTSELLERS'}
                onChange={(event) =>
                  setConfig({ source: event.target.value as HomeSectionConfig['source'] })
                }
              >
                {SOURCES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Select
                label="Arrangement"
                value={config.layout ?? 'CAROUSEL'}
                onChange={(event) =>
                  setConfig({ layout: event.target.value as HomeSectionConfig['layout'] })
                }
              >
                {LAYOUTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Input
                label="How many"
                inputMode="numeric"
                value={String(config.limit ?? 12)}
                onChange={(event) =>
                  setConfig({ limit: Number(event.target.value.replace(/[^0-9]/g, '')) || 1 })
                }
              />
            </div>
          ) : null}

          {(kind === 'CATEGORY_STRIP' || kind === 'BRAND_STRIP' || kind === 'SELLER_SPOTLIGHT') ? (
            <Input
              label="How many"
              inputMode="numeric"
              className="max-w-32"
              value={String(config.limit ?? 12)}
              onChange={(event) =>
                setConfig({ limit: Number(event.target.value.replace(/[^0-9]/g, '')) || 1 })
              }
              hint="Ignored for anything you hand-pick below."
            />
          ) : null}

          {picks ? (
            <ItemPicker
              kind={picks.kind}
              label={picks.label}
              help={picks.help}
              ids={picks.ids}
              onChange={(ids) => setConfig({ [picks.field]: ids } as Partial<HomeSectionConfig>)}
            />
          ) : null}

          {/* -------------------------------------------------------- link */}
          {kind !== 'VALUE_PROPS' && kind !== 'HERO_CAROUSEL' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Button label"
                value={draft.ctaLabel ?? ''}
                onChange={(event) => setDraft({ ...draft, ctaLabel: event.target.value || null })}
                maxLength={40}
                placeholder="See all"
              />
              <Input
                label="Button link"
                value={draft.href ?? ''}
                onChange={(event) => setDraft({ ...draft, href: event.target.value || null })}
                maxLength={300}
                placeholder="/category/women"
              />
            </div>
          ) : null}

          {/* ---------------------------------------------------- when/where */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              label="Show on"
              value={draft.visibleOn}
              onChange={(event) =>
                setDraft({ ...draft, visibleOn: event.target.value as HomeSection['visibleOn'] })
              }
            >
              <option value="ALL">Every screen</option>
              <option value="DESKTOP">Desktop only</option>
              <option value="MOBILE">Phone only</option>
            </Select>
            <Input
              label="Starts"
              type="date"
              value={dateValue(draft.startsAt)}
              onChange={(event) =>
                setDraft({ ...draft, startsAt: dayStart(event.target.value) })
              }
              hint="Optional"
            />
            <Input
              label="Ends"
              type="date"
              value={dateValue(draft.endsAt)}
              onChange={(event) => setDraft({ ...draft, endsAt: dayEnd(event.target.value) })}
              hint="Optional"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- picker */

type PickerKind = 'product' | 'category' | 'brand' | 'seller' | 'banner';

function pickerFor(
  kind: HomeSection['kind'],
  config: HomeSectionConfig,
): { kind: PickerKind; field: keyof HomeSectionConfig; ids: string[]; label: string; help: string } | null {
  switch (kind) {
    case 'PRODUCT_RAIL':
      // Only when the rail is hand-picked; otherwise a rule decides.
      return config.source === 'MANUAL'
        ? {
            kind: 'product',
            field: 'productIds',
            ids: config.productIds ?? [],
            label: 'Products in this rail',
            help: 'They appear in this order.',
          }
        : null;
    case 'CATEGORY_STRIP':
      return {
        kind: 'category',
        field: 'categoryIds',
        ids: config.categoryIds ?? [],
        label: 'Categories',
        help: 'Leave empty to show the shelves automatically.',
      };
    case 'BRAND_STRIP':
      return {
        kind: 'brand',
        field: 'brandIds',
        ids: config.brandIds ?? [],
        label: 'Brands',
        help: 'Leave empty to show the biggest brands.',
      };
    case 'SELLER_SPOTLIGHT':
      return {
        kind: 'seller',
        field: 'sellerIds',
        ids: config.sellerIds ?? [],
        label: 'Stores',
        help: 'Leave empty to show stores with stock.',
      };
    case 'BANNER_GRID':
      return {
        kind: 'banner',
        field: 'bannerIds',
        ids: config.bannerIds ?? [],
        label: 'Tiles',
        help: 'Leave empty to show every live tile.',
      };
    default:
      return null;
  }
}

function ItemPicker({
  kind,
  label,
  help,
  ids,
  onChange,
}: {
  kind: PickerKind;
  label: string;
  help: string;
  ids: string[];
  onChange: (ids: string[]) => void;
}) {
  /*
   * Names for what is already picked, and results for what is being searched.
   *
   * Both are written ONLY from an async callback. Setting state in the body of
   * an effect -- to clear a list, or to raise a loading flag -- schedules a
   * second render of everything below it on every pass, so the empty case and
   * the loading flag are DERIVED instead.
   */
  const [known, setKnown] = useState<Record<string, ItemOption>>({});
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ query: string; items: ItemOption[] } | null>(null);

  // A stable dependency: `ids` is a fresh array on every render of the parent,
  // so depending on it directly would refetch forever.
  const idsKey = ids.join(',');

  useEffect(() => {
    const wanted = idsKey ? idsKey.split(',') : [];
    if (wanted.length === 0) return;

    let cancelled = false;
    void searchSectionItems({ kind, ids: wanted }).then((result) => {
      if (cancelled) return;
      setKnown((current) => {
        const next = { ...current };
        for (const item of result.items) next[item.id] = item;
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [idsKey, kind]);

  // Search after a pause: a request per keystroke is a request per keystroke
  // the database has to answer.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;

    const timer = window.setTimeout(async () => {
      const result = await searchSectionItems({ kind, query: term });
      setFound({ query: term, items: result.items });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query, kind]);

  const searching = query.trim().length >= 2;
  const loading = searching && found?.query !== query.trim();
  const results = searching && found?.query === query.trim() ? found.items : [];
  const chosen = ids.map((id) => known[id] ?? { id, label: '…' });

  const add = (item: ItemOption) => {
    if (ids.includes(item.id)) return;
    setKnown((current) => ({ ...current, [item.id]: item }));
    onChange([...ids, item.id]);
    setQuery('');
  };

  const shift = (from: number, to: number) => {
    if (to < 0 || to >= ids.length) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <fieldset className="border-line rounded-md border p-3">
      <legend className="text-ink px-1 text-xs font-medium">{label}</legend>
      <p className="text-muted -mt-1 mb-2 text-2xs">{help}</p>

      {chosen.length > 0 ? (
        <ol className="mb-3 space-y-1.5">
          {chosen.map((item, index) => (
            <li
              key={item.id}
              className="border-line bg-canvas flex items-center gap-2 rounded-md border px-2 py-1.5"
            >
              <span className="text-faint tabular w-4 shrink-0 text-2xs">{index + 1}</span>
              <Thumb url={item.imageUrl} />
              <span className="text-ink min-w-0 flex-1 truncate text-xs">{item.label}</span>
              <div className="flex shrink-0 items-center">
                <PickerButton
                  label="Move up"
                  disabled={index === 0}
                  onClick={() => shift(index, index - 1)}
                >
                  <ChevronUp className="size-3.5" aria-hidden />
                </PickerButton>
                <PickerButton
                  label="Move down"
                  disabled={index === chosen.length - 1}
                  onClick={() => shift(index, index + 1)}
                >
                  <ChevronDown className="size-3.5" aria-hidden />
                </PickerButton>
                <PickerButton
                  label="Remove"
                  onClick={() => onChange(ids.filter((id) => id !== item.id))}
                >
                  <Trash2 className="text-danger-600 size-3.5" aria-hidden />
                </PickerButton>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="relative">
        <Input
          label={`Search ${kind}s`}
          hideLabel
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${kind === 'seller' ? 'stores' : `${kind}s`}…`}
          leading={<Search className="size-4" aria-hidden />}
        />

        {searching ? (
          <div className="border-line bg-raised absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-md border shadow-lg">
            {loading ? (
              <p className="text-faint px-3 py-2 text-2xs">Searching…</p>
            ) : results.length === 0 ? (
              <p className="text-faint px-3 py-2 text-2xs">Nothing matches.</p>
            ) : (
              <ul>
                {results.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => add(item)}
                      disabled={ids.includes(item.id)}
                      className={cn(
                        'flex w-full items-center gap-2 px-2 py-1.5 text-left',
                        'hover:bg-sunken disabled:opacity-40',
                      )}
                    >
                      <Thumb url={item.imageUrl} />
                      <span className="min-w-0 flex-1">
                        <span className="text-ink block truncate text-xs">{item.label}</span>
                        {item.hint ? (
                          <span className="text-faint block truncate text-2xs">{item.hint}</span>
                        ) : null}
                      </span>
                      {ids.includes(item.id) ? (
                        <X className="text-faint size-3.5" aria-hidden />
                      ) : (
                        <Plus className="text-faint size-3.5" aria-hidden />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}

function Thumb({ url }: { url?: string | null }) {
  if (!url) return <span className="bg-sunken size-7 shrink-0 rounded" aria-hidden />;
  return (
    <span className="bg-sunken relative size-7 shrink-0 overflow-hidden rounded">
      <Image src={url} alt="" fill sizes="28px" className="object-cover" />
    </span>
  );
}

function PickerButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="text-muted hover:bg-sunken grid size-7 place-items-center rounded disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/* --------------------------------------------------------------- labels */

export const LABELS: Partial<Record<HomeSection['kind'], string>> = {
  HERO_CAROUSEL: 'Hero carousel',
  CATEGORY_STRIP: 'Category strip',
  PRODUCT_RAIL: 'Product rail',
  BANNER_GRID: 'Tile grid',
  BRAND_STRIP: 'Brand strip',
  SELLER_SPOTLIGHT: 'Store spotlight',
  EDITORIAL: 'Feature or call to action',
  VALUE_PROPS: 'Promises',
  DEAL_COUNTDOWN: 'Deal countdown',
  TESTIMONIALS: 'Testimonials',
  NEWSLETTER: 'Newsletter',
};

export const DESCRIPTIONS: Partial<Record<HomeSection['kind'], string>> = {
  HERO_CAROUSEL: 'The full-width slides at the top of the page.',
  CATEGORY_STRIP: 'A row of categories to browse from.',
  PRODUCT_RAIL: 'Products, by a rule or hand-picked, as a row or a grid.',
  BANNER_GRID: 'Editorial tiles that link anywhere.',
  BRAND_STRIP: 'Logos of the brands you want to push.',
  SELLER_SPOTLIGHT: 'Stores, with their ratings and dispatch record.',
  EDITORIAL: 'A headline, a paragraph, a picture and a button.',
  VALUE_PROPS: 'The delivery, returns and trust promises.',
};

/* ---------------------------------------------------------------- dates */

function dateValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

/** A local day, not a UTC one: midnight UTC is 5:30am in India. */
function dayStart(value: string): string | null {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null;
}

function dayEnd(value: string): string | null {
  return value ? new Date(`${value}T23:59:59`).toISOString() : null;
}
