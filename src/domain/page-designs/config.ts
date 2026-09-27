import type {
  CategoryOverride,
  DesignConfig,
  DesignSchedule,
  FieldDef,
  FieldGroup,
  PageDesignDefinition,
  Settings,
} from './types';

/**
 * Pure functions over page designs, shared by the admin screen, the server
 * and the storefront.
 */

export function fieldsOf(definition: { groups: FieldGroup[] }): FieldDef[] {
  return definition.groups.flatMap((group) => group.fields);
}

/**
 * Stored settings over the defaults, per layout and per field.
 *
 * Deep on purpose: a field added after a design was saved must arrive with its
 * default rather than as `undefined`, and a value whose TYPE no longer matches
 * the field (a toggle that became a choice) falls back rather than rendering
 * nonsense. Unknown keys are dropped, so a removed field cannot linger.
 */
export function withDesignDefaults<V extends string, S extends Settings>(
  definition: PageDesignDefinition<V, S>,
  stored:
    | Partial<{
        variant: string;
        settings: Partial<Record<string, Partial<Settings>>>;
        categoryOverrides: unknown;
        sellerChoice: unknown;
      }>
    | null
    | undefined,
): DesignConfig<V, S> {
  const variant = (definition.variants as readonly string[]).includes(stored?.variant ?? '')
    ? (stored!.variant as V)
    : definition.defaultVariant;

  const fields = fieldsOf(definition);

  const settings = Object.fromEntries(
    definition.variants.map((key) => {
      const base = definition.defaults[key];
      const saved = stored?.settings?.[key] ?? {};
      const merged: Settings = { ...base };
      for (const field of fields) {
        const value = saved[field.key];
        if (value === undefined) continue;
        if (field.kind === 'toggle' && typeof value === 'boolean') merged[field.key] = value;
        if (field.kind === 'text' && typeof value === 'string') merged[field.key] = value.slice(0, field.maxLength);
        if (
          field.kind === 'choice' &&
          typeof value === 'string' &&
          field.options.some((option) => option.value === value)
        ) {
          merged[field.key] = value;
        }
      }
      return [key, merged];
    }),
  ) as Record<V, S>;

  const config: DesignConfig<V, S> = { variant, settings };
  if (definition.categoryOverrides) config.categoryOverrides = normaliseOverrides(definition, stored?.categoryOverrides);
  if (definition.sellerChoice) config.sellerChoice = normaliseChoice(definition, stored?.sellerChoice);
  return config;
}

export const MAX_CATEGORY_OVERRIDES = 100;

/**
 * Valid layouts only, one entry per category (the first wins, as the
 * designer lists them), capped. A layout removed from the definition drops
 * its overrides rather than rendering a page that no longer exists.
 */
function normaliseOverrides<V extends string>(
  definition: PageDesignDefinition<V>,
  stored: unknown,
): CategoryOverride<V>[] {
  if (!Array.isArray(stored)) return [];
  const seen = new Set<string>();
  const out: CategoryOverride<V>[] = [];
  for (const entry of stored) {
    const category = typeof entry?.category === 'string' ? entry.category.trim() : '';
    const variant = entry?.variant;
    if (!category || seen.has(category) || !(definition.variants as readonly string[]).includes(variant)) continue;
    seen.add(category);
    out.push({ category, variant: variant as V });
    if (out.length === MAX_CATEGORY_OVERRIDES) break;
  }
  return out;
}

/** Valid layouts only, in the definition's order, each once. */
function normaliseChoice<V extends string>(definition: PageDesignDefinition<V>, stored: unknown): V[] {
  if (!Array.isArray(stored)) return [];
  return definition.variants.filter((variant) => stored.includes(variant));
}

/**
 * Which layout a page uses for one record.
 *
 *  - A product page walks the product's category path from the DEEPEST
 *    category up, so "Kurtas → Lookbook" beats "Women → Social" for a kurta.
 *  - A store page uses the seller's own pick, but only while Marketing
 *    still allows it; withdrawn, the store quietly returns to the default.
 *
 * Otherwise, the published layout.
 */
export function resolveVariant<V extends string>(
  config: DesignConfig<V>,
  context: { categoryPath?: readonly string[]; sellerVariant?: string | null } = {},
): V {
  if (config.categoryOverrides?.length && context.categoryPath?.length) {
    const byCategory = new Map(config.categoryOverrides.map((rule) => [rule.category, rule.variant]));
    for (const slug of [...context.categoryPath].reverse()) {
      const variant = byCategory.get(slug);
      if (variant) return variant;
    }
  }
  if (context.sellerVariant && config.sellerChoice?.includes(context.sellerVariant as V)) {
    return context.sellerVariant as V;
  }
  return config.variant;
}

/**
 * What shoppers should be seeing at `nowMs`.
 *
 * A scheduled publish is applied ON READ: once its time has passed it simply
 * is the live design, with no job that has to run for that to be true. The
 * admin screen later settles it into the record; the storefront never needs
 * to wait for that.
 */
export function effectiveConfig<V extends string>(
  published: DesignConfig<V>,
  scheduled: DesignSchedule<V> | null,
  nowMs: number,
): DesignConfig<V> {
  if (scheduled && Date.parse(scheduled.at) <= nowMs) return scheduled.config;
  return published;
}

/** Field keys whose value differs from the layout's own default. */
export function changedFromDefault<V extends string>(
  definition: PageDesignDefinition<V>,
  variant: V,
  settings: Settings,
): Set<string> {
  const defaults = definition.defaults[variant];
  return new Set(
    fieldsOf(definition)
      .filter((field) => settings[field.key] !== defaults[field.key])
      .map((field) => field.key),
  );
}

/**
 * A short, human account of what changed between two configs, for the
 * revision list: "Layout Classic → Spotlight · 3 switches in Spotlight".
 */
export function describeChange<V extends string>(
  definition: PageDesignDefinition<V>,
  before: DesignConfig<V>,
  after: DesignConfig<V>,
): string {
  const parts: string[] = [];
  if (before.variant !== after.variant) {
    parts.push(
      `Layout ${definition.variantMeta[before.variant].name} → ${definition.variantMeta[after.variant].name}`,
    );
  }
  for (const variant of definition.variants) {
    const a = before.settings[variant];
    const b = after.settings[variant];
    const count = fieldsOf(definition).filter((field) => a?.[field.key] !== b?.[field.key]).length;
    if (count > 0) {
      parts.push(`${count} ${count === 1 ? 'setting' : 'settings'} in ${definition.variantMeta[variant].name}`);
    }
  }
  if (JSON.stringify(before.categoryOverrides ?? []) !== JSON.stringify(after.categoryOverrides ?? [])) {
    const count = after.categoryOverrides?.length ?? 0;
    parts.push(count ? `Category layouts (${count})` : 'Category layouts removed');
  }
  if (JSON.stringify(before.sellerChoice ?? []) !== JSON.stringify(after.sellerChoice ?? [])) {
    const names = (after.sellerChoice ?? []).map((variant) => definition.variantMeta[variant].name);
    parts.push(names.length ? `Sellers may choose ${names.join(', ')}` : 'Sellers may not choose');
  }
  return parts.length > 0 ? parts.join(' · ') : 'No changes';
}

export function sameConfig(a: DesignConfig | null, b: DesignConfig | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
