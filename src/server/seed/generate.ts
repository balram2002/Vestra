import { COLOR_BY_VALUE, SIZE_SCALES, sortSizes } from '@/domain/attributes';
import { defaultNotificationPreferences } from '@/domain/notifications';
import type {
  Address,
  Banner,
  Brand,
  Category,
  Coupon,
  HomeSection,
  Inventory,
  Media,
  Product,
  ProductVariant,
  Review,
  Role,
  Seller,
  SellerLocation,
  ProductStatus,
  User,
  UserRole,
} from '@/domain/types';
import { CATALOG, gstStateCode, INVENTORY, RETURNS, SHIPPING } from '@/config/business';
import { barcode, entityId, skuCode } from '@/lib/ids';
import { toPaise } from '@/lib/money';
import { createRng, type Rng } from '@/lib/random';
import { productSlug, slugify } from '@/lib/slug';

import { ROLE_PERMISSIONS } from '../auth/rbac';
import { altTextFor, hexFor, mediaUrl, shapeForGarment, tileUrl } from './media';
import {
  ARCHETYPES,
  BRANDS,
  CITIES,
  CUSTOMER_NAMES,
  LANDMARKS,
  REVIEW_BODIES,
  REVIEW_TITLES,
  SELLERS,
  STREET_NAMES,
  type ArchetypeSeed,
} from './sources';
import { flattenTaxonomy, leafCategories } from './taxonomy';

/**
 * Catalogue generation.
 *
 * Everything is derived from one fixed seed, so the dataset is identical on
 * every machine and every reseed. That is what makes a screenshot, a test
 * assertion and a bug report reproducible.
 *
 * The generator is pure: it returns entities and writes nothing. Persisting
 * them is `run.ts`, which keeps the shape of the data independent of where it
 * is stored.
 */

const SEED = 20260824;

/** A fixed "today" so relative dates in the dataset do not drift over a demo. */
function daysAgo(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

/* -------------------------------------------------------------- password */

/**
 * Every demo account shares one password. The hash is precomputed because
 * hashing 60 accounts with scrypt at seed time is slow and pointless -- these
 * are not real credentials.
 *
 * Password: vestra123
 */
export const DEMO_PASSWORD = 'vestra123';

/* --------------------------------------------------------------- helpers */

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng.next() * items.length)] as T;
}

function priceIn(rng: Rng, band: [number, number]): number {
  // Skewed towards the lower half: most of a fashion catalogue sits there.
  const spread = band[1] - band[0];
  const roll = Math.min(rng.next(), rng.next());
  const rupees = band[0] + roll * spread;
  // Retail prices land on 99/49/whole hundreds, never on 1247.
  const rounded = Math.round(rupees / 100) * 100;
  return Math.max(band[0], rounded - (rng.bool(0.6) ? 1 : 0));
}

