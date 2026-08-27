import 'server-only';

import type {
  Notification,
  NotificationCategory,
  NotificationChannel,
  User,
} from '@/domain/types';
import { defaultPreferenceFor } from '@/domain/notifications';

import { absoluteUrl } from '@/config/site';
import { entityId } from '@/lib/ids';
import { formatMoney } from '@/lib/format';

import { collections, toEntities, toEntity } from '../db/collections';
import { EMAIL_WORTHY } from '../email/catalogue';

/**
 * Notifications.
 *
 * Delivery is modelled as an ADAPTER per channel rather than a call to an email
 * SDK sprinkled through the services. Three reasons that matters here:
 *
 *  1. A notification that fails to send must never fail the thing that caused
 *     it. An order does not get rolled back because an SMTP host was down, so
 *     dispatch is isolated and failures are logged, not thrown.
 *  2. Preferences and the transactional/marketing split have to be enforced in
 *     ONE place. "Order shipped" ignores a marketing opt-out; "20% off this
 *     weekend" must not. Deciding that per call site guarantees someone gets it
 *     wrong and the platform sends marketing to someone who opted out.
 *  3. The in-app record is written even when every external channel is off, so
 *     the notification centre is always complete.
 *
 * In-app and EMAIL both deliver. SMS and push are still stubs that log —
 * deliberately visible as stubs rather than pretending.
 */

/* ---------------------------------------------------------------- adapters */

export interface ChannelAdapter {
  channel: NotificationChannel;
  send(input: {
    user: Pick<User, 'id' | 'email' | 'phone' | 'fullName'>;
    /** Decides the subject framing and the call to action. */
    category: NotificationCategory;
    title: string;
    body: string;
    href: string | null;
    rows?: Array<{ label: string; value: string }>;
  }): Promise<{ ok: boolean; error?: string }>;
}

function loggingAdapter(channel: NotificationChannel): ChannelAdapter {
  return {
    channel,
    async send({ user, title }) {
      // A stub that says so. Silently returning ok would make an unconfigured
      // provider indistinguishable from a working one.
      console.info(`[vestra:notify] ${channel} -> ${user.email}: ${title} (adapter not configured)`);
      return { ok: true };
    },
  };
}

/**
 * Email, rendered through the shared shell.
 *
 * Every message goes through one template rather than a bespoke one per event.
 * A notification already carries the four things an email needs — what
 * happened, a sentence of detail, where to go, and which category it belongs
 * to — and inventing a separate body per call site is how the wording in an
 * inbox drifts away from the wording in the app.
 */
const emailAdapter: ChannelAdapter = {
  channel: 'EMAIL',
  async send({ user, category, title, body, href, rows }) {
    const [{ renderHtml, renderText }, catalogue, { sendEmail }] = await Promise.all([
      import('../email/layout'),
      import('../email/catalogue'),
      import('../email/transport'),
    ]);

    const content = {
      eyebrow: catalogue.eyebrowFor(category),
      heading: title,
      paragraphs: [body],
      rows,
      button: href
        ? { label: catalogue.buttonLabelFor(category), href: absoluteUrl(href) }
        : null,
    };

    return sendEmail({
      to: user.email,
      subject: catalogue.subjectFor(category, title),
      html: renderHtml(content),
      text: renderText(content),
    });
  },
};

const ADAPTERS: Record<NotificationChannel, ChannelAdapter | null> = {
  // In-app is the persisted record itself, handled inline below.
  IN_APP: null,
  EMAIL: emailAdapter,
  SMS: loggingAdapter('SMS'),
  PUSH: loggingAdapter('PUSH'),
  WHATSAPP: loggingAdapter('WHATSAPP'),
};

/* ----------------------------------------------------------------- sending */

export interface NotifyInput {
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  href?: string | null;
  imageUrl?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /**
   * Transactional messages are about something the user did and are always
   * delivered. Only marketing respects the marketing opt-out.
   */
  transactional?: boolean;
  /**
   * Figures to print in the EMAIL only — a total, a tracking number, a date.
   *
   * The in-app row is one line beside forty others and a table would drown it;
   * an inbox is where the same message has to stand alone as a record months
   * later. So the extra detail is offered here rather than by giving each
   * event its own template, which is how wording drifts between the two.
   */
  emailRows?: Array<{ label: string; value: string }>;
}

