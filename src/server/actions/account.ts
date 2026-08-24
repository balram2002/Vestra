'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '../auth/session';
import { markAllRead, markRead } from '../services/notifications';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

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
