import 'server-only';

import { FINANCE, RETURNS, SHIPPING, gstStateCode } from '@/config/business';
import type { KycDocument, Seller, SellerLocation } from '@/domain/types';
import { entityId } from '@/lib/ids';
import { slugify } from '@/lib/slug';
import type {
  BankAccountInput,
  BusinessDetailsInput,
  PickupAddressInput,
  SellerApplicationInput,
  StoreProfileInput,
} from '@/lib/validation/seller';

import { collections, toEntities, toEntity } from '../db/collections';
import { invalidate } from './cache-invalidation';
import { tags } from './cache-tags';
import { notifyQuietly } from './notifications';

/**
 * Becoming a seller.
 *
 * Two steps, in this order, and never more at once:
 *
 *   1. APPLY, with business details only: the store's name, the kind of
 *      business behind it, how to reach them, where they are and what they
 *      sell. The application goes straight to the review queue
 *      (KYC_SUBMITTED), and the applicant sees where it stands.
 *   2. SET UP, once approved (ACTIVE): a pickup address before the first
 *      parcel ships, a GSTIN for the invoices, a bank account for the first
 *      payout, documents when verification is due. Each is added in the
 *      console when it is needed, and the dashboard lists what is missing.
 *
 * A rejected application is corrected and sent again from the status screen.
 */

export interface OnboardingOutcome {
  ok: boolean;
  error?: string;
  /** The form field the error belongs to. */
  field?: string;
}

/** The GSTIN's first two digits are the state it is registered in. */
function gstinStateProblem(gstin: string, state: string): string | null {
  if (!gstin || !state) return null;
  const expected = gstStateCode(state);
  return gstin.startsWith(expected)
    ? null
    : `That GSTIN starts with ${gstin.slice(0, 2)}, which is not the code for ${state}. Check the number or the state.`;
}

/** Tell the people who review applications that one is waiting. */
async function tellReviewers(seller: Pick<Seller, 'id' | 'displayName'>, what: string): Promise<void> {
  const users = await collections.users();
  const reviewers = toEntities(
    await users.find({ roles: { $in: ['ADMIN', 'SUPER_ADMIN', 'OPERATIONS'] } }).limit(5).toArray(),
  );

  for (const reviewer of reviewers) {
    notifyQuietly({
      userId: reviewer.id,
      category: 'ACCOUNT',
      title: 'A seller application is waiting for review',
      body: `${seller.displayName} ${what}.`,
      href: `/admin/sellers/${seller.id}`,
      entityType: 'seller',
      entityId: seller.id,
    });
  }
}

/* ------------------------------------------------------------------ apply */

