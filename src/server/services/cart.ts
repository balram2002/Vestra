import 'server-only';

import { CART, INVENTORY, SHIPPING } from '@/config/business';
import type {
  Cart,
  CartItem,
  CartLine,
  CartLineIssue,
  CartSellerGroup,
  CartView,
  Product,
  ProductVariant,
} from '@/domain/types';
import { entityId } from '@/lib/ids';
import { calculatePricing, emptyBreakdown, type PricingLineInput } from '@/lib/pricing/calculate';

import { collections, toEntities, toEntity } from '../db/collections';
import type { Owner } from '../auth/session';
import { stockLevelOf } from '../repositories/inventory';

/**
 * The bag.
 *
 * NOT cached, and it must never be: it is per-visitor by definition, and a
 * `"use cache"` scope here would either leak one shopper's bag to another or
 * fail outright for reading cookies. Every bag surface therefore sits behind
 * `<Suspense>` and streams.
 *
 * The important work in this module is `buildView`, which re-derives the bag
 * against LIVE catalogue data on every read. A bag is a long-lived object —
 * people leave things in it for weeks — so by the time it is looked at again a
 * price may have moved, a variant may have sold out, a seller may have been
 * suspended. Every one of those is surfaced as an explicit, actionable issue on
 * the line rather than being silently corrected or, worse, discovered at
 * payment.
 */

/* --------------------------------------------------------------- loading */

function ownerFilter(owner: Owner) {
  if (owner.kind === 'user') return { userId: owner.userId };
  if (owner.kind === 'guest') return { guestToken: owner.guestToken };
  return null;
}

export async function findCart(owner: Owner): Promise<Cart | null> {
  const filter = ownerFilter(owner);
  if (!filter) return null;

  const carts = await collections.carts();
  return toEntity(await carts.findOne(filter));
}

/** Load or create. Only call from a mutation: it writes. */
export async function ensureCart(owner: Owner): Promise<Cart> {
  const existing = await findCart(owner);
  if (existing) return existing;

  const now = new Date().toISOString();
  const cart: Cart = {
    id: entityId('crt'),
    userId: owner.kind === 'user' ? owner.userId : null,
    guestToken: owner.kind === 'guest' ? owner.guestToken : null,
    items: [],
    savedForLater: [],
    couponCode: null,
    addressId: null,
    shippingOptionId: null,
    paymentMethod: null,
    useCredit: false,
    giftWrap: false,
    orderNote: null,
    createdAt: now,
    updatedAt: now,
  };

  const carts = await collections.carts();
  await carts.insertOne({
    ...cart,
    _id: cart.id,
    // A guest bag sweeps itself via the TTL index; a signed-in bag never expires.
    ...(owner.kind === 'guest'
      ? { expiresAt: new Date(Date.now() + CART.guestCartTtlDays * 86_400_000) }
      : {}),
  } as never);

  return cart;
}

/* ------------------------------------------------------------- mutations */

export interface CartMutationResult {
  ok: boolean;
  /** Set when the mutation was refused; safe to show verbatim. */
  error?: string;
  cart?: Cart;
}

export async function addItem(
  owner: Owner,
  input: { productId: string; variantId: string; quantity: number },
): Promise<CartMutationResult> {
  const products = await collections.products();
  const product = toEntity(await products.findOne({ _id: input.productId }));

  if (!product || product.status !== 'PUBLISHED') {
    return { ok: false, error: 'This product is no longer available.' };
  }

  const variant = product.variants.find((v) => v.id === input.variantId);
  if (!variant || !variant.isActive) {
    return { ok: false, error: 'That size is no longer available.' };
  }

  const cart = await ensureCart(owner);
  const existing = cart.items.find((item) => item.variantId === input.variantId);
  const desired = (existing?.quantity ?? 0) + input.quantity;

  // Two independent caps: what the shopper is allowed to buy, and what exists.
  if (desired > CART.maxQuantityPerVariant) {
    return {
      ok: false,
      error: `You can order up to ${CART.maxQuantityPerVariant} of this item.`,
    };
  }
  if (desired > variant.inventory.available) {
    return {
      ok: false,
      error:
        variant.inventory.available === 0
          ? 'This size just sold out.'
          : `Only ${variant.inventory.available} left in this size.`,
    };
  }
  if (!existing && cart.items.length >= CART.maxDistinctItems) {
    return { ok: false, error: 'Your bag is full. Remove something to add more.' };
  }

  const carts = await collections.carts();
  const now = new Date().toISOString();

  if (existing) {
    await carts.updateOne(
      { _id: cart.id, 'items.variantId': input.variantId },
      { $inc: { 'items.$.quantity': input.quantity }, $set: { updatedAt: now } },
    );
  } else {
    const item: CartItem = {
      id: entityId('cri'),
      productId: product.id,
      variantId: variant.id,
      sellerId: product.sellerId,
      quantity: input.quantity,
      // Frozen so a later price move is detectable and shown, not absorbed.
      priceAtAdd: variant.sellingPrice,
      addedAt: now,
    };
    await carts.updateOne(
      { _id: cart.id },
      { $push: { items: item }, $set: { updatedAt: now } },
    );
  }

  return { ok: true, cart: (await findCart(owner)) ?? cart };
}

