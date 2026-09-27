/**
 * Page designs: the vocabulary.
 *
 * A page design is a DEFINITION -- plain data, shared by the browser and the
 * server -- from which everything else is derived: the admin screen's
 * switches, the server's validation, the defaults a clean database renders,
 * and the preview link. Adding a page to Marketing means writing one of these
 * and the renderers for its variants, never another editor.
 *
 * Every setting is a boolean, a short string, or one of a fixed set of
 * strings. That restriction is the point: it is what lets one screen edit any
 * page, and one schema builder validate it.
 */

export type SettingValue = boolean | string;
export type Settings = Record<string, SettingValue>;

export type FieldDef = (
  | { kind: 'toggle'; key: string; label: string; description?: string }
  | {
      kind: 'text';
      key: string;
      label: string;
      description?: string;
      maxLength: number;
      placeholder?: string;
    }
  | {
      kind: 'choice';
      key: string;
      label: string;
      description?: string;
      options: ReadonlyArray<{ value: string; label: string }>;
    }
) & {
  /**
   * The layouts this setting means something in. Omitted, it applies to all.
   * The designer shows it only while one of these is being edited; every
   * layout still carries a default, so switching layouts never meets a gap.
   */
  onlyFor?: readonly string[];
};

export interface FieldGroup {
  title: string;
  fields: FieldDef[];
}

/** What the admin knows each layout by, and the box sketch drawn for it. */
export interface VariantMeta {
  number: number;
  name: string;
  description: string;
  /** Key into the designer's sketch library. */
  sketch: string;
}

/** Which kind of real record a preview is shown with. */
export type PreviewEntity = 'seller' | 'product' | 'category' | 'brand' | 'query' | null;

export interface PageDesignDefinition<V extends string = string, S extends Settings = Settings> {
  page: string;
  /** "Store page" -- the admin screen's title. */
  title: string;
  description: string;
  /** Where the page lives, for people: "/store/…". */
  route: string;
  variants: readonly V[];
  variantMeta: Record<V, VariantMeta>;
  defaultVariant: V;
  groups: FieldGroup[];
  /** Per-variant defaults: each layout ships with the switches that suit it. */
  defaults: Record<V, S>;
  preview: {
    entity: PreviewEntity;
    /** Builds the staff-only preview path for one record in one layout. */
    path: (entity: string, variant: V) => string;
  };
  /**
   * Pages whose layout may differ by the category of what they show: the
   * product page can use Social for ethnic wear and Classic for the rest.
   */
  categoryOverrides?: boolean;
  /**
   * Pages a seller may choose the layout of, from the layouts Marketing
   * allows: the store page.
   */
  sellerChoice?: boolean;
}

/** Products in this category (or below it) use this layout. */
export interface CategoryOverride<V extends string = string> {
  /** Category slug. */
  category: string;
  variant: V;
}

/** What is live, or drafted: one layout chosen, and every layout's settings. */
export interface DesignConfig<V extends string = string, S extends Settings = Settings> {
  variant: V;
  settings: Record<V, S>;
  /** Only on pages with `categoryOverrides`. Deepest matching category wins. */
  categoryOverrides?: CategoryOverride<V>[];
  /** Only on pages with `sellerChoice`: the layouts a seller may pick. Empty, sellers cannot choose. */
  sellerChoice?: V[];
}

export interface DesignRevision<V extends string = string> {
  id: string;
  at: string;
  byUserId: string;
  byName: string;
  /** "Published", "Reverted to …", "Scheduled publish". */
  action: string;
  note: string | null;
  config: DesignConfig<V>;
}

export interface DesignSchedule<V extends string = string> {
  at: string;
  byName: string;
  config: DesignConfig<V>;
}

/** The whole record for one page, as the admin screen sees it. */
export interface PageDesignState<V extends string = string> {
  page: string;
  published: DesignConfig<V>;
  /** Null when there is nothing unpublished. */
  draft: DesignConfig<V> | null;
  scheduled: DesignSchedule<V> | null;
  revisions: DesignRevision<V>[];
  updatedAt: string | null;
}
