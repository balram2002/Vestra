import 'server-only';

import type { NotificationCategory } from '@/domain/enums';

/**
 * Which actions send email, and which do not.
 *
 * Driven out deliberately rather than "email everything the in-app centre
 * shows", because those are different jobs. The in-app centre is a log you
 * consult; an inbox is somewhere you are interrupted. A message earns an email
 * only if it meets one of three tests:
 *
 *   1. IT IS A RECORD. An order confirmation, an invoice, a refund. People
 *      search their inbox for these months later, and no in-app list is a
 *      substitute for that.
 *   2. IT NEEDS AN ACTION AND THE PERSON IS NOT LOOKING. A return to approve,
 *      a KYC rejection to fix, a support reply to answer.
 *   3. IT IS TIME-CRITICAL. Out for delivery. A failed payment about to cancel
 *      an order.
 *
 * Anything failing all three stays in-app. "Your listing was approved" is
 * pleasant news that will keep until the seller next opens their console;
 * mailing it trains people to ignore mail from us, which is how the messages in
 * category 1 stop being read.
 *
 * TRANSACTIONAL vs MARKETING is a separate axis and is enforced in
 * `notify()`, not here: transactional mail is a record of something the person
 * did and is always delivered; marketing respects the opt-out.
 */

/**
 * Categories that mail by default.
 *
 * A per-category preference still applies on top of this — someone who turns
 * SHIPPING email off gets none — so this is the ceiling, not the floor.
 */
export const EMAIL_WORTHY: Record<NotificationCategory, boolean> = {
  /** Records: confirmations, invoices. Test 1. */
  ORDER: true,
  /** Dispatch and out-for-delivery. Test 3. */
  SHIPPING: true,
  /** Money in or out, including failed payments. Tests 1 and 3. */
  PAYMENT: true,
  /** Returns, exchanges and refunds — money and a deadline. Tests 1 and 2. */
  RETURN: true,
  /** Payouts and settlements a seller reconciles against. Test 1. */
  FINANCE: true,
  /**
   * Account and security: verification, password changes, store status. Test 2,
   * and the only channel that works when someone cannot sign in.
   */
  ACCOUNT: true,
  /** Support replies — a conversation the person is waiting on. Test 2. */
  SYSTEM: true,

  /*
   * Catalogue events stay in-app.
   *
   * "Your listing is live" and "a listing is waiting for review" are both read
   * inside the console, by someone who is already there. A seller who lists
   * forty styles a week would get forty emails for news they can see on the
   * screen they are looking at.
   */
  CATALOG: false,

  /*
   * Promotions are marketing and are gated on the opt-in anyway. Left off here
   * as well so that a campaign can never reach an inbox through the
   * transactional path by mistake.
   */
  PROMOTION: false,
};

/**
 * A subject line, from the category and the notification's own title.
 *
 * The title is written for a notification row, where the surrounding UI says
 * what kind of thing it is. An inbox has no surrounding UI, so the subject has
 * to stand alone — but prefixing every subject with "[Vestra]" wastes the
 * first and most-read characters, and the sender name already says who it is.
 */
export function subjectFor(category: NotificationCategory, title: string): string {
  const subject = title.trim();

  /*
   * Most titles already name their subject — "A refund is on its way for
   * VS25260000001" reads perfectly cold. Support replies do not: "Reply on
   * TCK-1042" tells someone scanning an inbox nothing about what it concerns,
   * and it is the one category where the reader is mid-conversation.
   */
  if (category === 'SYSTEM' && !/support/i.test(subject)) {
    return `Support: ${subject}`;
  }

  return subject;
}

/** The word above the heading, so the reader places the message immediately. */
export function eyebrowFor(category: NotificationCategory): string | null {
  const labels: Partial<Record<NotificationCategory, string>> = {
    ORDER: 'Your order',
    SHIPPING: 'Delivery',
    PAYMENT: 'Payment',
    RETURN: 'Return',
    FINANCE: 'Payout',
    ACCOUNT: 'Your account',
    SYSTEM: 'Support',
  };
  return labels[category] ?? null;
}

/** The call to action, which differs by what the reader is being sent to. */
export function buttonLabelFor(category: NotificationCategory): string {
  const labels: Partial<Record<NotificationCategory, string>> = {
    ORDER: 'View your order',
    SHIPPING: 'Track your parcel',
    PAYMENT: 'View the details',
    RETURN: 'View the return',
    FINANCE: 'View the payout',
    SYSTEM: 'Read and reply',
  };
  return labels[category] ?? 'Open Vestra';
}
