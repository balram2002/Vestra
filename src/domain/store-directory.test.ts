import { describe, expect, it } from 'vitest';

import { groupByCity, orderStores, storyOrder, type DirectoryStore } from './store-directory';

function store(overrides: Partial<DirectoryStore>): DirectoryStore {
  return {
    id: overrides.slug ?? 'x',
    slug: 'x',
    name: 'X',
    tagline: null,
    about: '',
    logo: '',
    banner: '',
    city: 'Jaipur',
    verified: true,
    ratingAverage: 4,
    ratingCount: 50,
    orders: 10,
    liveProducts: 5,
    trustValue: 80,
    stats: [],
    approvedAt: '2026-01-01T00:00:00.000Z',
    isNew: false,
    ...overrides,
  };
}

describe('orderStores', () => {
  it('puts stores with something to buy first, whatever the order', () => {
    const empty = store({ slug: 'empty', name: 'Empty', liveProducts: 0, ratingAverage: 5 });
    const trading = store({ slug: 'trading', name: 'Trading', ratingAverage: 3 });
    expect(orderStores([empty, trading], 'rating').map((s) => s.slug)).toEqual(['trading', 'empty']);
  });

  it('can leave stores opening soon out', () => {
    const empty = store({ slug: 'empty', liveProducts: 0 });
    expect(orderStores([empty, store({ slug: 'a' })], 'rating', false).map((s) => s.slug)).toEqual(['a']);
  });

  it('does not let a perfect score from two reviews beat a strong one from many', () => {
    const fluke = store({ slug: 'fluke', ratingAverage: 5, ratingCount: 2 });
    const proven = store({ slug: 'proven', ratingAverage: 4.7, ratingCount: 200 });
    expect(orderStores([fluke, proven], 'rating')[0].slug).toBe('proven');
  });

  it('orders by trust, orders and newest', () => {
    const a = store({ slug: 'a', name: 'A', trustValue: 90, orders: 5, approvedAt: '2026-01-01T00:00:00.000Z' });
    const b = store({ slug: 'b', name: 'B', trustValue: 70, orders: 50, approvedAt: '2026-06-01T00:00:00.000Z' });
    expect(orderStores([b, a], 'trust')[0].slug).toBe('a');
    expect(orderStores([a, b], 'orders')[0].slug).toBe('b');
    expect(orderStores([a, b], 'newest')[0].slug).toBe('b');
  });

  it('falls back to rating for an unknown order and breaks ties by name', () => {
    const b = store({ slug: 'b', name: 'Bela' });
    const a = store({ slug: 'a', name: 'Amra' });
    expect(orderStores([b, a], 'bogus').map((s) => s.slug)).toEqual(['a', 'b']);
  });
});

describe('groupByCity', () => {
  it('puts the biggest market first and unknown cities last', () => {
    const groups = groupByCity(
      [
        store({ slug: 'a', city: 'Surat' }),
        store({ slug: 'b', city: '' }),
        store({ slug: 'c', city: 'Jaipur' }),
        store({ slug: 'd', city: 'Jaipur' }),
      ],
      1,
    );
    expect(groups.map((group) => group.city)).toEqual(['Jaipur', 'Surat', 'More cities']);
    expect(groups[0].anchor).toBe('city-jaipur');
  });

  it('folds cities too small to be a market into More cities', () => {
    const groups = groupByCity([
      store({ slug: 'a', city: 'Surat' }),
      store({ slug: 'b', city: 'Bhuj' }),
      store({ slug: 'c', city: 'Jaipur' }),
      store({ slug: 'd', city: 'Jaipur' }),
    ]);
    expect(groups.map((group) => group.city)).toEqual(['Jaipur', 'More cities']);
    expect(groups[1].stores.map((s) => s.slug)).toEqual(['a', 'b']);
  });

  it('keeps the given order inside a city', () => {
    const groups = groupByCity([store({ slug: 'first', city: 'Pune' }), store({ slug: 'second', city: 'Pune' })]);
    expect(groups[0].stores.map((s) => s.slug)).toEqual(['first', 'second']);
  });

  it('makes a clean anchor from any city name', () => {
    expect(groupByCity([store({ city: 'New Delhi (NCR)' })], 1)[0].anchor).toBe('city-new-delhi-ncr');
  });
});

describe('storyOrder', () => {
  it('shows live stores, then new ones, then the rest, each once, and skips empty stores', () => {
    const stores = [
      store({ slug: 'old' }),
      store({ slug: 'new', isNew: true }),
      store({ slug: 'live', isNew: true }),
      store({ slug: 'empty', liveProducts: 0 }),
    ];
    expect(storyOrder(stores, new Set(['live'])).map((s) => s.slug)).toEqual(['live', 'new', 'old']);
  });
});
