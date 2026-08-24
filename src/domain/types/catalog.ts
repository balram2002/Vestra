import type { Gender, SizeChart, SizeSystem } from '../attributes';
import type { ProductStatus, StockLevel } from '../enums';

/* ------------------------------------------------------------------- media */

export type MediaKind = 'IMAGE' | 'VIDEO';

export interface Media {
  id: string;
  kind: MediaKind;
  url: string;
  /** Poster frame for video; identical to `url` for images. */
  thumbnailUrl: string;
  alt: string;
  width: number;
  height: number;
  /** Display order within the gallery; 0 is the primary asset. */
  position: number;
  /** Variant this asset belongs to, or null when it applies to the whole style. */
  variantId: string | null;
}

/* -------------------------------------------------------------- taxonomy */

export interface Category {
  id: string;
  slug: string;
  slugHistory: string[];
  name: string;
  /** Full ancestor path, e.g. ['women', 'ethnic-wear', 'kurtas']. */
  path: string[];
  parentId: string | null;
  /** Depth 0 = department (Men/Women/Kids/Beauty/...). */
  depth: number;
  /**
   * Attribute family driving which facets and form fields apply.
   * See CATEGORY_ATTRIBUTE_MAP in domain/attributes.
   */
  attributeFamily: string;
  gender: Gender | null;
  sizeSystem: SizeSystem;
  sizeChart: SizeChart | null;
  description: string;
  /** Copy rendered below the product grid for search engines and shoppers. */
  seoIntro: string | null;
  imageUrl: string;
  bannerUrl: string | null;
  iconKey: string;
  position: number;
  isActive: boolean;
  /** Shown in the mega menu even when it has no direct products. */
  featured: boolean;
  productCount: number;
  /** GST slab applied to products in this category. */
  taxRatePercent: number;
  /** Category-level policy default; a seller may be stricter, never laxer. */
  returnable: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  createdAt: string;
  /** Drives `lastModified` in the sitemap, so crawlers recrawl on a real edit. */
  updatedAt: string;
}

export interface Brand {
  id: string;
  slug: string;
  slugHistory: string[];
  name: string;
  /** Short code used inside SKUs. */
  code: string;
  logoUrl: string;
  bannerUrl: string | null;
  description: string;
  originCountry: string;
  foundedYear: number | null;
  isPremium: boolean;
  isActive: boolean;
  productCount: number;
  averageRating: number;
  categoryIds: string[];
  metaTitle: string | null;
  metaDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ----------------------------------------------------------------- product */

/**
 * A Product is a STYLE. What a shopper buys is a ProductVariant (a size/colour
 * combination) which is what carries SKU, price and stock. Splitting the two is
 * what makes size-level inventory, exchanges and barcode-driven ops possible.
 */
export interface Product {
  id: string;
  slug: string;
  slugHistory: string[];
  title: string;
  /** Manufacturer style code, printed on the label. */
  styleCode: string;
  brandId: string;
  sellerId: string;
  categoryId: string;
  /** Denormalised ancestor ids so category pages can query one field. */
  categoryPath: string[];
  gender: Gender;
  status: ProductStatus;

  description: string;
  /** Short bullet points shown above the fold. */
  highlights: string[];
  /** Attribute key -> value(s). Keys come from ATTRIBUTE_DEFINITIONS. */
  attributes: Record<string, string | string[]>;
  specifications: Array<{ label: string; value: string }>;
  careInstructions: string[];
  countryOfOrigin: string;
  manufacturerName: string;
  manufacturerAddress: string;
  packerName: string;
  /** Net quantity as required by Indian legal metrology rules. */
  netQuantity: string;

  media: Media[];
  variants: ProductVariant[];
  /** Distinct colour values across variants, in display order. */
  colorOptions: string[];
  /** Distinct size values across variants, sorted by the category size system. */
  sizeOptions: string[];
  sizeSystem: SizeSystem;
  sizeChart: SizeChart | null;
  /** Model measurements shown under "Size & fit". */
  modelNote: string | null;

  /** Denormalised price envelope across variants, in paise. */
  priceRange: { minSellingPrice: number; maxSellingPrice: number; minMrp: number; maxMrp: number };
  maxDiscountPercent: number;

  taxRatePercent: number;
  hsnCode: string;

  rating: ProductRating;
  /** Rolling 30-day counters used by sort orders and the "Bestseller" badge. */
  stats: ProductStats;

  returnable: boolean;
  returnWindowDays: number;
  exchangeable: boolean;
  codAvailable: boolean;
  warrantyMonths: number | null;

  /** Publishing / moderation trail. */
  submittedAt: string | null;
  approvedAt: string | null;
  approvedByUserId: string | null;
  rejectionReason: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;

  metaTitle: string | null;
  metaDescription: string | null;

