import { describe, expect, it } from 'vitest';

import { hasRules, modeAt, modesFor, normalisePath, withChromeDefaults } from './page-chrome';
import { liveAnnouncements } from './site-content';

describe('reading stored page layout rules', () => {
  it('reads the first version’s booleans as everywhere or off', () => {
    const rules = withChromeDefaults({ store: { header: false, footer: true } });
    expect(rules.pages.store).toEqual({ strip: 'all', header: 'none', footer: 'all', bottomNav: 'all' });
    expect(rules.pages.home.header).toBe('all');
    expect(rules.overrides).toEqual([]);
  });

  it('reads the current shape, and ignores a mode it does not know', () => {
    const rules = withChromeDefaults({
      pages: { checkout: { footer: 'desktop', header: 'sideways' } },
      overrides: [{ id: 'a', path: 'sell-with-us/apply/', rule: { header: 'none' } }],
    });
    expect(rules.pages.checkout.footer).toBe('desktop');
    expect(rules.pages.checkout.header).toBe('all');
    expect(rules.overrides[0].path).toBe('/sell-with-us/apply');
    expect(rules.overrides[0].rule.header).toBe('none');
  });
});

describe('where a part shows', () => {
  const rules = withChromeDefaults({
    pages: { store: { header: 'mobile' } },
    overrides: [
      { id: 'a', path: '/store/ash-and-oak', rule: { header: 'all' } },
      { id: 'b', path: '/about', rule: { header: 'none' } },
    ],
  });
  const header = modesFor(rules, 'header');

  it('uses a page’s own rule before its family’s', () => {
    expect(modeAt('/store/ash-and-oak', header)).toBe('all');
    expect(modeAt('/store/another-shop', header)).toBe('mobile');
    expect(modeAt('/about', header)).toBe('none');
    expect(modeAt('/about/', header)).toBe('none');
  });

  it('is everywhere for a page nobody configured', () => {
    expect(modeAt('/bag', header)).toBe('all');
    expect(modeAt(null, header)).toBe('all');
  });

  it('needs no gate at all when nothing is configured', () => {
    expect(hasRules(modesFor(withChromeDefaults(undefined), 'footer'))).toBe(false);
    expect(hasRules(header)).toBe(true);
  });

  it('normalises paths the way people type them', () => {
    expect(normalisePath('help/returns/?utm=x')).toBe('/help/returns');
    expect(normalisePath('/')).toBe('/');
  });
});

describe('the promotion strip’s schedule', () => {
  const now = Date.parse('2026-10-20T12:00:00.000Z');
  const line = (id: string, patch = {}) => ({ id, text: id, href: null, isActive: true, ...patch });

  it('shows lines inside their window and switched on', () => {
    const items = [
      line('always'),
      line('off', { isActive: false }),
      line('later', { startsAt: '2026-10-21T00:00:00.000Z' }),
      line('over', { endsAt: '2026-10-20T11:00:00.000Z' }),
      line('now', { startsAt: '2026-10-20T00:00:00.000Z', endsAt: '2026-10-25T00:00:00.000Z' }),
    ];
    expect(liveAnnouncements(items, now).map((item) => item.id)).toEqual(['always', 'now']);
  });
});
