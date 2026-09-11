'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import {
  bankAccountSchema,
  businessDetailsSchema,
  pickupAddressSchema,
  sellerApplicationSchema,
  storeProfileSchema,
} from '@/lib/validation/seller';

import { refreshSession, requireSellerAccount, requireUser } from '../auth/session';
import { collections, toEntity } from '../db/collections';
import { mediaStore } from '../media/store';
import * as onboarding from '../services/onboarding';

/**
 * Seller onboarding and setup actions.
 *
 * The store is always resolved from the SESSION: an id in an argument never
 * decides whose application or settings are being changed.
 */

export interface OnboardingResult {
  ok: boolean;
  error?: string;
  /** The form field the error belongs to, so it can be shown under that input. */
  field?: string;
}

function firstIssue(error: z.ZodError): OnboardingResult {
  const issue = error.issues[0];
  return {
    ok: false,
    error: issue?.message ?? 'Check the highlighted fields.',
    field: issue?.path[0] !== undefined ? String(issue.path[0]) : undefined,
  };
}

/** The store this user owns, or null. The scope for everything below. */
async function ownStore(userId: string) {
  const sellers = await collections.sellers();
  return toEntity(await sellers.findOne({ ownerUserId: userId }));
}

function refreshSetup() {
  revalidatePath('/seller/settings');
  revalidatePath('/seller');
}

/* ------------------------------------------------------------------ apply */

export async function submitApplication(input: unknown): Promise<OnboardingResult> {
  const user = await requireUser();

  const parsed = sellerApplicationSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  const result = await onboarding.applyToSell(user.id, parsed.data);
  if (!result.ok) return { ok: false, error: result.error, field: result.field };

  revalidatePath('/admin/sellers');

  /*
   * Reissue the token before leaving.
   *
   * `proxy.ts` routes on the roles baked into the session cookie, and this user
   * became a seller a moment ago in the database only. Without this they would
   * be sent away from `/seller/onboarding`, the one screen they now need.
   */
  await refreshSession('SELLER');

  redirect('/seller/onboarding');
}

export async function resubmitApplication(input: unknown): Promise<OnboardingResult> {
  const user = await requireSellerAccount();

  const parsed = sellerApplicationSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  const result = await onboarding.resubmitApplication(user.sellerId, parsed.data);
  if (!result.ok) return result;

  revalidatePath('/seller/onboarding');
  revalidatePath('/admin/sellers');
  return { ok: true };
}

/* ------------------------------------------------------------------ setup */

export async function updateStoreProfile(input: unknown): Promise<OnboardingResult> {
  const user = await requireSellerAccount();
  const parsed = storeProfileSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  const result = await onboarding.updateStoreProfile(user.sellerId, parsed.data);
  if (result.ok) refreshSetup();
  return result;
}

export async function updateBusinessDetails(input: unknown): Promise<OnboardingResult> {
  const user = await requireSellerAccount();
  const parsed = businessDetailsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  const result = await onboarding.updateBusinessDetails(user.sellerId, parsed.data);
  if (result.ok) refreshSetup();
  return result;
}

export async function savePickupAddress(input: unknown): Promise<OnboardingResult> {
  const user = await requireSellerAccount();
  const parsed = pickupAddressSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  const result = await onboarding.savePickupAddress(user.sellerId, parsed.data);
  if (result.ok) refreshSetup();
  return result;
}

export async function saveBankAccount(input: unknown): Promise<OnboardingResult> {
  const user = await requireSellerAccount();
  const parsed = bankAccountSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  const result = await onboarding.saveBankAccount(user.sellerId, parsed.data);
  if (result.ok) refreshSetup();
  return result;
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

  const attached = await onboarding.attachKycDocument(store.id, {
    type: type.data,
    fileName: file.name,
    fileUrl: stored.media.url,
  });

  if (!attached.ok) {
    // Nothing references the bytes if the record could not be written.
    await mediaStore().remove(stored.media.url.split('/').pop() ?? '');
    return { ok: false, error: attached.error };
  }

  revalidatePath('/seller/settings');
  return { ok: true };
}

/**
 * Attach a document the BROWSER already uploaded.
 *
 * The bytes never passed through this process, so they are read back and
 * checked before the URL is recorded: a reviewer has to be looking at a real
 * document.
 */
export async function attachUploadedKycDocument(input: {
  type: string;
  url: string;
  fileName: string;
}): Promise<OnboardingResult> {
  const user = await requireUser();

  const store = await ownStore(user.id);
  if (!store) return { ok: false, error: 'Start your application before uploading documents.' };

  const type = z.enum(DOCUMENT_TYPES).safeParse(input.type);
  if (!type.success) return { ok: false, error: 'That is not a document we ask for.' };

  const { verifyUploaded } = await import('../media/verify');
  const verified = await verifyUploaded(input.url);
  if (!verified.ok) return { ok: false, error: verified.error };

  const attached = await onboarding.attachKycDocument(store.id, {
    type: type.data,
    fileName: input.fileName.slice(0, 120),
    fileUrl: input.url,
  });
  if (!attached.ok) return { ok: false, error: attached.error };

  revalidatePath('/seller/settings');
  return { ok: true };
}
