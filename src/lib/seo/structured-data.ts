import { siteConfig, absoluteUrl } from '@/config/site';
import type { Product, ProductSummary, Review, Seller } from '@/domain/types';
import { toRupees } from '@/lib/money';

/**
 * JSON-LD builders.
 *
 * Structured data is generated from the same entities the page renders, never
 * hand-written per template. That is the only way to guarantee the markup and
 * the visible page agree — and a mismatch between them is precisely what earns
 * a manual action from Google.
 *
 * Prices are emitted in RUPEES because schema.org expects a decimal currency
 * amount; everywhere else in this system money is paise. `toRupees` is the only
 * conversion point.
 */

export type JsonLdNode = Record<string, unknown>;

/** Serialise safely: `</script>` inside any string would close the tag early. */
export function serializeJsonLd(data: JsonLdNode | JsonLdNode[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function organizationJsonLd(): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${absoluteUrl('/')}#organization`,
    name: siteConfig.name,
    legalName: siteConfig.legalName,
    url: absoluteUrl('/'),
    description: siteConfig.description,
    email: siteConfig.supportEmail,
    telephone: siteConfig.supportPhone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${siteConfig.address.line1}, ${siteConfig.address.line2}`,
      addressLocality: siteConfig.address.city,
      addressRegion: siteConfig.address.state,
      postalCode: siteConfig.address.pincode,
      addressCountry: siteConfig.address.country,
    },
    sameAs: Object.values(siteConfig.social),
  };
}

/**
 * `WebSite` with a `SearchAction`, which is what enables a sitelinks search box
 * in results. The `{search_term_string}` placeholder is required verbatim.
 */
export function webSiteJsonLd(): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${absoluteUrl('/')}#website`,
    name: siteConfig.name,
    url: absoluteUrl('/'),
    publisher: { '@id': `${absoluteUrl('/')}#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: absoluteUrl('/search?q={search_term_string}'),
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbListJsonLd(
  items: Array<{ name: string; url: string }>,
): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * `ItemList` for a listing page.
 *
 * URLs only, no nested Product nodes: the full product markup belongs on the
 * PDP, and duplicating it here would emit forty competing Product entities for
 * one page.
 */
export function itemListJsonLd(items: Array<{ name: string; url: string }>): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };
}

/**
 * `Product` with `Offer`, plus `AggregateRating` and `Review` when they exist.
 *
 * `AggregateRating` is omitted entirely when there are no reviews — emitting
 * one with `ratingValue: 0` is invalid and will be flagged.
 *
 * Variants are expressed as an `AggregateOffer` when the price spans a range,
 * so the result shows "from ₹X" rather than an arbitrary single price.
 */
export function productJsonLd({
  product,
  brandName,
  seller,
  reviews,
  url,
}: {
  product: Product;
  brandName: string;
  seller: Seller | null;
  reviews: Review[];
  url: string;
}): JsonLdNode {
  const inStock = product.variants.some((v) => v.isActive && v.inventory.available > 0);
  const availability = inStock
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';

  const { minSellingPrice, maxSellingPrice } = product.priceRange;
  const singlePrice = minSellingPrice === maxSellingPrice;

  const node: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.title,
    description: product.description,
    sku: product.variants[0]?.sku ?? product.styleCode,
    mpn: product.styleCode,
    image: product.media.slice(0, 6).map((m) => absoluteUrl(m.url)),
    brand: { '@type': 'Brand', name: brandName },
    category: product.categoryPath.join(' > '),
    countryOfOrigin: product.countryOfOrigin,
    color: product.colorOptions.join(', ') || undefined,
    size: product.sizeOptions.join(', ') || undefined,
    url,
  };

  const offerBase = {
    priceCurrency: siteConfig.currency,
    availability,
    itemCondition: 'https://schema.org/NewCondition',
    url,
    seller: seller
      ? { '@type': 'Organization', name: seller.displayName }
      : { '@type': 'Organization', name: siteConfig.name },
    hasMerchantReturnPolicy: product.returnable
      ? {
          '@type': 'MerchantReturnPolicy',
          applicableCountry: 'IN',
          returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
          merchantReturnDays: product.returnWindowDays,
          returnMethod: 'https://schema.org/ReturnByMail',
          returnFees: 'https://schema.org/FreeReturn',
        }
      : undefined,
  };

  node.offers = singlePrice
    ? { '@type': 'Offer', price: toRupees(minSellingPrice).toFixed(2), ...offerBase }
    : {
        '@type': 'AggregateOffer',
        lowPrice: toRupees(minSellingPrice).toFixed(2),
        highPrice: toRupees(maxSellingPrice).toFixed(2),
        offerCount: product.variants.filter((v) => v.isActive).length,
        ...offerBase,
      };

  if (product.rating.count > 0) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.rating.average.toFixed(1),
      reviewCount: product.rating.count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  const published = reviews.filter((r) => r.status === 'PUBLISHED').slice(0, 5);
  if (published.length > 0) {
    node.review = published.map((review) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: review.authorName },
      datePublished: review.createdAt.slice(0, 10),
      name: review.title ?? undefined,
      reviewBody: review.body,
      reviewRating: {
        '@type': 'Rating',
        ratingValue: review.rating,
        bestRating: 5,
        worstRating: 1,
      },
    }));
  }

  return node;
}

/** A store page, expressed as the organisation behind it. */
export function sellerJsonLd(seller: Seller, url: string): JsonLdNode {
  const node: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    '@id': `${url}#store`,
    name: seller.displayName,
    legalName: seller.legalName,
    description: seller.about,
    url,
    email: seller.supportEmail,
    telephone: seller.supportPhone,
    address: {
      '@type': 'PostalAddress',
      addressLocality: seller.kyc.registeredAddress.city,
      addressRegion: seller.kyc.registeredAddress.state,
      postalCode: seller.kyc.registeredAddress.pincode,
      addressCountry: 'IN',
    },
  };

  if (seller.rating.count > 0) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: seller.rating.average.toFixed(1),
      reviewCount: seller.rating.count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return node;
}

/** `ItemList` built straight from card projections. */
export function summariesToItemList(items: ProductSummary[]): JsonLdNode {
  return itemListJsonLd(
    items.map((item) => ({ name: item.title, url: absoluteUrl(`/product/${item.slug}`) })),
  );
}