export async function applyToSell(
  userId: string,
  input: SellerApplicationInput,
): Promise<OnboardingOutcome & { sellerId?: string }> {
  const users = await collections.users();
  const user = toEntity(await users.findOne({ _id: userId }));
  if (!user) return { ok: false, error: 'Sign in again to apply.' };

  const sellers = await collections.sellers();

  // One store per account. A second application would orphan the first, and
  // the session carries exactly one sellerId.
  if (await sellers.findOne({ ownerUserId: userId })) {
    return { ok: false, error: 'You already have a store application on this account.' };
  }

  const gstProblem = gstinStateProblem(input.gstin, input.state);
  if (gstProblem) return { ok: false, error: gstProblem, field: 'gstin' };

  const departments = await activeCategories(input.categoryIds);
  if (departments.length === 0) {
    return { ok: false, error: 'Choose at least one thing you sell.', field: 'categoryIds' };
  }

  const sellerId = entityId('sel');
  const iso = new Date().toISOString();
  const code = await uniqueSellerCode(input.displayName);
  const slug = await uniqueSlug(input.displayName);

  const plans = await collections.commissionPlans();
  const defaultPlan = toEntity(await plans.findOne({ isDefault: true }));

  const seller: Seller = {
    id: sellerId,
    code,
    slug,
    slugHistory: [],
    // The registered name arrives with the tax details; the store name stands in.
    legalName: input.displayName,
    displayName: input.displayName,
    tagline: null,
    about: '',
    logoUrl: '',
    bannerUrl: '',
    status: 'KYC_SUBMITTED',
    ownerUserId: userId,
    supportEmail: input.supportEmail,
    supportPhone: input.supportPhone,
    kyc: {
      gstin: input.gstin,
      pan: '',
      businessType: input.businessType,
      // The city and state for now; the street address comes with the pickup address.
      registeredAddress: {
        name: input.displayName,
        contactName: user.fullName,
        phone: input.supportPhone,
        line1: '',
        line2: null,
        city: input.city,
        state: input.state,
        pincode: '',
        country: 'IN',
        latitude: null,
        longitude: null,
      },
      documents: [],
      verifiedAt: null,
      verifiedByUserId: null,
      rejectionReason: null,
    },
    bank: {
      accountHolderName: '',
      accountNumberMasked: '',
      ifsc: '',
      bankName: '',
      branch: '',
      verified: false,
    },
    commissionPlanId: defaultPlan?.id ?? '',
    // Approval covers everything inside the departments chosen.
    approvedCategoryIds: departments.map((category) => category.id),
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

  /*
   * The SELLER role and the store are bound to the account now, not at
   * approval: that is what lets the applicant reach the status screen. The
   * console itself stays shut, because every page checks the store's STATUS.
   */
  await users.updateOne(
    { _id: userId },
    { $addToSet: { roles: 'SELLER' }, $set: { sellerId, updatedAt: iso } },
  );

  await tellReviewers(seller, 'applied to sell');
  return { ok: true, sellerId };
}

/** Correct a rejected application and send it back to the queue. */
export async function resubmitApplication(
  sellerId: string,
  input: SellerApplicationInput,
): Promise<OnboardingOutcome> {
  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: sellerId }));
  if (!seller) return { ok: false, error: 'Store not found.' };

  if (seller.status !== 'REJECTED' && seller.status !== 'ONBOARDING') {
    return { ok: false, error: 'This application is not waiting on you.' };
  }

  const gstProblem = gstinStateProblem(input.gstin, input.state);
  if (gstProblem) return { ok: false, error: gstProblem, field: 'gstin' };

  const departments = await activeCategories(input.categoryIds);
  if (departments.length === 0) {
    return { ok: false, error: 'Choose at least one thing you sell.', field: 'categoryIds' };
  }

  await sellers.updateOne(
    { _id: sellerId },
    {
      $set: {
        displayName: input.displayName,
        legalName: seller.legalName === seller.displayName ? input.displayName : seller.legalName,
        supportEmail: input.supportEmail,
        supportPhone: input.supportPhone,
        'kyc.gstin': input.gstin,
        'kyc.businessType': input.businessType,
        'kyc.registeredAddress.city': input.city,
        'kyc.registeredAddress.state': input.state,
        'kyc.rejectionReason': null,
        approvedCategoryIds: departments.map((category) => category.id),
        status: 'KYC_SUBMITTED',
        updatedAt: new Date().toISOString(),
      },
    },
  );

  await tellReviewers({ id: seller.id, displayName: input.displayName }, 'sent their application again');
  return { ok: true };
}

/* ------------------------------------------------------------------ setup */

export async function updateStoreProfile(
  sellerId: string,
  input: StoreProfileInput,
): Promise<OnboardingOutcome> {
  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: sellerId }));
  if (!seller) return { ok: false, error: 'Store not found.' };

  await sellers.updateOne(
    { _id: sellerId },
    {
      $set: {
        tagline: input.tagline || null,
        about: input.about,
        supportEmail: input.supportEmail,
        supportPhone: input.supportPhone,
        updatedAt: new Date().toISOString(),
      },
    },
  );

  // The store page shows all of this.
  invalidate([tags.seller(seller.slug), tags.sellerList]);
  return { ok: true };
}

export async function updateBusinessDetails(
  sellerId: string,
  input: BusinessDetailsInput,
): Promise<OnboardingOutcome> {
  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: sellerId }));
  if (!seller) return { ok: false, error: 'Store not found.' };

  // Goods ship from the state the GSTIN is registered in, or the invoices
  // contradict themselves on their face.
  const gstProblem = gstinStateProblem(input.gstin, seller.kyc.registeredAddress.state);
  if (gstProblem) return { ok: false, error: gstProblem, field: 'gstin' };

  await sellers.updateOne(
    { _id: sellerId },
    {
      $set: {
        legalName: input.legalName,
        'kyc.businessType': input.businessType,
        'kyc.gstin': input.gstin,
        'kyc.pan': input.pan,
        updatedAt: new Date().toISOString(),
      },
    },
  );

  invalidate([tags.seller(seller.slug)]);
  return { ok: true };
}

