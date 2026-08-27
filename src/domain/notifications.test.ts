import { describe, expect, it } from 'vitest';

import { NOTIFICATION_CATEGORIES } from './enums';
import { defaultNotificationPreferences, defaultPreferenceFor } from './notifications';

/**
 * Notification defaults.
 *
 * These were written out inline in three places that disagreed, and the
 * disagreement was invisible: a newly registered customer was created with an
 * empty preference map, an absent preference read as "off", and so they never
 * received their own order confirmation. Nothing failed — no email is not an
 * error anyone sees.
 */

describe('defaultPreferenceFor', () => {
  it('turns transactional email on', () => {
    expect(defaultPreferenceFor('ORDER').email).toBe(true);
    expect(defaultPreferenceFor('SHIPPING').email).toBe(true);
    expect(defaultPreferenceFor('PAYMENT').email).toBe(true);
    expect(defaultPreferenceFor('FINANCE').email).toBe(true);
  });

  /*
   * Off by default is both the lawful position and the one people expect.
   * Getting this backwards is a regulatory problem, not a UX one.
   */
  it('leaves marketing off on every channel', () => {
    const promotion = defaultPreferenceFor('PROMOTION');
    expect(promotion.email).toBe(false);
    expect(promotion.sms).toBe(false);
    expect(promotion.push).toBe(false);
  });

  it('still shows marketing in the app, where it was asked for', () => {
    expect(defaultPreferenceFor('PROMOTION').inApp).toBe(true);
  });

  /*
   * Account and security messages are not worth a text, and a phone number is
   * not always on the account.
   */
  it('does not text about account and security', () => {
    expect(defaultPreferenceFor('ACCOUNT').sms).toBe(false);
    expect(defaultPreferenceFor('ACCOUNT').email).toBe(true);
  });

  it('keeps in-app on for everything', () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(defaultPreferenceFor(category).inApp).toBe(true);
    }
  });
});

describe('defaultNotificationPreferences', () => {
  /*
   * The completeness check. The seeder used to write six of nine categories,
   * so seeded sellers had no recorded preference for their own payouts.
   */
  it('covers every category, with none missed', () => {
    const preferences = defaultNotificationPreferences();
    expect(Object.keys(preferences).sort()).toEqual([...NOTIFICATION_CATEGORIES].sort());
  });

  it('agrees with the single-category helper', () => {
    const preferences = defaultNotificationPreferences();
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(preferences[category]).toEqual(defaultPreferenceFor(category));
    }
  });
});