function titleCase(value: string): string {
  return value
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Collapse repeated words in a composed title, keeping the FIRST occurrence so
 * word order still reads naturally. Case-insensitive, and short connectives are
 * left alone so "Kurta Set with Dupatta" survives intact.
 */
const KEEP_DUPLICATES = new Set(['and', 'with', 'the', '&']);

function dedupeWords(value: string): string {
  const seen = new Set<string>();
  return value
    .split(/\s+/)
    .filter((word) => {
      const key = word.toLowerCase();
      if (KEEP_DUPLICATES.has(key)) return true;
      // Measurements repeat legitimately: "18 x 18 in" must not become "18 x in".
      if (/\d/.test(word)) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' ')
    .trim();
}

/* ------------------------------------------------------------------ roles */

export function generateRoles(): Role[] {
  const meta: Record<UserRole, { name: string; description: string }> = {
    CUSTOMER: { name: 'Customer', description: 'Shops on the storefront and manages their own orders.' },
    SELLER: { name: 'Seller', description: 'Owns a store: catalogue, orders, inventory and payouts.' },
    SELLER_STAFF: {
      name: 'Seller staff',
      description: 'Works a store queue without access to finance or store settings.',
    },
    SUPPORT: { name: 'Support', description: 'Handles customer tickets, returns and order lookups.' },
    OPERATIONS: { name: 'Operations', description: 'Runs fulfilment, shipping exceptions and inventory.' },
    FINANCE: { name: 'Finance', description: 'Approves refunds, runs settlements and reconciles payments.' },
    CATALOG_MANAGER: {
      name: 'Catalogue manager',
      description: 'Reviews and approves listings, owns the taxonomy.',
    },
    MARKETING_MANAGER: {
      name: 'Marketing manager',
      description: 'Runs coupons, promotions and the homepage.',
    },
    ADMIN: { name: 'Admin', description: 'Full operational access across the platform.' },
    SUPER_ADMIN: { name: 'Super admin', description: 'Everything, including roles and platform settings.' },
  };

  return (Object.keys(meta) as UserRole[]).map((key) => ({
    id: entityId('rol'),
    key,
    name: meta[key].name,
    description: meta[key].description,
    permissions: ROLE_PERMISSIONS[key],
    system: true,
    userCount: 0,
  }));
}

/* ------------------------------------------------------------- taxonomy */

export function generateCategories(now: Date): Category[] {
  const flat = flattenTaxonomy();
  const idBySlug = new Map<string, string>();
  for (const node of flat) idBySlug.set(node.slug, entityId('cat'));

  return flat.map((node) => ({
    id: idBySlug.get(node.slug)!,
    slug: node.slug,
    slugHistory: [],
    name: node.name,
    path: node.path,
    parentId: node.parentSlug ? (idBySlug.get(node.parentSlug) ?? null) : null,
    depth: node.depth,
    attributeFamily: node.attributeFamily,
    gender: node.gender,
    sizeSystem: node.sizeSystem,
    sizeChart: null,
    description: node.description,
    seoIntro: node.seoIntro ?? null,
    imageUrl: tileUrl('category', node.slug),
    bannerUrl: node.depth === 0 ? tileUrl('banner', node.slug) : null,
    iconKey: node.iconKey,
    position: node.position,
    isActive: true,
    featured: node.featured ?? false,
    productCount: 0,
    taxRatePercent: node.taxRatePercent,
    returnable: node.returnable,
    metaTitle: `${node.name} — Buy ${node.name} Online | Vestra`,
    metaDescription: node.description,
    createdAt: daysAgo(400, now),
    updatedAt: daysAgo(30, now),
  }));
}

export function generateBrands(now: Date): Brand[] {
  return BRANDS.map((seed) => ({
    id: entityId('brd'),
    slug: slugify(seed.name),
    slugHistory: [],
    name: seed.name,
    code: seed.code,
    logoUrl: tileUrl('brand', seed.name),
    bannerUrl: tileUrl('banner', `${seed.name}-brand`),
    description: seed.description,
    originCountry: seed.originCountry,
    foundedYear: seed.foundedYear,
    isPremium: seed.isPremium,
    isActive: true,
    productCount: 0,
    averageRating: 0,
    categoryIds: [],
    metaTitle: `${seed.name} — Shop ${seed.name} Online | Vestra`,
    metaDescription: seed.description.slice(0, 155),
    createdAt: daysAgo(500, now),
    updatedAt: daysAgo(20, now),
  }));
}

/* --------------------------------------------------------------- sellers */

export interface GeneratedSellers {
  sellers: Seller[];
  locations: SellerLocation[];
  owners: User[];
}

export function generateSellers(
  passwordHash: string,
  categoryIds: string[],
  now: Date,
): GeneratedSellers {
  const rng = createRng(`${SEED}-sellers`);
  const sellers: Seller[] = [];
  const locations: SellerLocation[] = [];
  const owners: User[] = [];

  SELLERS.forEach((seed, index) => {
    const sellerId = entityId('sel');
    const ownerId = entityId('usr');
    const handle = slugify(seed.displayName);
    const joined = daysAgo(rng.int(180, 900), now);

    owners.push({
      id: ownerId,
      email: `${slugify(seed.code)}@seller.vestra.test`,
      emailVerified: true,
      phone: `9${rng.int(100000000, 999999999)}`,
      phoneVerified: true,
      fullName: `${seed.displayName} Owner`,
      passwordHash,
      roles: ['SELLER'],
      status: 'ACTIVE',
      avatarUrl: tileUrl('avatar', seed.code),
      gender: 'UNDISCLOSED',
      dateOfBirth: null,
      sellerId,
      createdAt: joined,
      updatedAt: daysAgo(rng.int(1, 20), now),
      lastLoginAt: daysAgo(rng.int(0, 4), now),
      creditBalance: 0,
      preferences: defaultPreferences(),
    });

    // The PAN sits inside the GSTIN, so it is built once and used twice.
    const pan = `${seed.code.slice(0, 3).toUpperCase().padEnd(3, 'A')}P${seed.code.slice(0, 1).toUpperCase()}${rng.int(1000, 9999)}K`;

    const registeredAddress = {
      name: `${seed.displayName} Warehouse`,
      contactName: `${seed.displayName} Dispatch`,
      phone: `9${rng.int(100000000, 999999999)}`,
      line1: `${rng.int(1, 240)}, ${pick(rng, STREET_NAMES)}`,
      line2: `${seed.city} Industrial Area`,
      city: seed.city,
      state: seed.state,
      pincode: seed.pincode,
      country: 'India',
    };

    locations.push({
      id: entityId('loc'),
      sellerId,
      ...registeredAddress,
      eshopboxFacilityCode: `ESB-${seed.code}`,
      isPrimary: true,
      isPickupEnabled: true,
      isReturnAddress: true,
    });

    const fulfilment = rng.int(82, 99);

    sellers.push({
      id: sellerId,
      code: seed.code,
      slug: handle,
      slugHistory: [],
      legalName: seed.legalName,
      displayName: seed.displayName,
      tagline: seed.tagline,
      about: seed.about,
      logoUrl: tileUrl('brand', seed.displayName),
      bannerUrl: tileUrl('banner', `${seed.displayName}-store`),
      status: 'ACTIVE',
      ownerUserId: ownerId,
      supportEmail: `support@${handle}.example`,
      supportPhone: `1800${rng.int(100000, 999999)}`,
      kyc: {
        // A GSTIN is <state code><PAN><entity no>Z<check>, so it embeds the PAN
        // and the state it is registered in. Generating the three independently
        // produced documents that contradict themselves on their face.
        gstin: `${gstStateCode(registeredAddress.state)}${pan}${rng.int(1, 9)}Z${rng.int(1, 9)}`,
        pan,
        businessType: pick(rng, ['PRIVATE_LIMITED', 'LLP', 'PROPRIETORSHIP'] as const),
        registeredAddress,
        documents: [
          {
            id: entityId('doc'),
            type: 'GST_CERTIFICATE',
            fileName: `${seed.code}-gst.pdf`,
            fileUrl: `/api/media/t/document/bone/${seed.code}-gst.svg`,
            uploadedAt: joined,
            status: 'VERIFIED',
            note: null,
          },
          {
            id: entityId('doc'),
            type: 'CANCELLED_CHEQUE',
            fileName: `${seed.code}-cheque.pdf`,
            fileUrl: `/api/media/t/document/bone/${seed.code}-cheque.svg`,
            uploadedAt: joined,
            status: 'VERIFIED',
            note: null,
          },
        ],
        verifiedAt: joined,
        verifiedByUserId: null,
        rejectionReason: null,
      },
      bank: {
        accountHolderName: seed.legalName,
        accountNumberMasked: `XXXXXX${rng.int(1000, 9999)}`,
        ifsc: `HDFC000${rng.int(1000, 9999)}`,
        bankName: pick(rng, ['HDFC Bank', 'ICICI Bank', 'Axis Bank', 'State Bank of India']),
        branch: seed.city,
        verified: true,
      },
      commissionPlanId: '',
      approvedCategoryIds: categoryIds,
      rating: {
        average: rng.float(3.8, 4.9, 1),
        count: rng.int(120, 4800),
        fulfilmentScore: fulfilment,
        cancellationRate: rng.float(0.2, 3.4, 1),
        returnRate: rng.float(3, 14, 1),
        onTimeDispatchRate: rng.float(88, 99.5, 1),
        responseTimeHours: rng.float(0.5, 8, 1),
      },
      policies: {
        returnWindowDays: seed.isFlagship ? 30 : RETURNS.defaultWindowDays,
        exchangeWindowDays: RETURNS.defaultExchangeWindowDays,
        nonReturnableCategoryIds: [],
        codEnabled: rng.bool(0.8),
        freeShippingThreshold: rng.bool(0.5) ? toPaise(999) : SHIPPING.freeShippingThreshold,
        dispatchSlaHours: seed.isFlagship ? 24 : 48,
        shippingNote:
          'Dispatched within one working day. Delivery estimates are calculated from your pincode at checkout.',
        returnNote:
          'Returns accepted on unworn items with tags intact. Reverse pickup is free where we are liable.',
      },
      metrics: {
        productCount: 0,
        liveProductCount: 0,
        orderCount: rng.int(400, 12000),
        followerCount: rng.int(200, 26000),
        lifetimeGmv: toPaise(rng.int(1200000, 68000000)),
      },
      joinedAt: joined,
      approvedAt: joined,
      createdAt: joined,
      updatedAt: daysAgo(rng.int(1, 15), now),
    });

    void index;
  });

  return { sellers, locations, owners };
}

function defaultPreferences() {
  /*
   * Every category, from the one shared definition. The list used to be
   * written out here and was missing FINANCE, SYSTEM and CATALOG, so seeded
   * sellers had no recorded preference for their own payouts.
   */
  const notifications = defaultNotificationPreferences();

  return {
    notifications,
    marketingOptIn: false,
    theme: 'system' as const,
    preferredSizes: {},
    language: 'en-IN',
    currency: 'INR',
  };
}

/* ----------------------------------------------------------------- users */

export interface GeneratedCustomers {
  customers: User[];
  addresses: Address[];
}

export function generateCustomers(passwordHash: string, now: Date): GeneratedCustomers {
  const rng = createRng(`${SEED}-customers`);
  const customers: User[] = [];
  const addresses: Address[] = [];

  CUSTOMER_NAMES.forEach((fullName, index) => {
    const userId = entityId('usr');
    const handle = slugify(fullName).replace(/-/g, '.');
    const joined = daysAgo(rng.int(10, 720), now);

    customers.push({
      id: userId,
      email: `${handle}@example.com`,
      emailVerified: rng.bool(0.9),
      phone: `9${rng.int(100000000, 999999999)}`,
      phoneVerified: rng.bool(0.85),
      fullName,
      passwordHash,
      roles: ['CUSTOMER'],
      status: 'ACTIVE',
      avatarUrl: rng.bool(0.4) ? tileUrl('avatar', fullName) : null,
      gender: pick(rng, ['MALE', 'FEMALE', 'UNDISCLOSED'] as const),
      dateOfBirth: null,
      sellerId: null,
      createdAt: joined,
      updatedAt: daysAgo(rng.int(0, 30), now),
      lastLoginAt: daysAgo(rng.int(0, 25), now),
      creditBalance: rng.bool(0.15) ? toPaise(rng.int(100, 2500)) : 0,
      preferences: defaultPreferences(),
    });

    // One or two addresses each; the first is the default.
    const addressCount = rng.bool(0.35) ? 2 : 1;
    for (let a = 0; a < addressCount; a++) {
      const place = pick(rng, CITIES);
      addresses.push({
        id: entityId('adr'),
        userId,
        label: a === 0 ? 'HOME' : 'WORK',
        fullName,
        phone: `9${rng.int(100000000, 999999999)}`,
        alternatePhone: null,
        line1: `${rng.int(1, 320)}, ${pick(rng, STREET_NAMES)}`,
        line2: rng.bool(0.6) ? `Flat ${rng.int(101, 1204)}` : null,
        landmark: rng.bool(0.5) ? pick(rng, LANDMARKS) : null,
        city: place.city,
        state: place.state,
        pincode: String(Number(place.pincode) + rng.int(0, 60)).padStart(6, '0'),
        country: 'India',
        isDefault: a === 0,
        isBillingDefault: a === 0,
        createdAt: joined,
        updatedAt: joined,
      });
    }

    void index;
  });

  return { customers, addresses };
}

/** The staff accounts that make each console explorable. */
export function generateStaff(passwordHash: string, now: Date): User[] {
  const staff: Array<{ name: string; email: string; roles: UserRole[] }> = [
    { name: 'Nikhil Ranganathan', email: 'superadmin@vestra.test', roles: ['SUPER_ADMIN'] },
    { name: 'Priyanka Vaidya', email: 'admin@vestra.test', roles: ['ADMIN'] },
    { name: 'Suresh Balakrishnan', email: 'ops@vestra.test', roles: ['OPERATIONS'] },
    { name: 'Ritu Aggarwal', email: 'finance@vestra.test', roles: ['FINANCE'] },
    { name: 'Deepak Rawal', email: 'support@vestra.test', roles: ['SUPPORT'] },
    { name: 'Ayesha Siddiqui', email: 'catalog@vestra.test', roles: ['CATALOG_MANAGER'] },
    { name: 'Mihir Chakraborty', email: 'marketing@vestra.test', roles: ['MARKETING_MANAGER'] },
  ];

  return staff.map((person) => ({
    id: entityId('usr'),
    email: person.email,
    emailVerified: true,
    phone: null,
    phoneVerified: false,
    fullName: person.name,
    passwordHash,
    roles: person.roles,
    status: 'ACTIVE' as const,
    avatarUrl: tileUrl('avatar', person.name),
    gender: 'UNDISCLOSED' as const,
    dateOfBirth: null,
    sellerId: null,
    createdAt: daysAgo(600, now),
    updatedAt: daysAgo(5, now),
    lastLoginAt: daysAgo(1, now),
    creditBalance: 0,
    preferences: defaultPreferences(),
  }));
}

/* -------------------------------------------------------------- products */

interface ProductContext {
  categories: Category[];
  brands: Brand[];
  sellers: Seller[];
}

export function generateProducts(ctx: ProductContext, now: Date): Product[] {
  const rng = createRng(`${SEED}-products`);
  const products: Product[] = [];

  const leaves = leafCategories();
  const categoryBySlug = new Map(ctx.categories.map((c) => [c.slug, c]));
  const brandByCode = new Map(ctx.brands.map((b) => [b.code, b]));

  // Which stores can serve which archetype, via the brands they carry.
  const sellersByBrandCode = new Map<string, Seller[]>();
  SELLERS.forEach((seed, index) => {
    const seller = ctx.sellers[index];
    if (!seller) return;
    for (const code of seed.brandCodes) {
      const list = sellersByBrandCode.get(code) ?? [];
      list.push(seller);
      sellersByBrandCode.set(code, list);
    }
  });

  /**
   * Which labels plausibly make this kind of product.
   *
   * A brand qualifies only if it declares the leaf in `sells` AND some store
   * actually carries it. Both halves matter: the first keeps a denim house out
   * of the wallet aisle, the second stops a product being generated for a brand
   * that no seller stocks, which would render an unreachable listing.
   */
  const brandCodesForCategory = (categorySlug: string): string[] =>
    BRANDS.filter(
      (brand) =>
        brand.sells.includes(categorySlug) && (sellersByBrandCode.get(brand.code)?.length ?? 0) > 0,
    ).map((brand) => brand.code);

  for (const leaf of leaves) {
    const category = categoryBySlug.get(leaf.slug);
    if (!category) continue;

    const archetypes = ARCHETYPES.filter((a) => a.category === leaf.slug);
    if (archetypes.length === 0) continue;

    const candidateCodes = brandCodesForCategory(leaf.slug);
    if (candidateCodes.length === 0) {
      // A shelf with no label behind it would render as a permanently empty
      // category. Fail loudly at seed time rather than shipping a dead page.
      throw new Error(
        `[vestra:seed] no brand declares "${leaf.slug}" in its \`sells\` list. ` +
          `Add it to a brand in seed/sources.ts, or remove the archetype.`,
      );
    }

    // Enough per leaf that pagination, facets and sorting all have work to do.
    const targetCount = rng.int(18, 34);

    for (let i = 0; i < targetCount; i++) {
      const archetype = pick(rng, archetypes);
      const brandCode = pick(rng, candidateCodes);
      const brand = brandByCode.get(brandCode);
      const sellerPool = sellersByBrandCode.get(brandCode) ?? ctx.sellers;
      const seller = pick(rng, sellerPool);
      if (!brand || !seller) continue;

      products.push(buildProduct({ rng, archetype, category, brand, seller, now }));
    }
  }

  return products;
}

interface BuildProductArgs {
  rng: Rng;
  archetype: ArchetypeSeed;
  category: Category;
  brand: Brand;
  seller: Seller;
  now: Date;
}

function buildProduct({ rng, archetype, category, brand, seller, now }: BuildProductArgs): Product {
  const id = entityId('prd');
  const pattern = pick(rng, archetype.patterns);
  const fabric = pick(rng, archetype.fabrics);
  const silhouette = pick(rng, archetype.silhouettes);

  // How fashion retail actually names a style. Parts are deduplicated because
  // some archetypes carry the product form in `silhouettes` as well as in
  // `garment` (beauty especially), which would otherwise yield "Face Serum Serum".
  const title = titleCase(
    dedupeWords([brand.name, pattern, fabric, silhouette, archetype.garment].join(' ')),
  );

  const styleCode = `${brand.code}${rng.int(10000, 99999)}`;
  const shape = shapeForGarment(archetype.garment);

  const scale = SIZE_SCALES[category.sizeSystem] ?? SIZE_SCALES.ALPHA;
  // A real listing carries a run of consecutive sizes, not a random scatter.
  const sizeStart = rng.int(0, Math.max(0, scale.sizes.length - 4));
  const sizeCount = Math.min(scale.sizes.length - sizeStart, rng.int(3, 6));
  const sizes = scale.sizes.slice(sizeStart, sizeStart + sizeCount);

  const colorCount = rng.int(1, Math.min(4, archetype.colors.length));
  const colors = rng.pickMany(archetype.colors, colorCount);

  const basePrice = priceIn(rng, archetype.price);
  const discountPercent = rng.weighted([
    [0, 22],
    [10, 14],
    [20, 20],
    [30, 18],
    [40, 14],
    [50, 8],
    [60, 4],
  ]);

  const publishedDaysAgo = rng.int(1, 300);
  const publishedAt = daysAgo(publishedDaysAgo, now);

  const listingStatus = rng.weighted<ProductStatus>([
    ['PUBLISHED', 88],
    ['PENDING_REVIEW', 4],
    ['DRAFT', 3],
    ['REJECTED', 2],
    ['UNPUBLISHED', 2],
    ['ARCHIVED', 1],
  ]);
  const isLive = listingStatus === 'PUBLISHED';
  const wasReviewed = isLive || listingStatus === 'REJECTED' || listingStatus === 'UNPUBLISHED';

  /* ------------------------------------------------------------ variants */

  const media: Media[] = [];
  const variants: ProductVariant[] = [];
  let position = 0;

  colors.forEach((color, colorIndex) => {
    const def = COLOR_BY_VALUE.get(color);
    const colorLabel = def?.label ?? titleCase(color);
    const colorHex = hexFor(color);

    // Gallery: several angles per colour, primary shot first.
    const shotCount = colorIndex === 0 ? rng.int(4, 6) : rng.int(2, 3);
    const colorMedia: Media[] = [];

    for (let view = 0; view < shotCount; view++) {
      const asset: Media = {
        id: entityId('med'),
        kind: 'IMAGE',
        url: mediaUrl({ shape, color, view, key: `${styleCode}-${color}` }),
        thumbnailUrl: mediaUrl({ shape, color, view, key: `${styleCode}-${color}` }),
        alt: altTextFor(title, colorLabel, view),
        width: 900,
        height: 1200,
        position: position++,
        variantId: null,
      };
      colorMedia.push(asset);
      media.push(asset);
    }

    // Per-colour price drift: a colour that costs more to dye costs more.
    const colorPremium = colorIndex === 0 ? 0 : rng.int(0, 200);
    const sellingRupees = basePrice + colorPremium;
    const sellingPrice = toPaise(sellingRupees);
    const mrp =
      discountPercent > 0
        ? toPaise(Math.round(sellingRupees / (1 - discountPercent / 100) / 10) * 10)
        : sellingPrice;

    sizes.forEach((size, sizeIndex) => {
      const variantId = entityId('var');

      // Stock follows demand: middle sizes sell out, ends linger.
      const middleness = 1 - Math.abs(sizeIndex - (sizes.length - 1) / 2) / ((sizes.length + 1) / 2);
      const stockRoll = rng.next();
      let available: number;
      if (stockRoll < 0.07) {
        available = 0; // genuinely sold out
      } else if (stockRoll < 0.18) {
        available = rng.int(1, INVENTORY.urgencyThreshold);
      } else {
        available = Math.round(rng.int(8, 90) * (0.5 + middleness * 0.9));
      }

      const inventory: Inventory = {
        variantId,
        available,
        reserved: available > 0 ? rng.int(0, 3) : 0,
        sold: rng.int(0, 340),
        returned: rng.int(0, 22),
        damaged: rng.int(0, 4),
        lowStockThreshold: INVENTORY.defaultLowStockThreshold,
        restockEta: available === 0 && rng.bool(0.5) ? daysAgo(-rng.int(3, 21), now) : null,
        updatedAt: daysAgo(rng.int(0, 12), now),
      };

      variants.push({
        id: variantId,
        productId: id,
        sku: `${styleCode}-${slugify(color).toUpperCase()}-${slugify(size).toUpperCase()}-${rng.int(100, 999)}`,
        sellerSku: skuCode(brand.code, styleCode, size, color.slice(0, 3)),
        barcode: barcode(rng.int(1, 99_999_999)),
        size,
        color,
        colorLabel,
        colorHex,
        mrp,
        sellingPrice,
        costPrice: Math.round(sellingPrice * rng.float(0.35, 0.62)),
        inventory,
        media: colorMedia,
        weightGrams: rng.int(archetype.weight[0], archetype.weight[1]),
        dimensionsCm: {
          length: rng.int(20, 40),
          width: rng.int(18, 32),
          height: rng.int(3, 12),
        },
        isActive: true,
      });
    });
  });

  /* -------------------------------------------------------------- rating */

  const ratingCount = rng.int(0, 900);
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (let i = 0; i < ratingCount; i++) {
    // Real review distributions are J-shaped: mostly 5s, a tail of 1s.
    const star = rng.weighted([
      [5, 58],
      [4, 22],
      [3, 9],
      [2, 5],
      [1, 6],
    ]);
    distribution[star - 1] += 1;
  }
  const ratingTotal = distribution.reduce((sum, count, index) => sum + count * (index + 1), 0);
  const average = ratingCount > 0 ? Number((ratingTotal / ratingCount).toFixed(1)) : 0;

  /* --------------------------------------------------------- derivations */

  const prices = variants.map((v) => v.sellingPrice);
  const mrps = variants.map((v) => v.mrp);
  /*
   * Sales follow a long tail, not a uniform spread. Drawing uniformly from
   * 0..260 put almost every product over the bestseller threshold, so the badge
   * appeared on every tile and stopped meaning anything. Roughly: two thirds of
   * a catalogue barely moves, a quarter sells steadily, and a handful carry the
   * category.
   */
  const salesBand = rng.weighted([
    ['slow', 62],
    ['steady', 27],
    ['strong', 8],
    ['hit', 3],
  ]);
  const unitsSold30d =
    salesBand === 'slow'
      ? rng.int(0, 18)
      : salesBand === 'steady'
        ? rng.int(19, 55)
        : salesBand === 'strong'
          ? rng.int(60, 140)
          : rng.int(150, 420);

  const sortedSizes = sortSizes(sizes, category.sizeSystem);
  const colorOptions = Array.from(new Set(variants.map((v) => v.color)));

  return {
    id,
    slug: productSlug(title, id),
    slugHistory: [],
    title,
    styleCode,
    brandId: brand.id,
    sellerId: seller.id,
    categoryId: category.id,
    categoryPath: category.path,
    gender: category.gender ?? 'UNISEX',
    /*
     * Not everything is live. A catalogue where every listing is PUBLISHED
     * leaves the moderation queue permanently empty, so the review screen
     * cannot be judged and the approve path is never exercised.
     */
    status: listingStatus,

    description: buildDescription(archetype, fabric, pattern, silhouette, brand.name),
    highlights: archetype.highlights,
    attributes: {
      fabric,
      pattern,
      fit: silhouette,
      occasion: pick(rng, archetype.occasions),
      sleeve: rng.bool(0.5) ? 'Full Sleeve' : 'Half Sleeve',
      wash: 'Machine wash',
    },
    specifications: [
      { label: 'Fabric', value: fabric },
      { label: 'Pattern', value: pattern },
      { label: 'Fit', value: silhouette },
      { label: 'Occasion', value: pick(rng, archetype.occasions) },
      { label: 'Style code', value: styleCode },
      { label: 'Country of origin', value: 'India' },
    ],
    careInstructions: archetype.care,
    countryOfOrigin: 'India',
    manufacturerName: seller.legalName,
    manufacturerAddress: `${seller.kyc.registeredAddress.line1}, ${seller.kyc.registeredAddress.city}, ${seller.kyc.registeredAddress.state} ${seller.kyc.registeredAddress.pincode}`,
    packerName: seller.legalName,
    netQuantity: '1 N',

    media,
    variants,
    colorOptions,
    sizeOptions: sortedSizes,
    sizeSystem: category.sizeSystem,
    sizeChart: null,
    modelNote:
      shape === 'shoe' || shape === 'sneaker' || shape === 'bag' || shape === 'jewellery'
        ? null
        : `Model is ${rng.int(5, 5)}'${rng.int(4, 11)}" and wears a size ${sortedSizes[Math.floor(sortedSizes.length / 2)] ?? 'M'}`,

    priceRange: {
      minSellingPrice: Math.min(...prices),
      maxSellingPrice: Math.max(...prices),
      minMrp: Math.min(...mrps),
      maxMrp: Math.max(...mrps),
    },
    maxDiscountPercent: discountPercent,

    taxRatePercent: category.taxRatePercent,
    hsnCode: String(6100 + rng.int(1, 99)),

    rating: {
      average,
      count: ratingCount,
      distribution,
      fitTrueToSizePercent: ratingCount > 20 ? rng.int(58, 94) : null,
    },
    stats: {
      views30d: Math.round(unitsSold30d * rng.int(28, 90) + rng.int(20, 900)),
      addToBag30d: rng.int(2, 1400),
      unitsSold30d,
      unitsSoldLifetime: unitsSold30d * rng.int(2, 14),
      wishlistCount: rng.int(0, 2600),
      returnRate: rng.float(1, 18, 1),
      conversionRate: rng.float(0.4, 7.5, 2),
    },

    returnable: category.returnable,
    returnWindowDays: category.returnable ? seller.policies.returnWindowDays : 0,
    exchangeable: category.returnable && rng.bool(0.85),
    codAvailable: seller.policies.codEnabled && rng.bool(0.9),
    warrantyMonths: shape === 'bag' || shape === 'shoe' ? rng.int(3, 12) : null,

    submittedAt: listingStatus === 'DRAFT' ? null : publishedAt,
    approvedAt: wasReviewed ? publishedAt : null,
    approvedByUserId: null,
    rejectionReason:
      listingStatus === 'REJECTED'
        ? 'Product images do not show the garment on a plain background as our catalogue guidelines require.'
        : null,
    publishedAt: isLive ? publishedAt : null,
    createdAt: daysAgo(publishedDaysAgo + rng.int(1, 20), now),
    updatedAt: daysAgo(rng.int(0, 40), now),

    metaTitle: `${title} — Buy Online at Vestra`,
    metaDescription: `${title}. ${archetype.highlights[0]}. Free delivery above ₹1,199, ${category.returnable ? `${seller.policies.returnWindowDays}-day returns` : 'non-returnable'}.`,

    tags: [
      slugify(fabric),
      slugify(pattern),
      slugify(silhouette),
      slugify(archetype.garment),
      slugify(brand.name),
    ],
    isSponsored: rng.bool(0.06),
  };
}

function buildDescription(
  archetype: ArchetypeSeed,
  fabric: string,
  pattern: string,
  silhouette: string,
  brandName: string,
): string {
  return [
    `A ${silhouette.toLowerCase()} ${archetype.garment.toLowerCase()} from ${brandName}, cut in ${fabric.toLowerCase()} with a ${pattern.toLowerCase()} treatment.`,
    archetype.highlights.map((h) => h.charAt(0).toLowerCase() + h.slice(1)).join(', ') + '.',
    `Suited to ${archetype.occasions.map((o) => o.toLowerCase()).join(', ')} wear. ${archetype.care[0]}.`,
  ].join('\n\n');
}

/* --------------------------------------------------------------- reviews */

export function generateReviews(products: Product[], customers: User[], now: Date): Review[] {
  const rng = createRng(`${SEED}-reviews`);
  const reviews: Review[] = [];

  for (const product of products) {
    // Only write as many review documents as the product claims to have, capped
    // so the collection stays a sensible size for a demo dataset.
    const target = Math.min(product.rating.count, rng.int(0, 14));
    if (target === 0) continue;

    const authors = rng.pickMany(customers, target);

    for (const author of authors) {
      const star = rng.weighted([
        [5, 58],
        [4, 22],
        [3, 9],
        [2, 5],
        [1, 6],
      ]);

      const bodies = REVIEW_BODIES[star] ?? REVIEW_BODIES[5]!;
      const titles = REVIEW_TITLES[star] ?? REVIEW_TITLES[5]!;
      const createdAt = daysAgo(rng.int(1, 240), now);

      reviews.push({
        id: entityId('rev'),
        productId: product.id,
        variantId: null,
        sellerId: product.sellerId,
        userId: author.id,
        authorName: author.fullName,
        authorAvatarUrl: author.avatarUrl,
        orderItemId: null,
        verifiedPurchase: rng.bool(0.82),
        rating: star,
        title: pick(rng, titles),
        body: pick(rng, bodies),
        images: [],
        fitFeedback: rng.weighted([
          ['TRUE_TO_SIZE', 62],
          ['TOO_SMALL', 20],
          ['TOO_LARGE', 18],
        ]),
        sizePurchased: pick(rng, product.sizeOptions),
        status: 'PUBLISHED',
        helpfulCount: rng.int(0, 180),
        notHelpfulCount: rng.int(0, 24),
        reportCount: 0,
        response:
          star <= 2 && rng.bool(0.6)
            ? {
                body: 'We are sorry this fell short. Our team has reached out on your registered number to arrange a replacement or a full refund, whichever you prefer.',
                byName: 'Seller Support',
                respondedAt: daysAgo(rng.int(0, 30), now),
              }
            : null,
        moderationNote: null,
        moderatedByUserId: null,
        createdAt,
        updatedAt: createdAt,
      });
    }
  }

  return reviews;
}

/* --------------------------------------------------------------- coupons */

export function generateCoupons(
  categories: Category[],
  sellers: Seller[],
  createdByUserId: string,
  now: Date,
): Coupon[] {
  const women = categories.find((c) => c.slug === 'women');
  const flagship = sellers[0];

  const base = {
    categoryIds: [] as string[],
    brandIds: [] as string[],
    sellerIds: [] as string[],
    productIds: [] as string[],
    excludedProductIds: [] as string[],
    segmentKey: null,
    paymentMethods: [] as never[],
    usedCount: 0,
    isActive: true,
    stackableWithOffers: false,
    visible: true,
    createdByUserId,
    createdAt: daysAgo(60, now),
    updatedAt: daysAgo(3, now),
    buyXGetY: null,
  };

  return [
    {
      ...base,
      id: entityId('cpn'),
      code: 'WELCOME15',
      title: '15% off your first order',
      description: 'Flat 15% off for new customers, up to ₹500.',
      type: 'PERCENTAGE',
      scope: 'PLATFORM',
      value: 15,
      maxDiscount: toPaise(500),
      minCartValue: toPaise(999),
      audience: 'NEW_CUSTOMER',
      totalUsageLimit: null,
      perUserLimit: 1,
      startsAt: daysAgo(90, now),
      endsAt: daysAgo(-180, now),
      termsAndConditions: [
        'Valid on your first order only.',
        'Minimum order value ₹999 after other discounts.',
        'Maximum discount ₹500.',
        'Cannot be combined with another coupon.',
      ],
    },
    {
      ...base,
      id: entityId('cpn'),
      code: 'VESTRA500',
      title: '₹500 off above ₹2,999',
      description: 'Flat ₹500 off on orders above ₹2,999.',
      type: 'FIXED',
      scope: 'PLATFORM',
      value: toPaise(500),
      maxDiscount: null,
      minCartValue: toPaise(2999),
      audience: 'ALL',
      totalUsageLimit: 5000,
      perUserLimit: 2,
      startsAt: daysAgo(30, now),
      endsAt: daysAgo(-45, now),
      termsAndConditions: [
        'Minimum order value ₹2,999.',
        'Valid twice per account.',
        'Not valid on beauty and fragrance.',
      ],
    },
    {
      ...base,
      id: entityId('cpn'),
      code: 'ETHNIC20',
      title: '20% off ethnic wear',
      description: '20% off across kurtas, sarees and lehengas, up to ₹1,500.',
      type: 'PERCENTAGE',
      scope: 'CATEGORY',
      value: 20,
      maxDiscount: toPaise(1500),
      minCartValue: toPaise(1499),
      categoryIds: women ? [women.id] : [],
      audience: 'ALL',
      totalUsageLimit: 2000,
      perUserLimit: 3,
      startsAt: daysAgo(14, now),
      endsAt: daysAgo(-21, now),
      termsAndConditions: [
        'Applies only to eligible ethnic wear lines.',
        'Maximum discount ₹1,500.',
        'Discount is applied proportionally across eligible items.',
      ],
    },
    {
      ...base,
      id: entityId('cpn'),
      code: 'FREESHIP',
      title: 'Free delivery',
      description: 'Free standard delivery on any order.',
      type: 'FREE_SHIPPING',
      scope: 'PLATFORM',
      value: 0,
      maxDiscount: null,
      minCartValue: 0,
      audience: 'ALL',
      totalUsageLimit: null,
      perUserLimit: 5,
      startsAt: daysAgo(7, now),
      endsAt: daysAgo(-14, now),
      termsAndConditions: ['Applies to standard delivery only.', 'Express delivery is charged as usual.'],
    },
    {
      ...base,
      id: entityId('cpn'),
      code: 'MORA10',
      title: '10% off at Mora Label',
      description: 'Seller-funded 10% off across the Mora Label store.',
      type: 'PERCENTAGE',
      scope: 'SELLER',
      value: 10,
      maxDiscount: toPaise(700),
      minCartValue: toPaise(799),
      sellerIds: flagship ? [flagship.id] : [],
      audience: 'ALL',
      totalUsageLimit: 900,
      perUserLimit: 2,
      startsAt: daysAgo(20, now),
      endsAt: daysAgo(-30, now),
      fundedBy: 'SELLER',
      termsAndConditions: ['Valid only on items sold by Mora Label Official.'],
    },
    {
      ...base,
      id: entityId('cpn'),
      code: 'EXPIRED10',
      title: 'Republic Day sale',
      description: 'An expired coupon, kept so the expiry path is demonstrable.',
      type: 'PERCENTAGE',
      scope: 'PLATFORM',
      value: 10,
      maxDiscount: toPaise(400),
      minCartValue: toPaise(999),
      audience: 'ALL',
      totalUsageLimit: 100,
      perUserLimit: 1,
      startsAt: daysAgo(240, now),
      endsAt: daysAgo(200, now),
      isActive: false,
      visible: false,
      termsAndConditions: ['This offer has ended.'],
    },
  ].map((coupon) => ({ fundedBy: 'PLATFORM' as const, ...coupon })) as Coupon[];
}

/* ---------------------------------------------------------------- content */

export function generateHomeSections(now: Date): HomeSection[] {
  const at = daysAgo(2, now);

  const section = (
    kind: HomeSection['kind'],
    position: number,
    title: string | null,
    subtitle: string | null,
    href: string | null,
    config: HomeSection['config'],
  ): HomeSection => ({
    id: entityId('hsc'),
    kind,
    title,
    subtitle,
    href,
    ctaLabel: href ? 'See all' : null,
    position,
    isActive: true,
    startsAt: null,
    endsAt: null,
    visibleOn: 'ALL',
    config,
    updatedAt: at,
    updatedByUserId: null,
  });

  return [
    section('HERO_CAROUSEL', 0, null, null, null, { limit: 3 }),
    section('CATEGORY_STRIP', 1, 'Shop by category', null, null, { limit: 12 }),
    section('PRODUCT_RAIL', 2, 'New this week', 'Just landed from our stores', '/search?sort=newest', {
      source: 'NEW_ARRIVALS',
      limit: CATALOG.railSize,
    }),
    section('BANNER_GRID', 3, null, null, null, { limit: 4 }),
    section('PRODUCT_RAIL', 4, 'Bestsellers', 'What people keep coming back for', '/search?sort=popular', {
      source: 'BESTSELLERS',
      limit: CATALOG.railSize,
    }),
    section('BRAND_STRIP', 5, 'Labels we stock', null, '/brands', { limit: 12 }),
    section('PRODUCT_RAIL', 6, 'Under ₹1,499', 'Everyday pieces that do not cost the earth', '/search?maxPrice=1499', {
      source: 'DEALS',
      limit: CATALOG.railSize,
    }),
    section('SELLER_SPOTLIGHT', 7, 'Meet the makers', 'Independent stores selling direct', '/stores', {
      limit: 4,
    }),
    section('VALUE_PROPS', 8, null, null, null, {}),
  ];
}

export function generateBanners(now: Date): Banner[] {
  const at = daysAgo(5, now);

  const banners: Array<Omit<Banner, 'id' | 'createdAt' | 'updatedAt' | 'impressions' | 'clicks'>> = [
    {
      name: 'Festive ethnic hero',
      placement: 'HOME_HERO',
      headline: 'The festive edit',
      subheadline: 'Handloom silk, block-printed cotton and hand embroidery, direct from the workshop',
      ctaLabel: 'Shop ethnic wear',
      href: '/category/womens-ethnic-wear',
      imageUrl: tileUrl('hero', 'festive-ethnic', 'mulberry'),
      mobileImageUrl: tileUrl('hero-m', 'festive-ethnic', 'mulberry'),
      alt: 'A hand block-printed cotton anarkali kurta in indigo, photographed on a bone background',
      theme: 'light',
      position: 0,
      isActive: true,
      startsAt: null,
      endsAt: null,
    },
    {
      name: 'Menswear tailoring hero',
      placement: 'HOME_HERO',
      headline: 'Built for a working week',
      subheadline: 'Shirting drafted for a desk and a commute, sized S to 5XL',
      ctaLabel: 'Shop menswear',
      href: '/category/mens-topwear',
      imageUrl: tileUrl('hero', 'menswear-tailoring', 'indigo'),
      mobileImageUrl: tileUrl('hero-m', 'menswear-tailoring', 'indigo'),
      alt: 'A folded stack of oxford cotton shirts in white, sky blue and navy',
      theme: 'dark',
      position: 1,
      isActive: true,
      startsAt: null,
      endsAt: null,
    },
    {
      name: 'Denim hero',
      placement: 'HOME_HERO',
      headline: 'Honest denim',
      subheadline: 'Rope-dyed indigo with the weight, shrinkage and stretch printed on the label',
      ctaLabel: 'Shop denim',
      href: '/category/mens-jeans',
      imageUrl: tileUrl('hero', 'honest-denim', 'navy'),
      mobileImageUrl: tileUrl('hero-m', 'honest-denim', 'navy'),
      alt: 'A pair of rope-dyed selvedge jeans laid flat, showing the selvedge line at the outseam',
      theme: 'dark',
      position: 2,
      isActive: true,
      startsAt: null,
      endsAt: null,
    },
    {
      name: 'Kids grid tile',
      placement: 'HOME_GRID',
      headline: 'Kids, sized generously',
      subheadline: 'GOTS cotton, flat seams, no scratchy labels',
      ctaLabel: 'Shop kids',
      href: '/category/kids',
      imageUrl: tileUrl('grid', 'kids-cotton', 'mint'),
      mobileImageUrl: null,
      alt: 'A child’s cotton romper in mint with wooden press studs',
      theme: 'light',
      position: 0,
      isActive: true,
      startsAt: null,
      endsAt: null,
    },
    {
      name: 'Home grid tile',
      placement: 'HOME_GRID',
      headline: 'Handwoven for the home',
      subheadline: 'Bed linen and throws from looms in Kutch and Panipat',
      ctaLabel: 'Shop home',
      href: '/category/home-and-living',
      imageUrl: tileUrl('grid', 'home-linen', 'beige'),
      mobileImageUrl: null,
      alt: 'A handwoven cotton throw in mustard folded on a bed',
      theme: 'light',
      position: 1,
      isActive: true,
      startsAt: null,
      endsAt: null,
    },
    {
      name: 'Footwear grid tile',
      placement: 'HOME_GRID',
      headline: 'Resoleable, not disposable',
      subheadline: 'Send a worn pair back and we recraft it',
      ctaLabel: 'Shop footwear',
      href: '/category/mens-footwear',
      imageUrl: tileUrl('grid', 'resoleable-shoes', 'coffee'),
      mobileImageUrl: null,
      alt: 'A Goodyear-welted derby shoe in tan leather, showing the stitched welt',
      theme: 'dark',
      position: 2,
      isActive: true,
      startsAt: null,
      endsAt: null,
    },
    {
      name: 'Jewellery grid tile',
      placement: 'HOME_GRID',
      headline: 'Hallmarked, everyday',
      subheadline: 'Recycled silver and gold vermeil, free resizing for a year',
      ctaLabel: 'Shop jewellery',
      href: '/category/jewellery',
      imageUrl: tileUrl('grid', 'fine-jewellery', 'gold'),
      mobileImageUrl: null,
      alt: 'A pair of oxidised silver jhumka earrings on a bone background',
      theme: 'light',
      position: 3,
      isActive: true,
      startsAt: null,
      endsAt: null,
    },
  ];

  return banners.map((banner) => ({
    ...banner,
    id: entityId('bnr'),
    impressions: 0,
    clicks: 0,
    createdAt: at,
    updatedAt: at,
  }));
}
