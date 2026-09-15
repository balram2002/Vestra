import { describe, expect, it } from 'vitest';

import { planHomeReset, type ShippedSection } from './section-reset';
import type { HomeSection } from './types';

function row(partial: Partial<HomeSection> & Pick<HomeSection, 'id' | 'kind'>): HomeSection {
  return {
    title: null,
    subtitle: null,
    href: null,
    ctaLabel: null,
    position: 0,
    isActive: true,
    startsAt: null,
    endsAt: null,
    visibleOn: 'ALL',
    config: {},
    updatedAt: '2026-09-01T00:00:00.000Z',
    updatedByUserId: null,
    ...partial,
  };
}

const SHIPPED: Array<[HomeSection['kind'], string | null]> = [
  ['HERO_CAROUSEL', null],
  ['CATEGORY_STRIP', 'Shop by category'],
  ['PRODUCT_RAIL', 'New this week'],
  ['BANNER_GRID', null],
  ['PRODUCT_RAIL', 'Bestsellers'],
  ['BRAND_STRIP', 'Labels we stock'],
  ['PRODUCT_RAIL', 'Under ₹1,499'],
  ['SELLER_SPOTLIGHT', 'Meet the makers'],
  ['VALUE_PROPS', null],
];

const keyFor = (kind: HomeSection['kind'], position: number) => `home:${kind}:${position}`;

const defaults: ShippedSection[] = SHIPPED.map(([kind, title], position) => ({
  ...row({ id: `shipped-${position}`, kind, title, position }),
  defaultKey: keyFor(kind, position),
}));

describe('planHomeReset', () => {
  it('puts back a hidden, stamped hero and hides what was added (the state that broke)', () => {
    // Exactly the homepage found in the demo database.
    const current: HomeSection[] = [
      ...SHIPPED.slice(1).map(([kind, title], index) =>
        row({
          id: `hsc-${index + 1}`,
          kind,
          title,
          position: index + 1,
          defaultKey: keyFor(kind, index + 1),
        }),
      ),
      row({ id: 'sec_demo_deal', kind: 'DEAL_COUNTDOWN', title: 'Ends soon', position: 10 }),
      row({
        id: 'hsc-hero',
        kind: 'HERO_CAROUSEL',
        position: 11,
        isActive: false,
        defaultKey: keyFor('HERO_CAROUSEL', 0),
      }),
      row({ id: 'sec_demo_reels', kind: 'REELS_STRIP', title: 'Watch and shop', position: 11 }),
      row({ id: 'sec_demo_reviews', kind: 'TESTIMONIALS', title: 'What shoppers say', position: 12 }),
    ];

    const plan = planHomeReset(current, defaults);

    expect(plan.create).toEqual([]);
    expect(plan.restore.find((entry) => entry.id === 'hsc-hero')).toMatchObject({ position: 0 });
    expect(plan.restore).toHaveLength(9);
    expect(plan.hide.map((entry) => entry.id)).toEqual([
      'sec_demo_deal',
      'sec_demo_reels',
      'sec_demo_reviews',
    ]);
    expect(plan.hide.map((entry) => entry.position)).toEqual([9, 10, 11]);
  });

  it('matches a freshly seeded, unstamped homepage by kind and title', () => {
    const current = SHIPPED.map(([kind, title], position) =>
      row({ id: `seed-${position}`, kind, title, position }),
    );
    const plan = planHomeReset(current, defaults);

    expect(plan.create).toEqual([]);
    expect(plan.hide).toEqual([]);
    expect(plan.restore.map((entry) => entry.id)).toEqual(current.map((section) => section.id));
  });

  it('keeps a renamed rail as the shipped rail it was stamped as', () => {
    const current = SHIPPED.map(([kind, title], position) =>
      row({
        id: `row-${position}`,
        kind,
        title: position === 4 ? 'Top picks this week' : title,
        position,
        defaultKey: keyFor(kind, position),
      }),
    );
    const plan = planHomeReset(current, defaults);

    expect(plan.restore.find((entry) => entry.id === 'row-4')).toMatchObject({ position: 4 });
    expect(plan.create).toEqual([]);
  });

  it('never lets an unstamped look-alike steal a section its stamped original holds', () => {
    const current = [
      row({ id: 'copy', kind: 'PRODUCT_RAIL', title: 'Bestsellers', position: 0 }),
      row({
        id: 'original',
        kind: 'PRODUCT_RAIL',
        title: 'Renamed',
        position: 5,
        defaultKey: keyFor('PRODUCT_RAIL', 4),
      }),
    ];
    const plan = planHomeReset(current, defaults);

    const bestsellers = plan.restore.find((entry) => entry.entry.defaultKey === keyFor('PRODUCT_RAIL', 4));
    expect(bestsellers?.id).toBe('original');
    expect(plan.hide.map((entry) => entry.id)).toContain('copy');
  });

  it('creates a shipped section that no longer exists, and deletes nothing', () => {
    const current = SHIPPED.slice(0, 8).map(([kind, title], position) =>
      row({ id: `kept-${position}`, kind, title, position }),
    );
    const plan = planHomeReset(current, defaults);

    expect(plan.create.map((entry) => entry.entry.kind)).toEqual(['VALUE_PROPS']);
    expect(plan.restore).toHaveLength(8);
    expect(plan.hide).toEqual([]);
  });

  it('is idempotent: a second reset over its own result changes nothing structural', () => {
    const current = SHIPPED.map(([kind, title], position) =>
      row({ id: `r${position}`, kind, title, position, defaultKey: keyFor(kind, position) }),
    );
    const added = row({ id: 'added', kind: 'REELS_STRIP', title: 'Clips', position: 9, isActive: false });

    const plan = planHomeReset([...current, added], defaults);
    expect(plan.create).toEqual([]);
    expect(plan.hide).toEqual([{ id: 'added', position: 9 }]);
  });
});
