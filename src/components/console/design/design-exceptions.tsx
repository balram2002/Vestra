'use client';

import { Plus, Store, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MAX_CATEGORY_OVERRIDES } from '@/domain/page-designs/config';
import type { CategoryOverride, PageDesignDefinition } from '@/domain/page-designs/types';

/**
 * The exceptions to a page's one layout, edited in the same draft as
 * everything else and published with it.
 */

const selectClass = 'border-line bg-raised text-ink h-9 min-w-0 rounded-sm border px-2 text-sm';

/**
 * Products in a category, and every category inside it, use another layout.
 * The most specific category wins, which the list says rather than leaving
 * Marketing to discover it.
 */
export function CategoryLayouts({
  definition,
  value,
  categories,
  defaultVariant,
  onChange,
}: {
  definition: PageDesignDefinition;
  value: CategoryOverride[];
  categories: Array<{ value: string; label: string }>;
  defaultVariant: string;
  onChange: (next: CategoryOverride[]) => void;
}) {
  const used = new Set(value.map((rule) => rule.category));
  const label = new Map(categories.map((option) => [option.value, option.label]));
  const nextCategory = categories.find((option) => !used.has(option.value))?.value;
  const otherVariant = definition.variants.find((variant) => variant !== defaultVariant) ?? defaultVariant;

  return (
    <section className="border-line bg-raised rounded-lg border" aria-labelledby="category-layouts">
      <header className="border-line border-b px-4 py-3 sm:px-5">
        <h2 id="category-layouts" className="text-ink text-sm font-semibold">
          Layouts by category
        </h2>
        <p className="text-muted mt-0.5 text-xs">
          Products in these categories, and every category inside them, use another layout. The most specific category
          wins, so “Kurtas” beats “Women” for a kurta. Everything else uses Variant {definition.variantMeta[defaultVariant].number} ·{' '}
          {definition.variantMeta[defaultVariant].name}.
        </p>
      </header>
      <div className="space-y-2 p-4 sm:p-5">
        {value.length === 0 ? <p className="text-faint text-sm">No exceptions: every product uses the same layout.</p> : null}
        {value.map((rule, index) => (
          <div key={`${rule.category}-${index}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,11rem)_auto] items-center gap-2">
            <label className="sr-only" htmlFor={`override-category-${index}`}>
              Category
            </label>
            <select
              id={`override-category-${index}`}
              className={selectClass}
              value={rule.category}
              onChange={(event) => onChange(value.map((item, at) => (at === index ? { ...item, category: event.target.value } : item)))}
            >
              {/* A category since removed from the taxonomy still shows, so it can be deleted. */}
              {label.has(rule.category) ? null : <option value={rule.category}>{rule.category} (no longer exists)</option>}
              {categories.map((option) => (
                <option key={option.value} value={option.value} disabled={used.has(option.value) && option.value !== rule.category}>
                  {option.label}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor={`override-variant-${index}`}>
              Layout for {label.get(rule.category) ?? rule.category}
            </label>
            <select
              id={`override-variant-${index}`}
              className={selectClass}
              value={rule.variant}
              onChange={(event) => onChange(value.map((item, at) => (at === index ? { ...item, variant: event.target.value } : item)))}
            >
              {definition.variants.map((variant) => (
                <option key={variant} value={variant}>
                  Variant {definition.variantMeta[variant].number} · {definition.variantMeta[variant].name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove the layout for ${label.get(rule.category) ?? rule.category}`}
              onClick={() => onChange(value.filter((_, at) => at !== index))}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!nextCategory || value.length >= MAX_CATEGORY_OVERRIDES}
          onClick={() => nextCategory && onChange([...value, { category: nextCategory, variant: otherVariant }])}
        >
          <Plus className="size-4" aria-hidden />
          Add a category
        </Button>
      </div>
    </section>
  );
}

/**
 * The layouts a seller may pick for their own store. Each shows how many
 * stores use it now, because withdrawing one moves those stores back to the
 * default the moment it is published.
 */
export function SellerChoice({
  definition,
  value,
  defaultVariant,
  counts,
  onChange,
}: {
  definition: PageDesignDefinition;
  value: string[];
  defaultVariant: string;
  counts: Record<string, number>;
  onChange: (next: string[]) => void;
}) {
  return (
    <section className="border-line bg-raised rounded-lg border" aria-labelledby="seller-choice">
      <header className="border-line border-b px-4 py-3 sm:px-5">
        <h2 id="seller-choice" className="text-ink text-sm font-semibold">
          Sellers may choose
        </h2>
        <p className="text-muted mt-0.5 text-xs">
          Layouts a seller can pick for their own store under Store settings. A store that picks nothing, or picked one
          you withdraw, uses Variant {definition.variantMeta[defaultVariant].number} · {definition.variantMeta[defaultVariant].name}.
          Your settings for each layout apply either way.
        </p>
      </header>
      <fieldset className="divide-line divide-y px-4 sm:px-5">
        <legend className="sr-only">Layouts sellers may choose</legend>
        {definition.variants.map((variant) => {
          const meta = definition.variantMeta[variant];
          const inUse = counts[variant] ?? 0;
          const checked = value.includes(variant);
          return (
            <label key={variant} className="flex min-h-14 cursor-pointer items-center gap-3 py-2.5">
              <input
                type="checkbox"
                className="accent-[var(--color-accent)] size-4"
                checked={checked}
                onChange={() => onChange(checked ? value.filter((item) => item !== variant) : [...value, variant])}
              />
              <span className="min-w-0 flex-1">
                <span className="text-ink block text-sm font-medium">
                  Variant {meta.number} · {meta.name}
                </span>
                <span className="text-muted line-clamp-1 block text-xs">{meta.description}</span>
              </span>
              {inUse > 0 ? (
                <span className="text-muted inline-flex shrink-0 items-center gap-1 text-xs" title="Stores that have chosen this layout">
                  <Store className="size-3.5" aria-hidden />
                  {inUse} {inUse === 1 ? 'store' : 'stores'}
                  {!checked ? ' · will use the default' : ''}
                </span>
              ) : null}
            </label>
          );
        })}
      </fieldset>
    </section>
  );
}
