import 'server-only';

import { FINANCE, RETURNS, SHIPPING, gstStateCode } from '@/config/business';
import type { KycDocument, Seller, SellerLocation } from '@/domain/types';
import { entityId } from '@/lib/ids';
import { slugify } from '@/lib/slug';
import { missingDocuments, type SellerApplicationInput } from '@/lib/validation/seller';

import { collections, toEntities, toEntity } from '../db/collections';
import { notifyQuietly } from './notifications';

/**
 * Becoming a seller.
 *
 * The journey is deliberately three separate states rather than one form:
 *
 *   ONBOARDING      the application exists and can still be edited
 *   KYC_SUBMITTED   the seller has handed it to us and can no longer change it
 *   ACTIVE          a reviewer approved it and the console unlocked
 *
 * That middle state is what makes the queue trustworthy. If an applicant could
 * keep editing after submitting, a reviewer would be approving a document set
 * that might not be the one they read.
 */

/* ------------------------------------------------------------------ apply */

export async function applyToSell(
  userId: string,
  input: SellerApplicationInput,
): Promise<{ ok: boolean; error?: string; sellerId?: string }> {
  const users = await collections.users();
  const user = toEntity(await users.findOne({ _id: userId }));
  if (!user) return { ok: false, error: 'Sign in again to apply.' };

  const sellers = await collections.sellers();

  // One store per account. A second application would orphan the first, and
  // the session carries exactly one sellerId.
  const existing = toEntity(await sellers.findOne({ ownerUserId: userId }));
  if (existing) {
    return { ok: false, error: 'You already have a store application on this account.' };
  }

  // The GSTIN must match the state the goods ship from, or the invoices this
  // seller raises will contradict themselves on their face.
  const expectedStateCode = gstStateCode(input.state);
  if (!input.gstin.startsWith(expectedStateCode)) {
    return {
      ok: false,
      error: `That GSTIN starts with ${input.gstin.slice(0, 2)}, which is not the code for ${input.state}. Check the number or the state.`,
    };
  }

  const sellerId = entityId('sel');
  const iso = new Date().toISOString();
  const code = await uniqueSellerCode(input.displayName);
  const slug = await uniqueSlug(input.displayName);

  const plans = await collections.commissionPlans();
  const defaultPlan = toEntity(await plans.findOne({ isDefault: true }));

  const registeredAddress = {
    name: `${input.displayName} Warehouse`,
    contactName: input.accountHolderName,
    phone: input.supportPhone,
    line1: input.addressLine1,
    line2: input.addressLine2 || null,
    city: input.city,
    state: input.state,
    pincode: input.pincode,
    country: 'IN',
  };

  const seller: Seller = {
    id: sellerId,
    code,
    slug,
    slugHistory: [],
    legalName: input.legalName,
    displayName: input.displayName,
    tagline: input.tagline || null,
    about: input.about,
    logoUrl: '',
    bannerUrl: '',
    status: 'ONBOARDING',
    ownerUserId: userId,
    supportEmail: input.supportEmail,
    supportPhone: input.supportPhone,
    kyc: {
      gstin: input.gstin,
      pan: input.pan,
      businessType: input.businessType,
      registeredAddress,
      documents: [],
      verifiedAt: null,
      verifiedByUserId: null,
      rejectionReason: null,
    },
    bank: {
      accountHolderName: input.accountHolderName,
      // Only the last four digits are ever stored in a form that can be
      // rendered; the full number belongs in the payout system, not here.
      accountNumberMasked: `••••${input.accountNumber.slice(-4)}`,
      ifsc: input.ifsc,
      bankName: input.bankName,
      branch: '',
      verified: false,
    },
    commissionPlanId: defaultPlan?.id ?? '',
    approvedCategoryIds: input.categoryIds,
    rating: {
      average: 0,
      count: 0,
      fulfilmentScore: 100,
      cancellationRate: 0,
      returnRate: 0,
      onTimeDispatchRate: 100,
      responseTimeHours: 0,
    },
    policies: {
      returnWindowDays: RETURNS.defaultWindowDays,
      exchangeWindowDays: RETURNS.defaultExchangeWindowDays,
      nonReturnableCategoryIds: [],
      codEnabled: true,
      freeShippingThreshold: SHIPPING.freeShippingThreshold,
      dispatchSlaHours: 24,
      shippingNote: '',
      returnNote: '',
    },
    metrics: {
      productCount: 0,
      liveProductCount: 0,
      orderCount: 0,
      followerCount: 0,
      lifetimeGmv: 0,
    },
    joinedAt: iso,
    approvedAt: null,
    createdAt: iso,
    updatedAt: iso,
  };

  await sellers.insertOne({ ...seller, _id: seller.id });

  // The pickup address is a first-class record, not part of the seller doc:
  // shipments reference it, and a seller can add more later.
  const location: SellerLocation = {
    id: entityId('loc'),
    sellerId,
    name: `${input.displayName} Warehouse`,
    contactName: input.accountHolderName,
    phone: input.supportPhone,
    line1: input.addressLine1,
    line2: input.addressLine2 || null,
    city: input.city,
    state: input.state,
    pincode: input.pincode,
    country: 'IN',
    eshopboxFacilityCode: null,
    isPrimary: true,
    isPickupEnabled: true,
    isReturnAddress: true,
  };

  const locations = await collections.sellerLocations();
  await locations.insertOne({ ...location, _id: location.id });

  /*
   * Give the applicant the SELLER role and bind the store to their account now,
   * not at approval. Without it they cannot reach the onboarding screen to
   * upload their documents — and the console itself stays shut, because every
   * page checks the seller's STATUS, not just the role.
   */
  await users.updateOne(
    { _id: userId },
    { $addToSet: { roles: 'SELLER' }, $set: { sellerId, updatedAt: iso } },
  );

  return { ok: true, sellerId };
}

