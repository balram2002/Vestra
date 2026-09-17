'use client';

import { ChevronDown, ChevronUp, Plus, Search, Trash2, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { FileUpload } from '@/components/ui/file-upload';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { HomeSection, HomeSectionConfig } from '@/domain/types';
import { cn } from '@/lib/cn';
import { searchSectionItems, type ItemOption } from '@/server/actions/sections';

/**
 * The fields of one section.
 *
 * WHAT YOU ARE ASKED DEPENDS ON WHAT THE SECTION IS. A rail asks where its
 * products come from and how many; an editorial block asks for a picture and a
 * paragraph; the promises band asks nothing at all, because its content is site
 * furniture edited under Appearance. Showing every field for every kind is how
 * a builder becomes a form nobody can fill in correctly.
 *
 * It holds no state of its own. The page that hosts it owns the draft, because
 * the draft is also what the live preview beside it renders -- two copies of
 * the same edit is how a preview ends up showing something the form does not.
 *
 * HAND-PICKING IS A LIST, NOT A MULTI-SELECT. The order of the list IS the
 * order on the page, so it is arranged with arrows, and the same component does
 * products, categories, brands, stores and tiles: from the editor's side they
 * are the same job -- find a thing, put it in its place.
 */

export type DraftUpdate = (update: (current: HomeSection) => HomeSection) => void;

/** A link worth previewing: an upload, a complete https address, or a site path. */
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

/** Kinds whose only setting of their own is how many things they show. */
const COUNT_ONLY: Array<HomeSection['kind']> = [
  'CATEGORY_STRIP',
  'BRAND_STRIP',
  'SELLER_SPOTLIGHT',
  'REELS_STRIP',
  'TESTIMONIALS',
];

export function SectionForm({ draft, update, displayedCategories = [] }: { draft: HomeSection; update: DraftUpdate; displayedCategories?: ItemOption[] }) {
  const config = draft.config ?? {};
  const kind = draft.kind;

  const setConfig = (patch: Partial<HomeSectionConfig>) =>
    update((current) => ({ ...current, config: { ...current.config, ...patch } }));

  const set = <K extends keyof HomeSection>(key: K, value: HomeSection[K]) =>
    update((current) => ({ ...current, [key]: value }));

  const picks = pickerFor(kind, config);
  const hasWords = kind !== 'VALUE_PROPS' && kind !== 'HERO_CAROUSEL';
  const countOnly = COUNT_ONLY.includes(kind);

  return (
    <div className="space-y-4">
      <FormCard title="Layout by screen" description="Change the composition without changing this section's content. Layout 1 is the current design.">
        <div className="grid gap-3 sm:grid-cols-2">
          {(['layoutDesktop', 'layoutMobile'] as const).map((field) => (
            <Select key={field} label={field === 'layoutDesktop' ? 'Desktop layout' : 'Mobile layout'} value={config[field] ?? 'DEFAULT'} onChange={(event) => setConfig({ [field]: event.target.value } as Partial<HomeSectionConfig>)}>
              <option value="DEFAULT">Layout 1 · Default</option>
              <option value="FEATURED">Layout 2 · Featured</option>
              <option value="MOSAIC">Layout 3 · Mosaic</option>
            </Select>
          ))}
        </div>
      </FormCard>
      {kind === 'VALUE_PROPS' ? (
        <Note>
          The promises themselves are site-wide copy, edited under{' '}
          <Link href="/admin/appearance" className="text-accent-ink font-medium underline">
            Appearance
          </Link>
          . This section only decides where they sit on the page.
        </Note>
      ) : null}

      {kind === 'HERO_CAROUSEL' ? (
        <Note>
          The slides themselves are managed on the{' '}
          <Link href="/admin/cms" className="text-accent-ink font-medium underline">
            Homepage
          </Link>{' '}
          screen, under Hero slides. Here you decide when and where the carousel shows.
        </Note>
      ) : null}

      {hasWords ? (
        <FormCard title="Words" description="What the section says above its contents.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Heading"
              value={draft.title ?? ''}
              onChange={(event) => set('title', event.target.value || null)}
              maxLength={80}
              placeholder="New in"
              hint="Left blank, the section runs without a heading."
            />
            <Input
              label="Sub-heading"
              value={draft.subtitle ?? ''}
              onChange={(event) => set('subtitle', event.target.value || null)}
              maxLength={200}
              placeholder="Fresh from our newest stores"
            />
          </div>
        </FormCard>
      ) : null}

      {kind === 'EDITORIAL' ? (
        <FormCard title="Picture and layout" description="Leave the picture empty for a band of type.">
          <Textarea
            label="Body"
            rows={4}
            value={config.body ?? ''}
            onChange={(event) => setConfig({ body: event.target.value })}
            maxLength={2000}
            placeholder="Two or three sentences."
          />

          {previewable(config.imageUrl ?? '') ? (
            <div className="bg-sunken relative aspect-[21/9] overflow-hidden rounded-md">
              <Image
                src={config.imageUrl!}
                alt=""
                fill
                sizes="(max-width: 64rem) 90vw, 36rem"
                className="object-cover"
              />
            </div>
          ) : null}

          {/* The same uploader the banners use, so a picture reaches a section
              the way it reaches everything else in the console. */}
          <FileUpload
            purpose="listing"
            multiple={false}
            label={config.imageUrl ? 'Replace it: drag one here, or browse' : 'Drag a picture here, or browse'}
            hint="Wide pictures work best: at least 1600 pixels across."
            onUploaded={(file) => setConfig({ imageUrl: file.url })}
          />

          <Input
            label="Or a link to the picture"
            value={config.imageUrl ?? ''}
            onChange={(event) => setConfig({ imageUrl: event.target.value })}
            maxLength={600}
            placeholder="https://… or /hero/name.jpg"
          />

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
        </FormCard>
      ) : null}

      {kind === 'PRODUCT_RAIL' || kind === 'DEAL_COUNTDOWN' ? (
        <FormCard
          title="Products"
          description="Where the products come from, how many, and how they are laid out."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              label="Products"
              value={config.source ?? (kind === 'DEAL_COUNTDOWN' ? 'DEALS' : 'BESTSELLERS')}
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
            <CountInput value={config.limit ?? 12} onChange={(limit) => setConfig({ limit })} />
          </div>
        </FormCard>
      ) : null}

      {countOnly ? (
        <FormCard title="How many" description="Anything you hand-pick below ignores this.">
          <div className="max-w-40">
            <CountInput
              value={config.limit ?? (kind === 'SELLER_SPOTLIGHT' ? 4 : 12)}
              onChange={(limit) => setConfig({ limit })}
            />
          </div>
        </FormCard>
      ) : null}

      {picks ? (
        <FormCard title={picks.label} description={picks.help}>
          {kind === 'CATEGORY_STRIP' ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-muted">{config.categoryMode === 'MANUAL' || (config.categoryIds?.length && config.categoryMode !== 'AUTO') ? 'Showing your selected categories' : 'Showing the current automatic categories below'}</span>
              <button type="button" className="text-accent-ink underline" onClick={() => setConfig({ categoryMode: 'AUTO', categoryIds: [] })}>Use automatic selection</button>
            </div>
          ) : null}
          <ItemPicker
            kind={picks.kind}
            label={picks.label}
            ids={kind === 'CATEGORY_STRIP' && config.categoryMode !== 'MANUAL' && !(config.categoryIds?.length && config.categoryMode !== 'AUTO') ? displayedCategories.map((item) => item.id) : picks.ids}
            initialItems={kind === 'CATEGORY_STRIP' ? displayedCategories : []}
            onChange={(ids) => setConfig({ [picks.field]: ids, ...(kind === 'CATEGORY_STRIP' ? { categoryMode: 'MANUAL' } : {}) } as Partial<HomeSectionConfig>)}
          />
        </FormCard>
      ) : null}

      {hasWords ? (
        <FormCard title="Button" description="Optional. Where a shopper goes to see everything.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Button label"
              value={draft.ctaLabel ?? ''}
              onChange={(event) => set('ctaLabel', event.target.value || null)}
              maxLength={40}
              placeholder="See all"
            />
            <Input
              label="Button link"
              value={draft.href ?? ''}
              onChange={(event) => set('href', event.target.value || null)}
              maxLength={300}
              placeholder="/category/women"
            />
          </div>
        </FormCard>
      ) : null}

      <FormCard
        title="When and where"
        description={
          kind === 'DEAL_COUNTDOWN'
            ? 'The end date is what the countdown counts down to. Without one there is no timer.'
            : 'Limit the section to one kind of screen, or to a window of dates.'
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="Show on"
            value={draft.visibleOn}
            onChange={(event) => set('visibleOn', event.target.value as HomeSection['visibleOn'])}
          >
            <option value="ALL">Every screen</option>
            <option value="DESKTOP">Desktop only</option>
            <option value="MOBILE">Phone only</option>
          </Select>
          <Input
            label="Starts"
            type="date"
            value={dateValue(draft.startsAt)}
            onChange={(event) => set('startsAt', dayStart(event.target.value))}
            hint="Optional"
          />
          <Input
            label="Ends"
            type="date"
            value={dateValue(draft.endsAt)}
            onChange={(event) => set('endsAt', dayEnd(event.target.value))}
            hint={kind === 'DEAL_COUNTDOWN' ? 'Drives the countdown' : 'Optional'}
          />
        </div>
      </FormCard>
    </div>
  );
}

/* ---------------------------------------------------------------- pieces */

function FormCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-line bg-raised rounded-lg border p-4">
      <header className="mb-3">
        <h3 className="text-ink text-sm font-semibold">{title}</h3>
        {description ? <p className="text-muted mt-0.5 text-xs">{description}</p> : null}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-line bg-sunken text-muted rounded-lg border border-dashed p-3 text-xs">
      {children}
    </p>
  );
}

function CountInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <Input
      label="How many"
      inputMode="numeric"
      value={String(value)}
      onChange={(event) => {
        const next = Number(event.target.value.replace(/[^0-9]/g, ''));
        onChange(Math.min(48, Math.max(1, next || 1)));
      }}
    />
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
    case 'DEAL_COUNTDOWN':
      // Only when the rail is hand-picked; otherwise a rule decides.
      return config.source === 'MANUAL'
        ? {
            kind: 'product',
            field: 'productIds',
            ids: config.productIds ?? [],
            label: 'Products in this rail',
            help: 'They appear on the page in this order.',
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
        help: 'Leave empty to show stores that have stock.',
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
  ids,
  initialItems = [],
  onChange,
}: {
  kind: PickerKind;
  label: string;
  ids: string[];
  initialItems?: ItemOption[];
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
  const chosen = ids.map((id) => known[id] ?? initialItems.find((item) => item.id === id) ?? { id, label: '…' });

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

  const noun = kind === 'seller' ? 'stores' : kind === 'category' ? 'categories' : `${kind}s`;

  return (
    <div>
      {chosen.length > 0 ? (
        <ol className="mb-3 space-y-1.5" aria-label={label}>
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
                  label="Take out"
                  onClick={() => onChange(ids.filter((id) => id !== item.id))}
                >
                  <Trash2 className="text-danger-600 size-3.5" aria-hidden />
                </PickerButton>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-faint mb-2 text-2xs">Nothing hand-picked: the section chooses for itself.</p>
      )}

      <div className="relative">
        <Input
          label={`Search ${noun}`}
          hideLabel
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${noun}…`}
          leading={<Search className="size-4" aria-hidden />}
        />

        {searching ? (
          <div className="border-line bg-raised absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-md border shadow-lg">
            {loading ? (
              <div className="space-y-2 p-2" aria-label="Searching">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex items-center gap-2">
                    <div className="skeleton size-7 rounded" />
                    <div className="skeleton h-3 flex-1 rounded" />
                  </div>
                ))}
              </div>
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
    </div>
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
  REELS_STRIP: 'Reels',
  TESTIMONIALS: 'Reviews',
  NEWSLETTER: 'Newsletter',
};

export const DESCRIPTIONS: Partial<Record<HomeSection['kind'], string>> = {
  HERO_CAROUSEL: 'The full-width slides at the top of the page.',
  CATEGORY_STRIP: 'A row of categories to browse from.',
  PRODUCT_RAIL: 'Products, by a rule or hand-picked, as a row or a grid.',
  BANNER_GRID: 'Editorial tiles that link anywhere.',
  BRAND_STRIP: 'The brands you want to push.',
  SELLER_SPOTLIGHT: 'Stores, with their ratings and dispatch record.',
  EDITORIAL: 'A headline, a paragraph, a picture and a button.',
  VALUE_PROPS: 'The delivery, returns and trust promises.',
  DEAL_COUNTDOWN: 'Discounted products, with a live countdown to the end date.',
  REELS_STRIP: "Sellers' vertical clips, opening the reel feed.",
  TESTIMONIALS: 'Real reviews from delivered orders, each linking to its product.',
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
