import { NOTIFICATION_CATEGORIES, type NotificationCategory } from './enums';

/**
 * What a person gets when they have not said otherwise.
 *
 * One definition, used in three places that would otherwise disagree: the
 * seeder, registration, and `notify()`'s fallback for an account with nothing
 * recorded. They HAD disagreed — a newly registered customer was created with
 * an empty preference map, and because an absent preference read as "off",
 * they never received an order confirmation.
 *
 * That is the reason the fallback lives in `notify()` rather than only at
 * registration: writing defaults at signup fixes the next account, while a
 * fallback fixes every account that already exists.
 */

export interface NotificationPreference {
  inApp: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
}

/**
 * Transactional channels default on; marketing defaults off, which is both the
 * lawful default and the one people expect.
 *
 * SMS is the exception within transactional: account and security messages are
 * not worth a text, and a phone number is not always present.
 */
export function defaultPreferenceFor(category: NotificationCategory): NotificationPreference {
  const transactional = category !== 'PROMOTION';
  return {
    inApp: true,
    email: transactional,
    sms: transactional && category !== 'ACCOUNT',
    push: transactional,
  };
}

export function defaultNotificationPreferences(): Record<
  NotificationCategory,
  NotificationPreference
> {
  const preferences = {} as Record<NotificationCategory, NotificationPreference>;
  for (const category of NOTIFICATION_CATEGORIES) {
    preferences[category] = defaultPreferenceFor(category);
  }
  return preferences;
}
