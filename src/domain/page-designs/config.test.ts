import { describe, expect, it } from 'vitest';

import { designFor, PAGE_DESIGN_KEYS } from '.';
import { changedFromDefault, describeChange, effectiveConfig, fieldsOf, resolveVariant, withDesignDefaults } from './config';
import { productPageDesign } from './product';
import { designConfigSchema } from './schema';
import { storePageDesign } from './store';
import type { DesignConfig } from './types';

describe('every registered page design', () => {
  for (const page of PAGE_DESIGN_KEYS) {
    const definition = designFor(page);

    it(`${page}: defaults cover every field with a value of the right kind`, () => {
      for (const variant of definition.variants) {
        const defaults = definition.defaults[variant];
        for (const field of fieldsOf(definition)) {
          const value = defaults[field.key];
          if (field.kind === 'toggle') expect(typeof value, `${variant}.${field.key}`).toBe('boolean');
          if (field.kind === 'text') {
            expect(typeof value, `${variant}.${field.key}`).toBe('string');
            expect(String(value).length).toBeLessThanOrEqual(field.maxLength);
          }
          if (field.kind === 'choice') {
            expect(field.options.map((option) => option.value), `${variant}.${field.key}`).toContain(value);
          }
        }
      }
    });

    it(`${page}: field keys are unique`, () => {
      const keys = fieldsOf(definition).map((field) => field.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it(`${page}: the schema accepts the shipped design`, () => {
      const shipped = withDesignDefaults(definition, null);
      expect(designConfigSchema(definition).safeParse(shipped).success).toBe(true);
    });

    it(`${page}: every variant has meta and a preview path`, () => {
      for (const variant of definition.variants) {
        expect(definition.variantMeta[variant].name).toBeTruthy();
        expect(definition.preview.path('sample', variant)).toMatch(/^\//);
      }
    });
  }
});

describe('withDesignDefaults', () => {
  it('fills fields added after a design was saved', () => {
    const merged = withDesignDefaults(storePageDesign, {
      variant: 'studio',
      settings: { studio: { banner: false } },
    });
    expect(merged.variant).toBe('studio');
    expect(merged.settings.studio.banner).toBe(false);
    expect(merged.settings.studio.logo).toBe(storePageDesign.defaults.studio.logo);
    expect(merged.settings.classic).toEqual(storePageDesign.defaults.classic);
  });

  it('drops unknown keys and values of the wrong kind', () => {
    const merged = withDesignDefaults(storePageDesign, {
      variant: 'nonsense',
      settings: { classic: { banner: 'yes', productStyle: 'carousel', ghost: true } as never },
    });
    expect(merged.variant).toBe(storePageDesign.defaultVariant);
    expect(merged.settings.classic.banner).toBe(true);
    expect(merged.settings.classic.productStyle).toBe('grid');
    expect('ghost' in merged.settings.classic).toBe(false);
  });

  it('truncates text to the field limit', () => {
    const merged = withDesignDefaults(storePageDesign, {
      settings: { classic: { productsTitle: 'x'.repeat(500) } },
    });
    expect(String(merged.settings.classic.productsTitle)).toHaveLength(60);
  });
});

describe('effectiveConfig', () => {
  const published = withDesignDefaults(storePageDesign, null) as DesignConfig;
  const next: DesignConfig = { ...published, variant: 'spotlight' };
  const at = '2026-10-01T00:00:00.000Z';

  it('keeps the published design before the scheduled time', () => {
    expect(effectiveConfig(published, { at, byName: 'A', config: next }, Date.parse(at) - 1)).toBe(published);
  });

  it('switches to the scheduled design at the scheduled time', () => {
    expect(effectiveConfig(published, { at, byName: 'A', config: next }, Date.parse(at))).toBe(next);
  });

  it('is the published design when nothing is scheduled', () => {
    expect(effectiveConfig(published, null, Date.now())).toBe(published);
  });
});

describe('describing changes', () => {
  const base = withDesignDefaults(storePageDesign, null);

  it('names a layout switch and counts changed settings', () => {
    const after = {
      variant: 'spotlight' as const,
      settings: { ...base.settings, spotlight: { ...base.settings.spotlight, banner: false, logo: false } },
    };
    expect(describeChange(storePageDesign, base, after)).toBe('Layout Classic → Spotlight · 2 settings in Spotlight');
  });

  it('says so when nothing changed', () => {
    expect(describeChange(storePageDesign, base, base)).toBe('No changes');
  });

  it('lists fields that differ from the layout default', () => {
    const settings = { ...base.settings.classic, breadcrumbs: false };
    expect([...changedFromDefault(storePageDesign, 'classic', settings)]).toEqual(['breadcrumbs']);
  });
});

describe('category layouts and seller choice', () => {
  it('only pages that support them carry them', () => {
    expect(withDesignDefaults(productPageDesign, null).categoryOverrides).toEqual([]);
    expect(withDesignDefaults(productPageDesign, null).sellerChoice).toBeUndefined();
    expect(withDesignDefaults(storePageDesign, null).sellerChoice).toEqual([]);
    expect(withDesignDefaults(storePageDesign, null).categoryOverrides).toBeUndefined();
  });

  it('keeps one rule per category and drops unknown layouts', () => {
    const config = withDesignDefaults(productPageDesign, {
      categoryOverrides: [
        { category: 'kurtas', variant: 'social' },
        { category: 'kurtas', variant: 'lookbook' },
        { category: 'sarees', variant: 'gone' },
        { category: ' ', variant: 'social' },
      ],
    });
    expect(config.categoryOverrides).toEqual([{ category: 'kurtas', variant: 'social' }]);
  });

  it('lets the deepest matching category decide', () => {
    const config = withDesignDefaults(productPageDesign, {
      variant: 'classic',
      categoryOverrides: [
        { category: 'women', variant: 'social' },
        { category: 'kurtas', variant: 'lookbook' },
      ],
    });
    expect(resolveVariant(config, { categoryPath: ['women', 'ethnic-wear', 'kurtas'] })).toBe('lookbook');
    expect(resolveVariant(config, { categoryPath: ['women', 'western-wear', 'dresses'] })).toBe('social');
    expect(resolveVariant(config, { categoryPath: ['men', 'shirts'] })).toBe('classic');
  });

  it('honours a seller’s pick only while Marketing allows it', () => {
    const allowed = withDesignDefaults(storePageDesign, { variant: 'classic', sellerChoice: ['studio', 'nope'] });
    expect(allowed.sellerChoice).toEqual(['studio']);
    expect(resolveVariant(allowed, { sellerVariant: 'studio' })).toBe('studio');
    expect(resolveVariant(allowed, { sellerVariant: 'spotlight' })).toBe('classic');
    const withdrawn = withDesignDefaults(storePageDesign, { variant: 'classic', sellerChoice: [] });
    expect(resolveVariant(withdrawn, { sellerVariant: 'studio' })).toBe('classic');
  });

  it('describes changes to either', () => {
    const before = withDesignDefaults(storePageDesign, null);
    const after = withDesignDefaults(storePageDesign, { sellerChoice: ['classic', 'studio'] });
    expect(describeChange(storePageDesign, before, after)).toBe('Sellers may choose Classic, Studio');
  });

  it('the schema accepts both and rejects a bad layout', () => {
    const schema = designConfigSchema(designFor('product'));
    const shipped = withDesignDefaults(productPageDesign, null);
    expect(schema.safeParse({ ...shipped, categoryOverrides: [{ category: 'kurtas', variant: 'social' }] }).success).toBe(true);
    expect(schema.safeParse({ ...shipped, categoryOverrides: [{ category: 'kurtas', variant: 'nope' }] }).success).toBe(false);
  });
});