/* -------------------------------------------------------------- documents */

export async function attachKycDocument(
  sellerId: string,
  document: { type: KycDocument['type']; fileName: string; fileUrl: string },
): Promise<{ ok: boolean; error?: string }> {
  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: sellerId }));
  if (!seller) return { ok: false, error: 'Store not found.' };

  if (seller.status !== 'ONBOARDING' && seller.status !== 'REJECTED') {
    return { ok: false, error: 'Documents cannot be changed while your application is in review.' };
  }

  const record: KycDocument = {
    id: entityId('doc'),
    type: document.type,
    fileName: document.fileName,
    fileUrl: document.fileUrl,
    uploadedAt: new Date().toISOString(),
    status: 'PENDING',
    note: null,
  };

  // Re-uploading a document type REPLACES it. Two GST certificates on one
  // application is a question for the reviewer, not a feature.
  const documents = [
    ...seller.kyc.documents.filter((existing) => existing.type !== document.type),
    record,
  ];

  await sellers.updateOne(
    { _id: sellerId },
    { $set: { 'kyc.documents': documents, updatedAt: new Date().toISOString() } },
  );

  return { ok: true };
}

/* ------------------------------------------------------------- submission */

export async function submitForVerification(
  sellerId: string,
): Promise<{ ok: boolean; error?: string; missing?: string[] }> {
  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: sellerId }));
  if (!seller) return { ok: false, error: 'Store not found.' };

  if (seller.status !== 'ONBOARDING' && seller.status !== 'REJECTED') {
    return { ok: false, error: 'This application has already been submitted.' };
  }

  const missing = missingDocuments(seller.kyc.documents.map((document) => document.type));
  if (missing.length > 0) {
    return { ok: false, error: 'Some documents are still missing.', missing };
  }

  const iso = new Date().toISOString();
  await sellers.updateOne(
    { _id: sellerId },
    { $set: { status: 'KYC_SUBMITTED', 'kyc.rejectionReason': null, updatedAt: iso } },
  );

  const users = await collections.users();
  const reviewers = toEntities(
    await users.find({ roles: { $in: ['ADMIN', 'SUPER_ADMIN', 'OPERATIONS'] } }).limit(5).toArray(),
  );

  for (const reviewer of reviewers) {
    notifyQuietly({
      userId: reviewer.id,
      category: 'ACCOUNT',
      title: 'A seller application is waiting for review',
      body: `${seller.displayName} submitted their KYC documents.`,
      href: '/admin/sellers?status=KYC_SUBMITTED',
      entityType: 'seller',
      entityId: seller.id,
    });
  }

  return { ok: true };
}

/* ------------------------------------------------------------------ reads */

export async function getApplication(userId: string): Promise<Seller | null> {
  const sellers = await collections.sellers();
  return toEntity(await sellers.findOne({ ownerUserId: userId }));
}

/** Categories an applicant may ask to sell in: the leaves of the tree. */
export async function applicableCategories() {
  const categoryCol = await collections.categories();
  const all = toEntities(await categoryCol.find({ isActive: true }).sort({ path: 1 }).toArray());

  return all
    .filter((category) => !all.some((other) => other.parentId === category.id))
    .map((category) => ({
      id: category.id,
      name: category.path.length > 1 ? category.path.join(' › ') : category.name,
    }));
}

/* --------------------------------------------------------------- helpers */

/** A short uppercase code, unique across sellers, used in SKUs and invoices. */
async function uniqueSellerCode(displayName: string): Promise<string> {
  const sellers = await collections.sellers();
  const base = displayName
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 4)
    .toUpperCase()
    .padEnd(4, 'X');

  for (let suffix = 1; suffix < 100; suffix++) {
    const candidate = `${base}${String(suffix).padStart(2, '0')}`;
    if ((await sellers.countDocuments({ code: candidate })) === 0) return candidate;
  }
  // 99 stores with the same four letters is not a naming problem any more.
  return `${base}${Date.now().toString().slice(-2)}`;
}

async function uniqueSlug(displayName: string): Promise<string> {
  const sellers = await collections.sellers();
  const base = slugify(displayName) || 'store';

  if ((await sellers.countDocuments({ slug: base })) === 0) return base;

  for (let suffix = 2; suffix < 50; suffix++) {
    const candidate = `${base}-${suffix}`;
    if ((await sellers.countDocuments({ slug: candidate })) === 0) return candidate;
  }
  return `${base}-${Date.now().toString().slice(-4)}`;
}

/** The commission a new seller starts on, shown during the application. */
export const DEFAULT_COMMISSION_PERCENT = FINANCE.defaultCommissionPercent;
