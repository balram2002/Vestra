'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { Address, SupportCategory, User } from '@/domain/types';
import { SUPPORT_CATEGORY_LABEL } from '@/domain/types';
import { entityId } from '@/lib/ids';
import { addressSchema, type AddressInput } from '@/lib/validation/address';
import { passwordSchema } from '@/lib/validation/auth';
import { preferencesSchema, profileSchema } from '@/lib/validation/profile';

import { hashPassword, verifyPassword } from '../auth/password';
import { refreshSession, requireUser } from '../auth/session';
import { collections, toDoc, toEntities, toEntity } from '../db/collections';
import { mediaStore } from '../media/store';
import { markAllRead, markRead } from '../services/notifications';
import { createTicket } from '../services/support';
import { LIMITS, hit, peek, retryMessage } from '../security/rate-limit';

/**
 * The shopper's own account: notifications, addresses, profile, password and
 * support requests.
 *
 * Every read and write is scoped by the signed-in user's id inside the query,
 * never by an id from the client alone, so one account cannot touch another's
 * address or order by changing a value in a request.
 */

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  /** The form field an error belongs to, so it can sit under that input. */
  field?: string;
  data?: T;
}

function firstIssue(error: z.ZodError): ActionResult<never> {
  const issue = error.issues[0];
  return {
    ok: false,
    error: issue?.message ?? 'Check the form and try again.',
    field: issue?.path[0] !== undefined ? String(issue.path[0]) : undefined,
  };
}

/* ---------------------------------------------------------- notifications */

export async function markNotificationsRead(): Promise<ActionResult> {
  const user = await requireUser();
  await markAllRead(user.id);
  revalidatePath('/account/notifications');
  return { ok: true };
}

export async function markNotificationRead(notificationId: string): Promise<ActionResult> {
  const user = await requireUser();
  // Scoped by user inside the service, so one account cannot mark another's.
  await markRead(user.id, notificationId);
  revalidatePath('/account/notifications');
  return { ok: true };
}

/* -------------------------------------------------------------- addresses */

const MAX_ADDRESSES = 10;

function revalidateAddresses() {
  revalidatePath('/account/addresses');
  // Checkout lists the same book, and must show a new address at once.
  revalidatePath('/checkout');
}

/**
 * Add or edit an address.
 *
 * The first address is the default whether or not the box was ticked, because
 * a book with no default makes checkout guess. The default cannot be unticked
 * on the default itself: making another address the default is how it moves,
 * so there is never a moment with none.
 */
export async function saveAddress(
  input: AddressInput & { id?: string },
): Promise<ActionResult<Address>> {
  const user = await requireUser();

  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const data = parsed.data;

  const addresses = await collections.addresses();
  const mine = toEntities(await addresses.find({ userId: user.id }).toArray());
  const existing = input.id ? mine.find((address) => address.id === input.id) : undefined;

  if (input.id && !existing) return { ok: false, error: 'That address could not be found.' };
  if (!existing && mine.length >= MAX_ADDRESSES) {
    return {
      ok: false,
      error: `You can save up to ${MAX_ADDRESSES} addresses. Remove one to add another.`,
    };
  }

  const now = new Date().toISOString();
  const isDefault = data.isDefault || mine.length === 0 || Boolean(existing?.isDefault);

  const fields = {
    label: data.label,
    fullName: data.fullName,
    phone: data.phone,
    alternatePhone: data.alternatePhone || null,
    line1: data.line1,
    line2: data.line2 || null,
    landmark: data.landmark || null,
    city: data.city,
    state: data.state,
    pincode: data.pincode,
    isDefault,
    updatedAt: now,
  };

  if (isDefault && !existing?.isDefault) {
    await addresses.updateMany({ userId: user.id, isDefault: true }, { $set: { isDefault: false } });
  }

  let saved: Address;
  if (existing) {
    await addresses.updateOne({ _id: existing.id, userId: user.id }, { $set: fields });
    saved = { ...existing, ...fields };
  } else {
    saved = {
      id: entityId('adr'),
      userId: user.id,
      country: 'India',
      isBillingDefault: mine.length === 0,
      createdAt: now,
      ...fields,
    };
    await addresses.insertOne(toDoc(saved));
  }

  revalidateAddresses();
  return { ok: true, data: saved };
}

/**
 * Remove an address.
 *
 * Orders already placed keep the address they were sent to: it was
 * snapshotted onto the order, so nothing here can rewrite a delivery.
 */
export async function deleteAddress(addressId: string): Promise<ActionResult> {
  const user = await requireUser();

  const addresses = await collections.addresses();
  const target = toEntity(await addresses.findOne({ _id: addressId, userId: user.id }));
  if (!target) return { ok: false, error: 'That address could not be found.' };

  await addresses.deleteOne({ _id: target.id, userId: user.id });

  // The default role passes to the most recently touched remaining address.
  if (target.isDefault) {
    const [next] = await addresses.find({ userId: user.id }).sort({ updatedAt: -1 }).limit(1).toArray();
    if (next) await addresses.updateOne({ _id: next._id }, { $set: { isDefault: true } });
  }

  revalidateAddresses();
  return { ok: true };
}