  tags: string[];
  /** Marketing flags set by the catalogue team, not derived. */
  isSponsored: boolean;
}

export interface ProductVariant {
  id: string;
  productId: string;
  /** Platform SKU. Unique across the marketplace. */
  sku: string;
  /** The seller's own SKU, echoed back on invoices and manifests. */
  sellerSku: string;
  barcode: string;
  size: string;
  color: string;
  /** Human label for the colour, e.g. "Indigo". */
  colorLabel: string;
  colorHex: string;
  mrp: number;
  sellingPrice: number;
  /** Cost price is seller-private and never leaves the seller console. */
  costPrice: number | null;
  inventory: Inventory;
  media: Media[];
  weightGrams: number;
  dimensionsCm: { length: number; width: number; height: number };
  isActive: boolean;
}

/**
 * Inventory is split so that overselling is structurally impossible:
 * `available` is what may still be sold, `reserved` is held by open checkouts
 * and unshipped orders.
 */
export interface Inventory {
  variantId: string;
  available: number;
  reserved: number;
  sold: number;
  returned: number;
  damaged: number;
  /** Threshold below which the seller is alerted and the badge switches. */
  lowStockThreshold: number;
  restockEta: string | null;
  updatedAt: string;
}

export interface ProductRating {
  average: number;
  count: number;
  /** Index 0 = one star ... index 4 = five stars. */
  distribution: [number, number, number, number, number];
  /** Percentage of reviewers who said the fit was true to size. */
  fitTrueToSizePercent: number | null;
}

export interface ProductStats {
  views30d: number;
  addToBag30d: number;
  unitsSold30d: number;
  unitsSoldLifetime: number;
  wishlistCount: number;
  returnRate: number;
  conversionRate: number;
}

/* ------------------------------------------------- derived / view models */

/**
 * The projection every listing surface consumes. Building it once, on the
 * server, keeps product cards cheap and stops each grid inventing its own
 * discount maths.
 */
export interface ProductSummary {
  id: string;
  slug: string;
  title: string;
  brandName: string;
  brandSlug: string;
  sellerName: string;
  sellerSlug: string;
  sellerRating: number;
  categorySlug: string;
  categoryName: string;
  gender: Gender;
  primaryImage: string;
  hoverImage: string | null;
  mrp: number;
  sellingPrice: number;
  discountPercent: number;
  rating: number;
  ratingCount: number;
  colorOptions: Array<{ value: string; label: string; hex: string; image: string }>;
  sizeOptions: string[];
  availableSizes: string[];
  stockLevel: StockLevel;
  totalAvailable: number;
  badges: ProductBadge[];
  isSponsored: boolean;
  isReturnable: boolean;
  unitsSold30d: number;
  createdAt: string;
}

export type ProductBadgeKind =
  | 'NEW'
  | 'BESTSELLER'
  | 'TRENDING'
  | 'LOW_STOCK'
  | 'DEAL'
  | 'PREMIUM'
  | 'SPONSORED'
  | 'BACK_IN_STOCK';

export interface ProductBadge {
  kind: ProductBadgeKind;
  label: string;
}

/* -------------------------------------------------------------- querying */

export const PRODUCT_SORTS = [
  'relevance',
  'popularity',
  'newest',
  'price-asc',
  'price-desc',
  'discount',
  'rating',
] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const PRODUCT_SORT_LABEL: Record<ProductSort, string> = {
  relevance: 'Relevance',
  popularity: 'Popularity',
  newest: 'What’s new',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  discount: 'Better discount',
  rating: 'Customer rating',
};

/** The canonical shape a listing page turns its URL into. */
export interface ProductQuery {
  q?: string;
  categorySlug?: string;
  brandSlugs?: string[];
  sellerSlug?: string;
  genders?: Gender[];
  colors?: string[];
  sizes?: string[];
  /** Attribute key -> selected values, e.g. { fit: ['slim'], material: ['cotton'] }. */
  attributes?: Record<string, string[]>;
  minPrice?: number;
  maxPrice?: number;
  minDiscount?: number;
  minRating?: number;
  inStockOnly?: boolean;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
  hex?: string;
  /** Rendered but not selectable when zero results would remain. */
  disabled?: boolean;
}

export interface Facet {
  key: string;
  label: string;
  kind: 'checkbox' | 'color' | 'size' | 'range' | 'rating';
  values: FacetValue[];
  /** Collapse behaviour hint for the filter rail. */
  defaultOpen: boolean;
  searchable?: boolean;
}

export interface PriceFacet {
  min: number;
  max: number;
  /** Histogram buckets so the price slider can show distribution. */
  buckets: Array<{ from: number; to: number; count: number }>;
}

export interface ProductListResult {
  items: ProductSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  facets: Facet[];
  priceFacet: PriceFacet;
  appliedFilterCount: number;
}

/* --------------------------------------------------------------- search */

export interface SearchSuggestion {
  kind: 'QUERY' | 'PRODUCT' | 'BRAND' | 'CATEGORY' | 'SELLER';
  label: string;
  /** Secondary line, e.g. "in Women > Kurtas". */
  hint: string | null;
  href: string;
  imageUrl: string | null;
}

export interface SearchSuggestionGroups {
  recent: string[];
  trending: string[];
  suggestions: SearchSuggestion[];
  /** Set when the query was auto-corrected, so the UI can say "Showing X". */
  correctedFrom: string | null;
}
