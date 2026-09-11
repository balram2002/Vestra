/**
 * Site identity and canonical URL construction.
 *
 * Every metadata block, sitemap entry, structured-data node and outbound link
 * resolves its URL through here, so the canonical host is defined exactly once.
 */

/** A value that is really set. A blank variable is how a host leaves one unset. */
function configured(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/*
 * Who runs the shop, and how to reach them.
 *
 * All of it comes from the environment and none of it has an invented default:
 * a support number that rings nobody, or a grievance officer at an address
 * that does not exist, is worse than showing nothing. Every surface that uses
 * one of these leaves it out when it is not set. They are NEXT_PUBLIC_ because
 * the footer and the sign-in screens render them in the browser, so Next
 * inlines them at build time: change one, then redeploy.
 */
const supportEmail = configured(process.env.NEXT_PUBLIC_SUPPORT_EMAIL);

export const siteConfig = {
  name: 'VestraWAB',
  /** The registered business name, on invoices, in the footer and in email. */
  legalName: configured(process.env.NEXT_PUBLIC_LEGAL_NAME) ?? 'VestraWAB',
  /**
   * The parent brand, and the line that names it.
   *
   * Kept as its own field rather than baked into `tagline`, because the two are
   * used in different places: the tagline sells the shop and belongs in a
   * `<title>`, while the attribution establishes who is behind it and belongs in
   * a footer, an auth screen and the foot of every email. Splitting them means
   * neither has to be trimmed to fit the other.
   */
  parent: 'planWAB',
  attribution: 'A product by planWAB',
  tagline: 'Marketplace for modern wardrobes',
  description:
    'VestraWAB is a multi-vendor marketplace for fashion, beauty and lifestyle. Shop verified sellers, transparent pricing, easy returns and fast delivery across India.',
  locale: 'en_IN',
  language: 'en-IN',
  country: 'IN',
  currency: 'INR',
  supportEmail,
  supportPhone: configured(process.env.NEXT_PUBLIC_SUPPORT_PHONE),
  /** When a person answers, e.g. "Mon to Sat, 10am to 7pm IST". */
  supportHours: configured(process.env.NEXT_PUBLIC_SUPPORT_HOURS),
  /** The registered office, on one line. */
  address: configured(process.env.NEXT_PUBLIC_BUSINESS_ADDRESS),
  /**
   * The grievance officer the Consumer Protection (E-Commerce) Rules, 2020
   * require an Indian marketplace to name. The email falls back to support.
   */
  grievanceOfficer: configured(process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER),
  grievanceEmail: configured(process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL) ?? supportEmail,
  /** Only the accounts that exist. One left unset is simply not linked. */
  social: {
    instagram: configured(process.env.NEXT_PUBLIC_INSTAGRAM_URL),
    x: configured(process.env.NEXT_PUBLIC_X_URL),
    facebook: configured(process.env.NEXT_PUBLIC_FACEBOOK_URL),
    youtube: configured(process.env.NEXT_PUBLIC_YOUTUBE_URL),
    linkedin: configured(process.env.NEXT_PUBLIC_LINKEDIN_URL),
  },
} as const;

/**
 * The canonical origin. Set NEXT_PUBLIC_SITE_URL per environment; the localhost
 * fallback keeps development links absolute and valid.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return 'http://localhost:3000';
}

/** Build an absolute URL for canonicals, Open Graph and structured data. */
export function absoluteUrl(path = '/'): string {
  /*
   * Already absolute: hand it back untouched.
   *
   * Media lives on a remote host, so `absoluteUrl(media.url)` is a natural
   * thing to write — and without this it produced
   * `https://vestrawab.example/https://images.example/photo.jpg`, which every
   * social crawler fetched as a 404. Making the function idempotent fixes it
   * for every caller rather than at the one call site where it was noticed.
   */
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;

  /*
   * Protocol-relative. `//cdn.example/a.png` is rooted at ANOTHER HOST, not at
   * this one, so treating it as a path would silently point the URL at our own
   * origin with a doubled slash.
   */
  if (path.startsWith('//')) return path;

  const base = siteUrl();
  if (!path.startsWith('/')) return `${base}/${path}`;
  return `${base}${path}`;
}

/* -------------------------------------------------------------------------
 * Route builders.
 *
 * Public URLs are slug-based and IDs stay internal. Every builder points at a
 * page that exists: `routes.test.ts` walks the app directory and fails when
 * one does not, so a moved page cannot leave a builder linking to a 404, which
 * is exactly what happened to half of these before the test.
 * ---------------------------------------------------------------------- */

export const routes = {
  home: () => '/',
  search: (query?: string) => (query ? `/search?q=${encodeURIComponent(query)}` : '/search'),
  categories: () => '/categories',
  category: (slug: string) => `/category/${slug}`,
  product: (slug: string) => `/product/${slug}`,
  brands: () => '/brands',
  brand: (slug: string) => `/brand/${slug}`,
  /**
   * Public seller storefronts live under /store, not /seller. The seller
   * console owns /seller/*, and letting a seller slug share that namespace
   * would make a store called "orders" shadow a console route.
   */
  stores: () => '/stores',
  store: (slug: string) => `/store/${slug}`,
  reels: () => '/reels',

  bag: () => '/bag',
  wishlist: () => '/wishlist',
  checkout: () => '/checkout',
  checkoutPayment: (orderId: string) => `/checkout/payment/${orderId}`,

  orders: () => '/orders',
  order: (id: string) => `/orders/${id}`,
  invoice: (id: string) => `/invoice/${id}`,

  account: () => '/account',
  accountProfile: () => '/account/profile',
  accountAddresses: () => '/account/addresses',
  accountNotifications: () => '/account/notifications',
  accountReturns: () => '/account/returns',
  accountReviews: () => '/account/reviews',
  accountSupport: () => '/account/support',

  signIn: (next?: string) => (next ? `/login?next=${encodeURIComponent(next)}` : '/login'),
  signUp: (next?: string) => (next ? `/register?next=${encodeURIComponent(next)}` : '/register'),
  forgotPassword: () => '/forgot-password',

  helpArticle: (slug: string) => `/help/${slug}`,
  legal: (slug: string) => `/legal/${slug}`,
  about: () => '/about',
  sellWithUs: () => '/sell-with-us',
  applyToSell: () => '/sell-with-us/apply',

  seller: {
    dashboard: () => '/seller',
    onboarding: () => '/seller/onboarding',
    products: () => '/seller/products',
    product: (id: string) => `/seller/products/${id}`,
    newProduct: () => '/seller/products/new',
    inventory: () => '/seller/inventory',
    orders: () => '/seller/orders',
    shipments: () => '/seller/shipments',
    shipment: (id: string) => `/seller/shipments/${id}`,
    returns: () => '/seller/returns',
    earnings: () => '/seller/earnings',
    settlements: () => '/seller/settlements',
    analytics: () => '/seller/analytics',
    settings: () => '/seller/settings',
  },

  admin: {
    dashboard: () => '/admin',
    analytics: () => '/admin/analytics',
    orders: () => '/admin/orders',
    order: (orderNumber: string) => `/admin/orders/${orderNumber}`,
    returns: () => '/admin/returns',
    payments: () => '/admin/payments',
    settlements: () => '/admin/settlements',
    support: () => '/admin/support',
    ticket: (id: string) => `/admin/support/${id}`,
    products: () => '/admin/products',
    reviews: () => '/admin/reviews',
    categories: () => '/admin/categories',
    brands: () => '/admin/brands',
    sellers: () => '/admin/sellers',
    seller: (id: string) => `/admin/sellers/${id}`,
    users: () => '/admin/users',
    coupons: () => '/admin/coupons',
    promotions: () => '/admin/promotions',
    homepage: () => '/admin/cms',
    pages: () => '/admin/pages',
    page: (id: string) => `/admin/pages/${id}`,
    auditLogs: () => '/admin/audit-logs',
    settings: () => '/admin/settings',
  },
} as const;

/* ------------------------------------------------------------- SEO policy */

/**
 * Which listing URLs may be indexed.
 *
 * A marketplace can generate millions of filter permutations. Indexing them all
 * buries the pages that matter and burns crawl budget, so only these are
 * indexable; everything else is `noindex, follow` with a canonical pointing at
 * the clean category URL.
 */
export const INDEXABLE_LISTING_PARAMS = new Set(['page']);

export function shouldIndexListing(searchParams: Record<string, string | string[] | undefined>): boolean {
  const keys = Object.keys(searchParams).filter((key) => {
    const value = searchParams[key];
    return value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0);
  });
  if (keys.length === 0) return true;
  if (!keys.every((key) => INDEXABLE_LISTING_PARAMS.has(key))) return false;
  // Deep pagination adds no value to the index.
  const page = Number(searchParams.page ?? 1);
  return Number.isFinite(page) && page >= 1 && page <= 5;
}

/**
 * The canonical for a listing page strips every parameter except a page number
 * beyond the first, collapsing filtered variants onto one indexable URL.
 */
export function listingCanonical(
  pathname: string,
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const page = Number(searchParams.page ?? 1);
  const suffix = Number.isFinite(page) && page > 1 ? `?page=${page}` : '';
  return absoluteUrl(`${pathname}${suffix}`);
}
