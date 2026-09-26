import { describe, expect, it } from 'vitest';

import { compositionChanges, visibleNow, type CompositionSnapshot } from './compositions';
import type { Banner, HomeSection } from './types';

const section = (id: string, patch: Partial<HomeSection> = {}): HomeSection =>
  ({
    id,
    kind: 'PRODUCT_RAIL',
    title: id,
    subtitle: null,
    position: 0,
    isActive: true,
    startsAt: null,
    endsAt: null,
    visibleOn: 'ALL',
    config: {},
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  }) as HomeSection;

const banner = (id: string, patch: Partial<Banner> = {}): Banner =>
  ({
    id,
    name: id,
    placement: 'HOME_HERO',
    headline: null,
    subheadline: null,
    ctaLabel: null,
    href: '/',
    imageUrl: '/x.jpg',
    mobileImageUrl: null,
    alt: '',
    theme: 'light',
    position: 0,
    isActive: true,
    startsAt: null,
    endsAt: null,
    impressions: 0,
    clicks: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  }) as Banner;

const live: CompositionSnapshot = {
  sections: [section('rail', { position: 1 }), section('hero', { kind: 'HERO_CAROUSEL', position: 0 })],
  banners: [banner('slide')],
};

describe('what publishing would change', () => {
  it('is nothing when the draft is the live page', () => {
    expect(compositionChanges(live, structuredClone(live))).toEqual([]);
  });

  it('ignores saves that changed nothing, and banner traffic counters', () => {
    const draft = structuredClone(live);
    draft.sections[0].updatedAt = '2026-09-01T00:00:00.000Z';
    draft.banners[0].impressions = 9000;
    draft.banners[0].clicks = 40;
    expect(compositionChanges(live, draft)).toEqual([]);
  });

  it('names added, hidden, edited and removed sections', () => {
    const draft = structuredClone(live);
    draft.sections[0].isActive = false;
    draft.sections[1].title = 'New hero title';
    draft.sections.push(section('new', { title: 'Festive picks', position: 2 }));
    expect(compositionChanges(live, draft)).toEqual([
      'Hides section “rail”',
      'Edits section “New hero title”',
      'Adds section “Festive picks”',
    ]);
    expect(compositionChanges(live, { ...draft, sections: [draft.sections[1]] })).toContain('Removes section “rail”');
  });

  it('notices a reorder on its own', () => {
    const draft = structuredClone(live);
    draft.sections[0].position = 0;
    draft.sections[1].position = 1;
    expect(compositionChanges(live, draft)).toEqual(['Reorders sections']);
  });

  it('names banner changes by placement', () => {
    const draft = structuredClone(live);
    draft.banners[0].headline = 'Diwali';
    draft.banners.push(banner('tile', { placement: 'HOME_GRID', name: 'Sarees' }));
    expect(compositionChanges(live, draft)).toEqual(['Edits hero slide “slide”', 'Adds grid tile “Sarees”']);
  });
});

describe('what shoppers see from a snapshot', () => {
  it('keeps switched-on items inside their window, in order', () => {
    const now = Date.parse('2026-10-05T00:00:00.000Z');
    const items = [
      section('later', { position: 0, startsAt: '2026-10-10T00:00:00.000Z' }),
      section('over', { position: 1, endsAt: '2026-10-01T00:00:00.000Z' }),
      section('off', { position: 2, isActive: false }),
      section('b', { position: 4 }),
      section('a', { position: 3 }),
    ];
    expect(visibleNow(items, now).map((item) => item.id)).toEqual(['a', 'b']);
  });
});
