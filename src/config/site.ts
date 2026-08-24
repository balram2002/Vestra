/**
 * Site identity and canonical URL construction.
 *
 * Every metadata block, sitemap entry, structured-data node and outbound link
 * resolves its URL through here, so the canonical host is defined exactly once.
 */

export const siteConfig = {
  name: 'Vestra',
  legalName: 'Vestra Commerce Private Limited',
  tagline: 'Marketplace for modern wardrobes',
  description:
    'Vestra is a multi-vendor marketplace for fashion, beauty and lifestyle. Shop verified sellers, transparent pricing, easy returns and fast delivery across India.',
  locale: 'en_IN',
  language: 'en-IN',
  country: 'IN',
  currency: 'INR',
  supportEmail: 'help@vestra.example',
  supportPhone: '+91 80 4718 0000',
  supportHours: 'Mon to Sat, 9am to 9pm IST',
  social: {
    instagram: 'https://instagram.com/vestra',
    x: 'https://x.com/vestra',
    facebook: 'https://facebook.com/vestra',
    youtube: 'https://youtube.com/@vestra',
    linkedin: 'https://linkedin.com/company/vestra',
  },
  address: {
    line1: 'Prestige Atrium, 4th Floor',
    line2: '12 Residency Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560025',
    country: 'IN',
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
  const base = siteUrl();
  if (!path.startsWith('/')) return `${base}/${path}`;
  return `${base}${path}`;
}

/* -------------------------------------------------------------------------
 * Route builders.
 *
 * Public URLs are always slug-based. IDs stay internal. Centralising the
 * builders means a URL-shape change is one edit, and no component ever
 * hand-assembles a path.
 * ---------------------------------------------------------------------- */

export const routes = {
  home: () => '/',
  search: (query?: string) => (query ? `/search?q=${encodeURIComponent(query)}` : '/search'),

  category: (path: string | string[]) =>
    `/category/${(Array.isArray(path) ? path : [path]).join('/')}`,

  product: (slug: string) => `/product/${slug}`,
  brand: (slug: string) => `/brand/${slug}`,
  /**
   * Public seller storefronts live under /store, not /seller. The seller
   * console owns /seller/*, and letting a seller slug share that namespace
   * would make a store called "orders" shadow a console route.
   */
  store: (slug: string) => `/store/${slug}`,
  campaign: (slug: string) => `/campaign/${slug}`,

  bag: () => '/bag',
  wishlist: () => '/wishlist',
  checkout: () => '/checkout',
  checkoutPayment: () => '/checkout/payment',
  orderConfirmation: (orderNumber: string) => `/checkout/confirmation/${orderNumber}`,

  orders: () => '/account/orders',
  order: (orderNumber: string) => `/account/orders/${orderNumber}`,
  orderTracking: (orderNumber: string, shipmentNumber: string) =>
    `/account/orders/${orderNumber}/track/${shipmentNumber}`,
  orderReturn: (orderNumber: string) => `/account/orders/${orderNumber}/return`,
  orderExchange: (orderNumber: string) => `/account/orders/${orderNumber}/exchange`,
  orderCancel: (orderNumber: string) => `/account/orders/${orderNumber}/cancel`,

  account: () => '/account',
  accountProfile: () => '/account/profile',
  accountAddresses: () => '/account/addresses',
  accountPayments: () => '/account/payments',
  accountCoupons: () => '/account/coupons',
  accountReviews: () => '/account/reviews',
  accountReturns: () => '/account/returns',
  accountNotifications: () => '/account/notifications',
  accountSecurity: () => '/account/security',
  accountSupport: () => '/account/support',
  accountTicket: (ticketNumber: string) => `/account/support/${ticketNumber}`,

  signIn: (next?: string) => (next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'),
  signUp: (next?: string) => (next ? `/sign-up?next=${encodeURIComponent(next)}` : '/sign-up'),
  forgotPassword: () => '/forgot-password',

  help: () => '/help',
  helpArticle: (slug: string) => `/help/${slug}`,
  page: (slug: string) => `/pages/${slug}`,
  sellOnVestra: () => '/sell',

  seller: {
    dashboard: () => '/seller',
    products: () => '/seller/products',
    product: (id: string) => `/seller/products/${id}`,
    newProduct: () => '/seller/products/new',
    orders: () => '/seller/orders',
    sellerOrder: (id: string) => `/seller/orders/${id}`,
    shipments: () => '/seller/shipments',
    shipment: (id: string) => `/seller/shipments/${id}`,
    inventory: () => '/seller/inventory',
    returns: () => '/seller/returns',
    returnDetail: (id: string) => `/seller/returns/${id}`,
    earnings: () => '/seller/earnings',
    settlements: () => '/seller/settlements',
    settlement: (id: string) => `/seller/settlements/${id}`,
    analytics: () => '/seller/analytics',
    coupons: () => '/seller/coupons',
    reviews: () => '/seller/reviews',
    support: () => '/seller/support',
    settings: () => '/seller/settings',
    onboarding: () => '/seller/onboarding',
  },

  admin: {
    dashboard: () => '/admin',
    users: () => '/admin/users',
    user: (id: string) => `/admin/users/${id}`,
    sellers: () => '/admin/sellers',
    sellerDetail: (id: string) => `/admin/sellers/${id}`,
    products: () => '/admin/products',
    productDetail: (id: string) => `/admin/products/${id}`,
    categories: () => '/admin/categories',
    brands: () => '/admin/brands',
    orders: () => '/admin/orders',
    orderDetail: (orderNumber: string) => `/admin/orders/${orderNumber}`,
    payments: () => '/admin/payments',
    refunds: () => '/admin/refunds',
    returns: () => '/admin/returns',
    shipments: () => '/admin/shipments',
    coupons: () => '/admin/coupons',
    promotions: () => '/admin/promotions',
    reviews: () => '/admin/reviews',
    settlements: () => '/admin/settlements',
    analytics: () => '/admin/analytics',
    cms: () => '/admin/cms',
    banners: () => '/admin/cms/banners',
    navigation: () => '/admin/cms/navigation',
    support: () => '/admin/support',
    ticket: (id: string) => `/admin/support/${id}`,
    roles: () => '/admin/roles',
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