export async function notify(input: NotifyInput): Promise<Notification | null> {
  const users = await collections.users();
  const user = toEntity(await users.findOne({ _id: input.userId }));
  if (!user) return null;

  const transactional = input.transactional ?? true;

  // A marketing message to someone who opted out is never sent, on any channel,
  // including in-app. This is the one place that rule lives.
  if (!transactional && !user.preferences.marketingOptIn) return null;

  /*
   * An account with nothing recorded gets the platform default, not silence.
   * Treating an absent preference as "off" is what stopped newly registered
   * customers receiving their own order confirmations.
   */
  const preference =
    user.preferences.notifications[input.category] ?? defaultPreferenceFor(input.category);
  const wanted: NotificationChannel[] = ['IN_APP'];

  /*
   * Two gates, deliberately both. `EMAIL_WORTHY` is the platform's judgement
   * about whether this KIND of message belongs in an inbox at all; the user's
   * preference is theirs about whether they want it. Either one saying no is
   * enough.
   */
  if (preference.email && EMAIL_WORTHY[input.category]) wanted.push('EMAIL');
  if (preference.sms) wanted.push('SMS');
  if (preference.push) wanted.push('PUSH');

  const delivered: NotificationChannel[] = ['IN_APP'];

  for (const channel of wanted) {
    const adapter = ADAPTERS[channel];
    if (!adapter) continue;

    try {
      const result = await adapter.send({
        user: { id: user.id, email: user.email, phone: user.phone, fullName: user.fullName },
        category: input.category,
        title: input.title,
        rows: input.emailRows,
        body: input.body,
        href: input.href ?? null,
      });
      if (result.ok) delivered.push(channel);
    } catch (error) {
      // Never rethrow: a failed send must not fail the order that caused it.
      console.error(`[vestra:notify] ${channel} failed`, error);
    }
  }

  const notification: Notification = {
    id: entityId('ntf'),
    userId: user.id,
    category: input.category,
    title: input.title,
    body: input.body,
    href: input.href ?? null,
    imageUrl: input.imageUrl ?? null,
    read: false,
    readAt: null,
    channels: delivered,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    createdAt: new Date().toISOString(),
  };

  const notifications = await collections.notifications();
  await notifications.insertOne({ ...notification, _id: notification.id });

  return notification;
}

/** Fire-and-forget. For call sites where the notification is a side effect. */
export function notifyQuietly(input: NotifyInput): void {
  void notify(input).catch((error) => {
    console.error('[vestra:notify] failed', error);
  });
}

/* ------------------------------------------------------------------- reads */

export async function listNotifications(userId: string, limit = 50): Promise<Notification[]> {
  const notifications = await collections.notifications();
  return toEntities(
    await notifications.find({ userId }).sort({ createdAt: -1 }).limit(limit).toArray(),
  );
}

export async function countUnread(userId: string): Promise<number> {
  const notifications = await collections.notifications();
  return notifications.countDocuments({ userId, read: false });
}

export async function markAllRead(userId: string): Promise<void> {
  const notifications = await collections.notifications();
  await notifications.updateMany(
    { userId, read: false },
    { $set: { read: true, readAt: new Date().toISOString() } },
  );
}

export async function markRead(userId: string, notificationId: string): Promise<void> {
  const notifications = await collections.notifications();
  // Scoped by userId so one user cannot mark another's notification read.
  await notifications.updateOne(
    { _id: notificationId, userId },
    { $set: { read: true, readAt: new Date().toISOString() } },
  );
}

/* --------------------------------------------------------------- templates */

/**
 * The messages the platform actually sends.
 *
 * Centralised so wording is consistent and so a change to how an order
 * confirmation reads is one edit, not a search across the services.
 */
export const NOTIFY = {
  orderPlaced: (
    userId: string,
    orderNumber: string,
    orderId: string,
    summary?: { items: number; total: number; payment: string },
  ) =>
    notify({
      userId,
      category: 'ORDER',
      title: `Order ${orderNumber} placed`,
      body: 'We have received your order. You can track every parcel from your orders page.',
      href: `/orders/${orderId}`,
      entityType: 'order',
      entityId: orderId,
      // What makes the email a receipt rather than an announcement.
      emailRows: summary
        ? [
            { label: 'Order', value: orderNumber },
            { label: 'Items', value: String(summary.items) },
            { label: 'Paid by', value: summary.payment },
            { label: 'Total', value: formatMoney(summary.total) },
          ]
        : undefined,
    }),

  orderShipped: (userId: string, orderNumber: string, orderId: string) =>
    notify({
      userId,
      category: 'SHIPPING',
      title: `Order ${orderNumber} is on its way`,
      body: 'Your parcel has been handed to the courier.',
      href: `/orders/${orderId}`,
      entityType: 'order',
      entityId: orderId,
    }),

  orderDelivered: (userId: string, orderNumber: string, orderId: string) =>
    notify({
      userId,
      category: 'SHIPPING',
      title: `Order ${orderNumber} delivered`,
      body: 'Let us know how it fits — your review helps other shoppers get the size right.',
      href: `/orders/${orderId}`,
      entityType: 'order',
      entityId: orderId,
    }),

  returnApproved: (userId: string, returnNumber: string, orderId: string) =>
    notify({
      userId,
      category: 'RETURN',
      title: `Return ${returnNumber} approved`,
      body: 'A courier will collect the item from your address.',
      href: `/orders/${orderId}`,
      entityType: 'return',
      entityId: returnNumber,
    }),

  refundComplete: (userId: string, amount: string, orderId: string) =>
    notify({
      userId,
      category: 'PAYMENT',
      title: `Refund of ${amount} complete`,
      body: 'The money is back with your original payment method.',
      href: `/orders/${orderId}`,
      entityType: 'order',
      entityId: orderId,
    }),

  paymentFailed: (userId: string, orderNumber: string, orderId: string) =>
    notify({
      userId,
      category: 'PAYMENT',
      title: `Payment for ${orderNumber} did not go through`,
      body: 'Nothing has been charged and your items are still held. Try again from your order.',
      href: `/orders/${orderId}`,
      entityType: 'order',
      entityId: orderId,
    }),
};