export async function savePickupAddress(
  sellerId: string,
  input: PickupAddressInput,
): Promise<OnboardingOutcome> {
  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: sellerId }));
  if (!seller) return { ok: false, error: 'Store not found.' };

  if (seller.kyc.gstin && gstinStateProblem(seller.kyc.gstin, input.state)) {
    return {
      ok: false,
      field: 'state',
      error:
        'Your GSTIN is registered in another state, and goods have to ship from that state. Check the state, or correct the GSTIN under Business and tax.',
    };
  }

  const fields = {
    name: `${seller.displayName} pickup`,
    contactName: input.contactName,
    phone: input.phone,
    line1: input.line1,
    line2: input.line2 || null,
    city: input.city,
    state: input.state,
    pincode: input.pincode,
    country: 'IN',
  };

  const locations = await collections.sellerLocations();
  const primary =
    toEntity(await locations.findOne({ sellerId, isPrimary: true })) ??
    toEntity(await locations.findOne({ sellerId }));

  if (primary) {
    // A moved address has not been placed on the map again yet, and a stale
    // pin would match live calls to the wrong neighbourhood.
    const moved = primary.pincode !== input.pincode || primary.line1 !== input.line1;
    await locations.updateOne(
      { _id: primary.id },
      { $set: { ...fields, ...(moved ? { latitude: null, longitude: null } : {}) } },
    );
  } else {
    const location: SellerLocation = {
      id: entityId('loc'),
      sellerId,
      ...fields,
      latitude: null,
      longitude: null,
      eshopboxFacilityCode: null,
      isPrimary: true,
      isPickupEnabled: true,
      isReturnAddress: true,
    };
    await locations.insertOne({ ...location, _id: location.id });
  }

  // Invoices print the seller's address from here.
  await sellers.updateOne(
    { _id: sellerId },
    {
      $set: {
        'kyc.registeredAddress': { ...fields, latitude: null, longitude: null },
        updatedAt: new Date().toISOString(),
      },
    },
  );

  invalidate([tags.seller(seller.slug)]);
  return { ok: true };
}

export async function saveBankAccount(
  sellerId: string,
  input: BankAccountInput,
): Promise<OnboardingOutcome> {
  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: sellerId }));
  if (!seller) return { ok: false, error: 'Store not found.' };

  await sellers.updateOne(
    { _id: sellerId },
    {
      $set: {
        bank: {
          accountHolderName: input.accountHolderName,
          // Only the last four digits are kept in a form that can be rendered;
          // the full number belongs with the payout provider, not here.
          accountNumberMasked: `••••${input.accountNumber.slice(-4)}`,
          ifsc: input.ifsc,
          bankName: input.bankName,
          branch: '',
          // A changed account is unverified until someone checks it again.
          verified: false,
        },
        updatedAt: new Date().toISOString(),
      },
    },
  );

  return { ok: true };
}

/* -------------------------------------------------------------- documents */

export async function attachKycDocument(
  sellerId: string,
  document: { type: KycDocument['type']; fileName: string; fileUrl: string },
): Promise<OnboardingOutcome> {
  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: sellerId }));
  if (!seller) return { ok: false, error: 'Store not found.' };

  if (seller.status === 'SUSPENDED') {
    return { ok: false, error: 'Documents cannot be changed while your store is suspended.' };
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
  // store is a question for the reviewer, not a feature.
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

/* ------------------------------------------------------------------ reads */

export async function getApplication(userId: string): Promise<Seller | null> {
  const sellers = await collections.sellers();
  return toEntity(await sellers.findOne({ ownerUserId: userId }));
}

/** What an applicant can say they sell: the departments. */
export async function sellableDepartments(): Promise<Array<{ id: string; name: string }>> {
  const categoryCol = await collections.categories();
  const departments = toEntities(
    await categoryCol.find({ isActive: true, depth: 0 }).sort({ position: 1, name: 1 }).toArray(),
  );
  return departments.map((category) => ({ id: category.id, name: category.name }));
}

async function activeCategories(ids: string[]) {
  if (ids.length === 0) return [];
  const categoryCol = await collections.categories();
  return toEntities(await categoryCol.find({ _id: { $in: ids }, isActive: true }).toArray());
}

export interface SetupItem {
  key: 'pickup' | 'gstin' | 'bank' | 'profile';
  label: string;
  why: string;
  href: string;
  done: boolean;
}

/** What an approved store still has to add, each with the reason it matters. */
export async function getSetupChecklist(sellerId: string): Promise<SetupItem[]> {
  const [sellers, locations] = await Promise.all([
    collections.sellers(),
    collections.sellerLocations(),
  ]);
  const [seller, pickups] = await Promise.all([
    sellers.findOne({ _id: sellerId }).then(toEntity),
    locations.countDocuments({ sellerId, isPickupEnabled: true }),
  ]);
  if (!seller) return [];

  return [
    {
      key: 'pickup',
      label: 'Add a pickup address',
      why: 'Couriers collect from it, so your first order cannot ship without one.',
      href: '/seller/settings#pickup',
      done: pickups > 0,
    },
    {
      key: 'gstin',
      label: 'Add your GSTIN',
      why: 'It is printed on the invoice for every order you sell.',
      href: '/seller/settings#business',
      done: Boolean(seller.kyc.gstin),
    },
    {
      key: 'bank',
      label: 'Add a payout account',
      why: 'Your earnings are paid into it once each order clears its return window.',
      href: '/seller/settings#bank',
      done: Boolean(seller.bank.accountNumberMasked),
    },
    {
      key: 'profile',
      label: 'Tell shoppers about your store',
      why: 'A few lines about what you make show on your store page.',
      href: '/seller/settings#profile',
      done: Boolean(seller.about),
    },
  ];
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
