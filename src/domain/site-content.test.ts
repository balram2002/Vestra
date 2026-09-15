import { describe, expect, it } from 'vitest';

import { DEFAULT_SITE_CONTENT, withDefaults } from './site-content';

describe('withDefaults', () => {
  it('ships the shop as designed when nothing has been edited', () => {
    expect(withDefaults(null)).toEqual(DEFAULT_SITE_CONTENT);
    expect(withDefaults(undefined)).toEqual(DEFAULT_SITE_CONTENT);
    expect(withDefaults({})).toEqual(DEFAULT_SITE_CONTENT);
  });

  it('keeps every block the editor has not touched', () => {
    const edited = withDefaults({
      announcements: [{ id: 'one', text: 'Free delivery today', href: null, isActive: true }],
    });

    expect(edited.announcements).toHaveLength(1);
    expect(edited.footerColumns).toEqual(DEFAULT_SITE_CONTENT.footerColumns);
    expect(edited.valueProps).toEqual(DEFAULT_SITE_CONTENT.valueProps);
  });

  it('lets a list be emptied, which is the point of replacing rather than merging', () => {
    // An administrator who deletes every announcement must get no strip, not
    // the shipped one back.
    expect(withDefaults({ announcements: [] }).announcements).toEqual([]);
    expect(withDefaults({ valueProps: [] }).valueProps).toEqual([]);
  });

  it('fills in an action that a stored record predates', () => {
    // Saved before Reels existed: the new switch takes the shipped default
    // rather than arriving as undefined and reading as "off".
    const stored = { headerActions: { search: false, wishlist: true, bag: true } };
    const merged = withDefaults(stored as Parameters<typeof withDefaults>[0]);

    expect(merged.headerActions.search).toBe(false);
    expect(merged.headerActions.reels).toBe(DEFAULT_SITE_CONTENT.headerActions.reels);
  });

  it('shows every block for a record saved before blocks could be hidden', () => {
    const stored = { announcements: [] };
    const merged = withDefaults(stored as Parameters<typeof withDefaults>[0]);

    expect(merged.visibility).toEqual(DEFAULT_SITE_CONTENT.visibility);
    expect(Object.values(merged.visibility).every(Boolean)).toBe(true);
  });

  it('keeps a hidden block hidden without touching its content', () => {
    const merged = withDefaults({
      visibility: { ...DEFAULT_SITE_CONTENT.visibility, announcements: false },
    });

    expect(merged.visibility.announcements).toBe(false);
    expect(merged.announcements).toEqual(DEFAULT_SITE_CONTENT.announcements);
    expect(merged.visibility.footerColumns).toBe(true);
  });
});
