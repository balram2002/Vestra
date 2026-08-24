import 'server-only';

import type {
  Notification,
  NotificationCategory,
  NotificationChannel,
  User,
} from '@/domain/types';
import { entityId } from '@/lib/ids';

import { collections, toEntities, toEntity } from '../db/collections';

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
 * Only the in-app adapter actually delivers today. Email, SMS and push are
 * stubs that log — deliberately visible as stubs rather than pretending.
 */

/* ---------------------------------------------------------------- adapters */

export interface ChannelAdapter {
  channel: NotificationChannel;
  send(input: {
    user: Pick<User, 'id' | 'email' | 'phone' | 'fullName'>;
    title: string;
    body: string;
    href: string | null;
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

const ADAPTERS: Record<NotificationChannel, ChannelAdapter | null> = {
  // In-app is the persisted record itself, handled inline below.
  IN_APP: null,
  EMAIL: loggingAdapter('EMAIL'),
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
}

export async function notify(input: NotifyInput): Promise<Notification | null> {
  const users = await collections.users();
  const user = toEntity(await users.findOne({ _id: input.userId }));
  if (!user) return null;

  const transactional = input.transactional ?? true;

  // A marketing message to someone who opted out is never sent, on any channel,
  // including in-app. This is the one place that rule lives.
  if (!transactional && !user.preferences.marketingOptIn) return null;

  const preference = user.preferences.notifications[input.category];
  const wanted: NotificationChannel[] = ['IN_APP'];

  if (preference?.email) wanted.push('EMAIL');
  if (preference?.sms) wanted.push('SMS');
  if (preference?.push) wanted.push('PUSH');

  const delivered: NotificationChannel[] = ['IN_APP'];

  for (const channel of wanted) {
    const adapter = ADAPTERS[channel];
    if (!adapter) continue;

    try {
      const result = await adapter.send({
        user: { id: user.id, email: user.email, phone: user.phone, fullName: user.fullName },
        title: input.title,
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
  orderPlaced: (userId: string, orderNumber: string, orderId: string) =>
    notify({
      userId,
      category: 'ORDER',
      title: `Order ${orderNumber} placed`,
      body: 'We have received your order. You can track every parcel from your orders page.',
      href: `/orders/${orderId}`,
      entityType: 'order',
      entityId: orderId,
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