export async function setQuantity(
  owner: Owner,
  variantId: string,
  quantity: number,
): Promise<CartMutationResult> {
  if (quantity <= 0) return removeItem(owner, variantId);

  if (quantity > CART.maxQuantityPerVariant) {
    return { ok: false, error: `You can order up to ${CART.maxQuantityPerVariant} of this item.` };
  }

  const cart = await findCart(owner);
  if (!cart) return { ok: false, error: 'Your bag is empty.' };

  const products = await collections.products();
  const doc = await products.findOne(
    { 'variants.id': variantId },
    { projection: { 'variants.$': 1 } },
  );
  const available = doc?.variants?.[0]?.inventory.available ?? 0;

  if (quantity > available) {
    return {
      ok: false,
      error: available === 0 ? 'This size is sold out.' : `Only ${available} left in this size.`,
    };
  }

  const carts = await collections.carts();
  await carts.updateOne(
    { _id: cart.id, 'items.variantId': variantId },
    { $set: { 'items.$.quantity': quantity, updatedAt: new Date().toISOString() } },
  );

  return { ok: true };
}

export async function removeItem(owner: Owner, variantId: string): Promise<CartMutationResult> {
  const cart = await findCart(owner);
  if (!cart) return { ok: false, error: 'Your bag is empty.' };

  const carts = await collections.carts();
  await carts.updateOne(
    { _id: cart.id },
    { $pull: { items: { variantId } }, $set: { updatedAt: new Date().toISOString() } },
  );

  return { ok: true };
}

/**
 * Move a line to "saved for later".
 *
 * Kept as a move rather than a copy, because the point of the feature is to
 * clear the bag without losing the intent to buy.
 */
export async function saveForLater(owner: Owner, variantId: string): Promise<CartMutationResult> {
  const cart = await findCart(owner);
  const item = cart?.items.find((i) => i.variantId === variantId);
  if (!cart || !item) return { ok: false, error: 'That item is no longer in your bag.' };

  const carts = await collections.carts();
  await carts.updateOne(
    { _id: cart.id },
    {
      $pull: { items: { variantId } },
      $push: { savedForLater: item },
      $set: { updatedAt: new Date().toISOString() },
    },
  );

  return { ok: true };
}

export async function moveToBag(owner: Owner, variantId: string): Promise<CartMutationResult> {
  const cart = await findCart(owner);
  const item = cart?.savedForLater.find((i) => i.variantId === variantId);
  if (!cart || !item) return { ok: false, error: 'That item is no longer saved.' };

  const result = await addItem(owner, {
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.quantity,
  });
  if (!result.ok) return result;

  const carts = await collections.carts();
  await carts.updateOne(
    { _id: cart.id },
    { $pull: { savedForLater: { variantId } }, $set: { updatedAt: new Date().toISOString() } },
  );

  return { ok: true };
}

/**
 * Merge a guest bag into the account bag on sign-in.
 *
 * Quantities are summed and then clamped, and the ACCOUNT price wins on
 * conflict, because that is the bag the shopper has been curating while signed
 * in. Losing a guest bag at sign-in is one of the most common ways an
 * e-commerce funnel leaks.
 */
export async function mergeGuestCart(guestToken: string, userId: string): Promise<void> {
  const carts = await collections.carts();

  const guest = toEntity(await carts.findOne({ guestToken }));
  if (!guest || guest.items.length === 0) {
    await carts.deleteOne({ guestToken });
    return;
  }

  const target = await ensureCart({ kind: 'user', userId });
  const merged = [...target.items];

  for (const item of guest.items) {
    const existing = merged.find((i) => i.variantId === item.variantId);
    if (existing) {
      existing.quantity = Math.min(
        CART.maxQuantityPerVariant,
        existing.quantity + item.quantity,
      );
    } else if (merged.length < CART.maxDistinctItems) {
      merged.push(item);
    }
  }

  await carts.updateOne(
    { _id: target.id },
    {
      $set: {
        items: merged,
        savedForLater: [...target.savedForLater, ...guest.savedForLater],
        updatedAt: new Date().toISOString(),
      },
    },
  );

  await carts.deleteOne({ guestToken });
}