export async function setDefaultAddress(addressId: string): Promise<ActionResult> {
  const user = await requireUser();

  const addresses = await collections.addresses();
  const target = await addresses.findOne({ _id: addressId, userId: user.id });
  if (!target) return { ok: false, error: 'That address could not be found.' };

  await addresses.updateMany({ userId: user.id, isDefault: true }, { $set: { isDefault: false } });
  await addresses.updateOne(
    { _id: addressId, userId: user.id },
    { $set: { isDefault: true, updatedAt: new Date().toISOString() } },
  );

  revalidateAddresses();
  return { ok: true };
}

/* ---------------------------------------------------------------- profile */

/**
 * Name, phone, gender and birthday.
 *
 * The email is not editable here: it is the sign-in and where order updates
 * go, and changing it needs a verification round trip of its own. A changed
 * phone is marked unverified rather than carrying the old number's status.
 *
 * Gender and birthday are written only when the form sent them, so a caller
 * that knows nothing of them cannot blank them by leaving them out.
 */
export async function updateProfile(input: {
  fullName: string;
  phone: string;
  gender?: string;
  dateOfBirth?: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  const users = await collections.users();
  const current = toEntity(
    await users.findOne({ _id: user.id }, { projection: { passwordHash: 0 } }),
  );
  if (!current) return { ok: false, error: 'Your account could not be found.' };

  const phone = parsed.data.phone || null;
  const taken: ActionResult = {
    ok: false,
    error: 'Another account already uses this number.',
    field: 'phone',
  };

  /*
   * A number belongs to one account. The unique index is the real guard --
   * two people saving the same number at once both pass this check -- so its
   * duplicate-key error is answered the same way instead of failing the request.
   */
  if (phone && phone !== current.phone) {
    if ((await users.countDocuments({ phone, _id: { $ne: user.id } })) > 0) return taken;
  }

  try {
    await users.updateOne(
      { _id: user.id },
      {
        $set: {
          fullName: parsed.data.fullName,
          phone,
          ...(parsed.data.gender !== undefined
            ? { gender: (parsed.data.gender || null) as User['gender'] }
            : {}),
          ...(parsed.data.dateOfBirth !== undefined
            ? { dateOfBirth: parsed.data.dateOfBirth || null }
            : {}),
          updatedAt: new Date().toISOString(),
          ...(phone !== current.phone ? { phoneVerified: false } : {}),
        },
      },
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return taken;
    throw error;
  }

  await refreshSession();
  revalidatePath('/account', 'layout');
  return { ok: true };
}

/**
 * Marketing email and usual sizes.
 *
 * Written as two fields inside `preferences`, never as the whole object, so
 * the notification settings kept beside them are not overwritten by a form
 * that does not show them.
 */
export async function updatePreferences(input: {
  marketingOptIn: boolean;
  preferredSizes: Record<string, string>;
}): Promise<ActionResult<{ preferredSizes: Record<string, string> }>> {
  const user = await requireUser();

  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  const users = await collections.users();
  await users.updateOne(
    { _id: user.id },
    {
      $set: {
        'preferences.marketingOptIn': parsed.data.marketingOptIn,
        'preferences.preferredSizes': parsed.data.preferredSizes,
        updatedAt: new Date().toISOString(),
      },
    },
  );

  revalidatePath('/account/profile');
  return { ok: true, data: { preferredSizes: parsed.data.preferredSizes } };
}

/* ----------------------------------------------------------- profile photo */

const PHOTO_TYPES = 'Choose a photo: JPEG, PNG, WebP or AVIF.';

/**
 * Replace the profile photo.
 *
 * The browser crops and shrinks the photo before sending it, but nothing here
 * relies on that. The store reads the BYTES, and a file whose bytes are not an
 * image is removed again and refused, whatever it claimed to be.
 *
 * The previous photo is deleted once the new one is saved -- not before -- so
 * a failed upload never leaves someone with no photo at all.
 */
export async function uploadAvatar(
  formData: FormData,
): Promise<ActionResult<{ avatarUrl: string }>> {
  const user = await requireUser();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choose a photo to upload.' };
  }
  if (!file.type.startsWith('image/')) return { ok: false, error: PHOTO_TYPES };

  const limited = await hit(LIMITS.avatar, user.id);
  if (!limited.allowed) return { ok: false, error: retryMessage(limited) };

  const store = mediaStore();
  const stored = await store.put(file, { scope: `avatar-${user.id}` });
  if (!stored.ok) return { ok: false, error: stored.error };

  if (!stored.media.contentType.startsWith('image/')) {
    await store.remove(stored.media.id);
    return { ok: false, error: PHOTO_TYPES };
  }

  const users = await collections.users();
  const previous = await users.findOne({ _id: user.id }, { projection: { avatarMediaId: 1 } });

  await users.updateOne(
    { _id: user.id },
    {
      $set: {
        avatarUrl: stored.media.url,
        avatarMediaId: stored.media.id,
        updatedAt: new Date().toISOString(),
      },
    },
  );

  if (previous?.avatarMediaId && previous.avatarMediaId !== stored.media.id) {
    await store.remove(previous.avatarMediaId);
  }

  revalidatePath('/account', 'layout');
  return { ok: true, data: { avatarUrl: stored.media.url } };
}

/** Back to initials. The stored file goes too: nothing else points at it. */
export async function removeAvatar(): Promise<ActionResult> {
  const user = await requireUser();

  const users = await collections.users();
  const previous = await users.findOne({ _id: user.id }, { projection: { avatarMediaId: 1 } });

  await users.updateOne(
    { _id: user.id },
    { $set: { avatarUrl: null, avatarMediaId: null, updatedAt: new Date().toISOString() } },
  );
  if (previous?.avatarMediaId) await mediaStore().remove(previous.avatarMediaId);

  revalidatePath('/account', 'layout');
  return { ok: true };
}

const passwordChangeSchema = z.object({
  current: z.string().min(1, 'Enter your current password'),
  // The same rule as sign-up and reset, so the three can never disagree.
  next: passwordSchema,
  confirm: z.string(),
});

/**
 * Change the password.
 *
 * The current password is required even though the session is valid: a
 * session left open on a shared machine must not be enough to lock the owner
 * out of their own account.
 */
export async function changePassword(input: {
  current: string;
  next: string;
  confirm: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = passwordChangeSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  if (parsed.data.next !== parsed.data.confirm) {
    return { ok: false, error: 'The two new passwords do not match.', field: 'confirm' };
  }
  if (parsed.data.next === parsed.data.current) {
    return { ok: false, error: 'Choose a different password from the current one.', field: 'next' };
  }

  // A session left open on a shared machine must not become a way to guess
  // the password it was opened with. Only wrong guesses spend the budget.
  const limited = await peek(LIMITS.passwordChange, user.id);
  if (!limited.allowed) return { ok: false, error: retryMessage(limited) };

  const users = await collections.users();
  const record = await users.findOne({ _id: user.id }, { projection: { passwordHash: 1 } });
  if (!record || !(await verifyPassword(parsed.data.current, record.passwordHash))) {
    await hit(LIMITS.passwordChange, user.id);
    return { ok: false, error: 'That is not your current password.', field: 'current' };
  }

  await users.updateOne(
    { _id: user.id },
    {
      $set: {
        passwordHash: await hashPassword(parsed.data.next),
        updatedAt: new Date().toISOString(),
      },
    },
  );

  return { ok: true };
}

/* ---------------------------------------------------------------- support */

const ticketSchema = z.object({
  category: z
    .string()
    .refine((value) => value in SUPPORT_CATEGORY_LABEL, 'Choose what it is about'),
  subject: z.string().trim().min(6, 'Give it a short subject').max(120, 'Keep the subject short'),
  body: z
    .string()
    .trim()
    .min(20, 'Tell us a little more, at least 20 characters')
    .max(4000, 'That is too long for one message'),
  orderId: z.string().optional().or(z.literal('')),
});

/**
 * Open a support request.
 *
 * The service existed and the agents' side worked, but nothing let a customer
 * start a conversation. A linked order must be the customer's own; the order
 * number is looked up here rather than trusted from the form.
 */
export async function openSupportTicket(input: {
  category: string;
  subject: string;
  body: string;
  orderId?: string;
}): Promise<ActionResult<{ ticketId: string }>> {
  const user = await requireUser();

  const parsed = ticketSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  const limited = await hit(LIMITS.ticket, user.id);
  if (!limited.allowed) return { ok: false, error: retryMessage(limited) };

  let orderNumber: string | null = null;
  const orderId = parsed.data.orderId || null;
  if (orderId) {
    const orders = await collections.orders();
    const order = await orders.findOne(
      { _id: orderId, userId: user.id },
      { projection: { orderNumber: 1 } },
    );
    if (!order) return { ok: false, error: 'That order could not be found.', field: 'orderId' };
    orderNumber = order.orderNumber;
  }

  const ticket = await createTicket({
    userId: user.id,
    requesterName: user.fullName,
    requesterEmail: user.email,
    subject: parsed.data.subject,
    category: parsed.data.category as SupportCategory,
    body: parsed.data.body,
    orderId,
    orderNumber,
  });

  revalidatePath('/account/support');
  return { ok: true, data: { ticketId: ticket.id } };
}