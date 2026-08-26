'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { sellerApplicationSchema } from '@/lib/validation/seller';

import { refreshSession, requireUser } from '../auth/session';
import { collections, toEntity } from '../db/collections';
import { mediaStore } from '../media/store';
import { applyToSell, attachKycDocument, submitForVerification } from '../services/onboarding';

/**
 * Seller onboarding actions.
 *
 * The applicant is always resolved from the SESSION, and every document and
 * submission is scoped to the store that session owns — an id in an argument
 * never decides whose application is being edited.
 */

export interface OnboardingResult {
  ok: boolean;
  error?: string;
  /** Documents still outstanding, when a submission was refused for that. */
  missing?: string[];
}

/** The store this user owns, or null. The scope for everything below. */
async function ownStore(userId: string) {
  const sellers = await collections.sellers();
  return toEntity(await sellers.findOne({ ownerUserId: userId }));
}

/* ------------------------------------------------------------------ apply */

export async function submitApplication(input: unknown): Promise<OnboardingResult> {
  const user = await requireUser();

  const parsed = sellerApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the highlighted fields.' };
  }

  const result = await applyToSell(user.id, parsed.data);
  if (!result.ok) return { ok: false, error: result.error };

  /*
   * Reissue the token before leaving.
   *
   * `proxy.ts` routes on the roles baked into the session cookie, and this user
   * became a seller a millisecond ago in the database only. Without this they
   * would be redirected off `/seller/onboarding` — the one screen they now need
   * — and back to the storefront, with no way out but signing out and in.
   */
  await refreshSession('SELLER');

  redirect('/seller/onboarding');
}

/* -------------------------------------------------------------- documents */

const DOCUMENT_TYPES = [
  'GST_CERTIFICATE',
  'PAN_CARD',
  'CANCELLED_CHEQUE',
  'ADDRESS_PROOF',
  'TRADEMARK',
  'SIGNATURE',
] as const;

export async function uploadKycDocument(formData: FormData): Promise<OnboardingResult> {
  const user = await requireUser();

  const store = await ownStore(user.id);
  if (!store) return { ok: false, error: 'Start your application before uploading documents.' };

  const type = z.enum(DOCUMENT_TYPES).safeParse(formData.get('type'));
  if (!type.success) return { ok: false, error: 'That is not a document we ask for.' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'Choose a file to upload.' };

  // Validated by its BYTES inside the store, not by the name it arrived with.
  const stored = await mediaStore().put(file, { scope: `kyc-${store.id}` });
  if (!stored.ok) return { ok: false, error: stored.error };

  const attached = await attachKycDocument(store.id, {
    type: type.data,
    fileName: file.name,
    fileUrl: stored.media.url,
  });

  if (!attached.ok) {
    // Nothing references the bytes if the record could not be written.
    await mediaStore().remove(stored.media.url.split('/').pop() ?? '');
    return { ok: false, error: attached.error };
  }

  revalidatePath('/seller/onboarding');
  return { ok: true };
}

/* ------------------------------------------------------------- submission */

export async function submitKyc(): Promise<OnboardingResult> {
  const user = await requireUser();

  const store = await ownStore(user.id);
  if (!store) return { ok: false, error: 'Start your application first.' };

  const result = await submitForVerification(store.id);
  if (!result.ok) return { ok: false, error: result.error, missing: result.missing };

  revalidatePath('/seller/onboarding');
  revalidatePath('/admin/sellers');
  return { ok: true };
}
