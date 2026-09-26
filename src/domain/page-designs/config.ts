import type {
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
  stored: Partial<{ variant: string; settings: Partial<Record<string, Partial<Settings>>> }> | null | undefined,
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

  return { variant, settings };
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
  return parts.length > 0 ? parts.join(' · ') : 'No changes';
}

export function sameConfig(a: DesignConfig | null, b: DesignConfig | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