/* ------------------------------------------------------------------ view */

/** Cheap count for the header badge — no catalogue join. */
export async function getBagCount(owner: Owner): Promise<number> {
  const cart = await findCart(owner);
  if (!cart) return 0;
  return cart.items.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Join the stored bag against live catalogue data and surface every problem.
 *
 * This is where the Section 10 edge cases are actually caught. Each issue
 * carries `blocking` (may checkout proceed?) and `resolution` (what the UI
 * should offer), so no screen has to re-derive that judgement.
 */
export async function getCartView(owner: Owner): Promise<CartView> {
  const cart = await findCart(owner);

  if (!cart || cart.items.length === 0) {
    return {
      cartId: cart?.id ?? '',
      groups: [],
      savedForLater: [],
      totalItems: 0,
      totalUnits: 0,
      pricing: emptyBreakdown(),
      coupon: null,
      availableCoupons: [],
      offers: [],
      issues: [],
      checkoutReady: false,
      creditAvailable: 0,
    };
  }

  const productIds = Array.from(new Set(cart.items.map((i) => i.productId)));
  const [productCol, sellerCol] = await Promise.all([
    collections.products(),
    collections.sellers(),
  ]);

  const products = toEntities(await productCol.find({ _id: { $in: productIds } }).toArray());
  const byProduct = new Map(products.map((p) => [p.id, p]));

  const sellerIds = Array.from(new Set(products.map((p) => p.sellerId)));
  const sellers = toEntities(await sellerCol.find({ _id: { $in: sellerIds } }).toArray());
  const bySeller = new Map(sellers.map((s) => [s.id, s]));

  const lines: CartLine[] = [];

  for (const item of cart.items) {
    const product = byProduct.get(item.productId);
    const variant = product?.variants.find((v) => v.id === item.variantId);
    const seller = product ? bySeller.get(product.sellerId) : undefined;

    // The product was deleted outright. Nothing can be shown, so the line is
    // dropped rather than rendered as a broken row.
    if (!product || !variant) continue;

    const issues = detectIssues(item, product, variant, Boolean(seller && seller.status === 'ACTIVE'));

    lines.push({
      item,
      productId: product.id,
      productSlug: product.slug,
      productTitle: product.title,
      brandName: '',
      sellerId: product.sellerId,
      sellerName: seller?.displayName ?? 'Unknown seller',
      sellerSlug: seller?.slug ?? '',
      variantId: variant.id,
      sku: variant.sku,
      size: variant.size,
      colorLabel: variant.colorLabel,
      colorHex: variant.colorHex,
      image: variant.media[0]?.url ?? product.media[0]?.url ?? '',
      mrp: variant.mrp,
      sellingPrice: variant.sellingPrice,
      discountPercent:
        variant.mrp > variant.sellingPrice
          ? Math.round(((variant.mrp - variant.sellingPrice) / variant.mrp) * 100)
          : 0,
      quantity: item.quantity,
      maxQuantity: Math.min(CART.maxQuantityPerVariant, variant.inventory.available),
      available: variant.inventory.available,
      stockLevel: stockLevelOf(variant.inventory, variant.isActive),
      returnable: product.returnable,
      returnWindowDays: product.returnWindowDays,
      estimatedDelivery: null,
      issues,
    });
  }

  /* --------------------------------------------------------- grouping */

  // Grouped by seller because that is how the order will actually split: one
  // seller order, one shipment, one settlement each.
  const groups: CartSellerGroup[] = [];

  for (const sellerId of Array.from(new Set(lines.map((l) => l.sellerId)))) {
    const sellerLines = lines.filter((l) => l.sellerId === sellerId);
    const seller = bySeller.get(sellerId);
    const subtotal = sellerLines.reduce((sum, l) => sum + l.sellingPrice * l.quantity, 0);
    const threshold = seller?.policies.freeShippingThreshold ?? SHIPPING.freeShippingThreshold;
    const qualifies = subtotal >= threshold;

    groups.push({
      sellerId,
      sellerName: seller?.displayName ?? 'Unknown seller',
      sellerSlug: seller?.slug ?? '',
      sellerRating: seller?.rating.average ?? 0,
      lines: sellerLines,
      subtotal,
      shippingFee: qualifies ? 0 : SHIPPING.standardFee,
      freeShippingThreshold: threshold,
      amountToFreeShipping: qualifies ? null : threshold - subtotal,
      estimatedDelivery: null,
      sellerOffers: [],
    });
  }

  /* ---------------------------------------------------------- pricing */

  const pricingLines: PricingLineInput[] = lines.map((line) => {
    const product = byProduct.get(line.productId)!;
    return {
      refId: line.item.id,
      variantId: line.variantId,
      sellerId: line.sellerId,
      categoryId: product.categoryId,
      quantity: line.quantity,
      unitMrp: line.mrp,
      unitSellingPrice: line.sellingPrice,
      categoryTaxRatePercent: product.taxRatePercent,
    };
  });

  const shippingBySeller: Record<string, number> = {};
  const freeShippingSellers: string[] = [];
  for (const group of groups) {
    shippingBySeller[group.sellerId] = SHIPPING.standardFee;
    if (group.shippingFee === 0) freeShippingSellers.push(group.sellerId);
  }

  const pricing = calculatePricing({
    lines: pricingLines,
    shippingBySeller,
    freeShippingSellers,
    giftWrapFee: cart.giftWrap ? SHIPPING.giftWrapFee : 0,
  });

  const allIssues = lines.flatMap((line) => line.issues);

  return {
    cartId: cart.id,
    groups,
    savedForLater: [],
    totalItems: lines.length,
    totalUnits: lines.reduce((sum, l) => sum + l.quantity, 0),
    pricing,
    coupon: null,
    availableCoupons: [],
    offers: [],
    issues: allIssues,
    // A single blocking issue anywhere stops the whole bag: the shopper is
    // buying one order, not one line.
    checkoutReady: lines.length > 0 && !allIssues.some((issue) => issue.blocking),
    creditAvailable: 0,
  };
}

/**
 * Everything that can be wrong with a bag line.
 *
 * Ordered by severity: a line that cannot be bought at all is reported before
 * a line whose price merely moved.
 */
function detectIssues(
  item: CartItem,
  product: Product,
  variant: ProductVariant,
  sellerActive: boolean,
): CartLineIssue[] {
  const issues: CartLineIssue[] = [];

  if (product.status !== 'PUBLISHED') {
    issues.push({
      kind: 'PRODUCT_UNPUBLISHED',
      blocking: true,
      message: 'This product is no longer on sale.',
      resolution: 'REMOVE',
    });
    return issues;
  }

  if (!sellerActive) {
    issues.push({
      kind: 'SELLER_INACTIVE',
      blocking: true,
      message: 'This seller is not currently accepting orders.',
      resolution: 'MOVE_TO_WISHLIST',
    });
    return issues;
  }

  if (!variant.isActive) {
    issues.push({
      kind: 'VARIANT_INACTIVE',
      blocking: true,
      message: 'This size has been discontinued.',
      resolution: 'REMOVE',
    });
    return issues;
  }

  if (variant.inventory.available <= 0) {
    issues.push({
      kind: 'OUT_OF_STOCK',
      blocking: true,
      message: 'Sold out while it was in your bag.',
      resolution: 'MOVE_TO_WISHLIST',
    });
    return issues;
  }

  if (item.quantity > variant.inventory.available) {
    issues.push({
      kind: 'INSUFFICIENT_STOCK',
      blocking: true,
      message: `Only ${variant.inventory.available} left — reduce the quantity to continue.`,
      resolution: 'REDUCE_QUANTITY',
      suggestedQuantity: variant.inventory.available,
    });
  }

  // A price move is never applied silently. An increase blocks until the
  // shopper acknowledges it; a decrease is good news and merely announced.
  if (variant.sellingPrice > item.priceAtAdd) {
    issues.push({
      kind: 'PRICE_INCREASED',
      blocking: true,
      message: 'The price went up since you added this.',
      resolution: 'ACCEPT_PRICE',
    });
  } else if (variant.sellingPrice < item.priceAtAdd) {
    issues.push({
      kind: 'PRICE_DECREASED',
      blocking: false,
      message: 'Good news — the price dropped since you added this.',
      resolution: 'NONE',
    });
  }

  if (
    variant.inventory.available > 0 &&
    variant.inventory.available <= INVENTORY.urgencyThreshold &&
    item.quantity <= variant.inventory.available
  ) {
    issues.push({
      kind: 'QUANTITY_LIMIT',
      blocking: false,
      message: `Only ${variant.inventory.available} left.`,
      resolution: 'NONE',
    });
  }

  return issues;
}
