'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';

import type { LiveMessage, LiveRequest, LiveSession } from '@/domain/types';

import {
  currentOwner,
  ensureGuestToken,
  getGuestToken,
  getSessionUser,
  requireSeller,
} from '../auth/session';
import * as cart from '../services/cart';
import { getProductById } from '../services/catalog';
import * as live from '../services/live';
import { LIMITS, hit, retryMessage } from '../security/rate-limit';

/**
 * Live commerce mutations.
 *
 * Same shape as the bag and wishlist actions: a plain `{ ok, error }` result
 * rather than a throw, so the client can render a precise failure beside the
 * control that was used. Every input is validated with zod on the server —
 * a Server Action is a public HTTP endpoint no matter what the client checked
 * first.
 *
 * ---------------------------------------------------------------------------
 * WHAT A BUYER IS NEVER GIVEN
 * ---------------------------------------------------------------------------
 * `meeting.hostUrl` is a host credential: whoever holds it can host the call,
 * mute the shopkeeper and admit strangers into their shop. It is stored on the
 * session and it must never cross into a buyer payload, so every buyer-facing
 * return here goes through `buyerView()` rather than returning the session
 * record. Trimming at the boundary rather than at each call site is the only
 * version of this rule that survives a new screen being added later.
 */

/* ------------------------------------------------------------------ shapes */

export interface LiveActionResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** The session as a shopper may see it. Host credentials removed. */
export interface BuyerSessionView {
  id: string;
  /** The request this call answered, so "find another store" can search again. */
  requestId: string;
  status: LiveSession['status'];
  /**
   * Carried so the room's Buy button can act without a second lookup.
   *
   * `variantId` may be null: the shopper can start a live request before
   * choosing a size, which is the common case — that is usually WHY they wanted
   * to see it. The room's Buy button is disabled in that state and sends them
   * to the product to pick one, rather than guessing a size on their behalf.
   */
  productId: string;
  variantId: string | null;
  productSlug: string;
  productTitle: string;
  productImage: string;
  sellingPrice: number;
  mrp: number;
  offeredPrice: number | null;
  /** When the offer lapses. The room counts it down, so checkout never surprises. */
  offerExpiresAt: string | null;
  /** Null until the shopper's room opens. Drives the call timer. */
  startedAt: string | null;
  messages: LiveMessage[];
  speakRequestedAt: string | null;
  sellerDisplayName: string;
  attendantName: string | null;
  /** The guest link only. */
  joinUrl: string | null;
  embeddable: boolean;
  joinToken: string | null;
}

function buyerView(session: LiveSession, slug: string): BuyerSessionView {
  return {
    id: session.id,
    requestId: session.requestId,
    status: session.status,
    productId: session.productId,
    variantId: session.variantId,
    productSlug: slug,
    productTitle: session.productTitle,
    productImage: session.productImage,
    sellingPrice: session.sellingPrice,
    mrp: session.mrp,
    offeredPrice: session.offeredPrice,
    offerExpiresAt: session.offerExpiresAt,
    startedAt: session.startedAt,
    messages: session.messages ?? [],
    speakRequestedAt: session.speakRequestedAt ?? null,
    sellerDisplayName: session.sellerDisplayName,
    attendantName: session.attendantName,
    joinUrl: session.meeting?.joinUrl ?? null,
    embeddable: session.meeting?.embeddable ?? false,
    joinToken: session.meeting?.joinToken ?? null,
  };
}

/* ------------------------------------------------------------------- buyer */

const startSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).nullable(),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit pincode.'),
  /*
   * Coordinates are optional and RANGE CHECKED.
   *
   * They come from the browser's geolocation API, which the shopper can refuse
   * — the flow falls back to a pincode match, so refusing must not be an error.
   * The bounds matter because these feed a distance calculation: a latitude of
   * 900 produces a NaN that would quietly drop every candidate rather than
   * failing loudly.
   */
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
});

/**
 * Start looking for a shop that can show this product live.
 *
 * Works signed-out. The whole point of the format is a shopper who is deciding,
 * and putting a sign-in wall in front of the deciding step is how a live
 * commerce feature gets no traffic. A guest token identifies the request so
 * only its owner can poll it; sign-in happens at checkout as it already does.
 */
export async function startLiveRequest(input: {
  productId: string;
  variantId: string | null;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
}): Promise<LiveActionResult<{ requestId: string; status: LiveRequest['status'] }>> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'That request was not valid.' };
  }

  const owner = await currentOwner();
  const guestKey = await ensureGuestToken();

  // Every request rings real shops. A few in ten minutes is a shopper trying
  // again; many more is somebody ringing every store in the city for sport.
  const limited = await hit(LIMITS.liveRequest, guestKey);
  if (!limited.allowed) return { ok: false, error: retryMessage(limited) };

  /*
   * The product snapshot is read HERE, on the server, not sent by the client.
   *
   * It is written onto the request and then onto the session, where it becomes
   * the price the live room shows and the Buy button charges. A client-supplied
   * price would be a client-supplied price.
   */
  const product = await getProductById(parsed.data.productId);
  if (!product || product.status !== 'PUBLISHED') {
    return { ok: false, error: 'That product is no longer available.' };
  }

  /*
   * Price the chosen variant, or the cheapest available one.
   *
   * The same rule the product page uses to quote before a size is picked —
   * never an average, which matches nothing actually on sale.
   */
  const variant =
    product.variants.find((v) => v.id === parsed.data.variantId) ??
    product.variants
      .filter((v) => v.isActive && v.inventory.available > 0)
      .sort((a, b) => a.sellingPrice - b.sellingPrice)[0] ??
    product.variants[0];

  if (!variant) {
    return { ok: false, error: 'That product is no longer available.' };
  }

  const request = await live.startRequest({
    buyerUserId: owner.kind === 'user' ? owner.userId : null,
    buyerKey: guestKey,
    productId: parsed.data.productId,
    variantId: parsed.data.variantId,
    productTitle: product.title,
    productImage: product.media[0]?.url ?? '',
    sellingPrice: variant.sellingPrice,
    mrp: variant.mrp,
    pincode: parsed.data.pincode,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
  });

  return { ok: true, data: { requestId: request.id, status: request.status } };
}

export async function cancelLiveRequest(requestId: string): Promise<LiveActionResult> {
  const guestKey = await getGuestToken();
  if (!guestKey) return { ok: true };
  await live.cancelRequest(requestId, guestKey);
  return { ok: true };
}

/**
 * Fetch the session a matched request produced.
 *
 * Ownership is checked against the same guest key the request was created with,
 * so a session id leaking into a log or a shared URL does not let a stranger
 * join somebody's call.
 */
export async function getLiveSession(
  sessionId: string,
): Promise<LiveActionResult<BuyerSessionView>> {
  /*
   * READ the token, never create one.
   *
   * `ensureGuestToken` writes a cookie, and this action is called during a
   * Server Component render on the session page — where setting a cookie throws.
   * It is also simply wrong here: a browser with no guest token cannot own a
   * session, so there is nothing to create one for.
   *
   * Only `startLiveRequest` mints a token, because only it begins something.
   */
  const guestKey = await getGuestToken();
  const session = await live.getSession(sessionId);

  if (!guestKey || !session || session.buyerKey !== guestKey) {
    return { ok: false, error: 'That live session could not be found.' };
  }

  const product = await getProductById(session.productId);
  return { ok: true, data: buyerView(session, product?.slug ?? '') };
}

/** Called by the buyer's room when the video surface has actually connected. */
export async function markLiveSessionActive(sessionId: string): Promise<LiveActionResult> {
  const guestKey = await getGuestToken();
  const session = await live.getSession(sessionId);
  if (!guestKey || !session || session.buyerKey !== guestKey) {
    return { ok: false, error: 'That live session could not be found.' };
  }

  await live.startSession(sessionId);
  return { ok: true };
}

/**
 * Hang up.
 *
 * Either party may call this, and both usually do — see `endSession`, which is
 * idempotent for exactly that reason.
 */
export async function endLiveSession(
  sessionId: string,
  outcome: 'PURCHASED' | 'NO_PURCHASE' | 'ABANDONED' = 'NO_PURCHASE',
): Promise<LiveActionResult> {
  const guestKey = await getGuestToken();
  const session = await live.getSession(sessionId);
  if (!session) return { ok: true };

  /*
   * Either side may end it, so this accepts the buyer's key OR a signed-in
   * seller who owns the session. A call that only one party can end is a call
   * that stays open when the other one's phone dies.
   */
  const isBuyer = guestKey !== null && session.buyerKey === guestKey;
  const user = isBuyer ? null : await getSessionUser();
  const isSeller = user?.sellerId != null && user.sellerId === session.sellerId;

  if (!isBuyer && !isSeller) {
    return { ok: false, error: 'You are not part of that call.' };
  }

  await live.endSession(sessionId, outcome);
  return { ok: true };
}

/* ------------------------------------------------------------------ seller */

const presenceSchema = z.object({
  locationId: z.string().min(1),
  state: z.enum(['ONLINE', 'OFFLINE']),
});

/**
 * Open or close the shop for live calls.
 *
 * `BUSY` is deliberately not accepted here: it is a consequence of being in a
 * call, set by the service, not something a shopkeeper declares. Letting it be
 * set from outside would allow a shop to appear busy forever and quietly stop
 * receiving calls while believing it was open.
 */
export async function setLivePresence(input: {
  locationId: string;
  state: 'ONLINE' | 'OFFLINE';
}): Promise<LiveActionResult> {
  const parsed = presenceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'That request was not valid.' };
  }

  const seller = await requireSeller();

  await live.setPresence({
    sellerId: seller.sellerId,
    locationId: parsed.data.locationId,
    state: parsed.data.state,
    attendantUserId: seller.id,
    attendantName: seller.fullName,
  });

  return { ok: true };
}

/** The heartbeat. See `PRESENCE_STALE_MS` for why presence expires on its own. */
export async function beatLivePresence(locationId: string): Promise<LiveActionResult> {
  const seller = await requireSeller();
  const existing = await live.getPresence(seller.sellerId);

  // Only refresh a shop that is already open. A heartbeat must never be able to
  // re-open a shop the shopkeeper has closed.
  if (!existing || existing.state === 'OFFLINE') return { ok: true };

  await live.setPresence({
    sellerId: seller.sellerId,
    locationId,
    state: existing.state,
    attendantUserId: existing.attendantUserId,
    attendantName: existing.attendantName,
  });

  return { ok: true };
}

/**
 * Take the call.
 *
 * A null result is the RACE being lost, not a failure — see `acceptRequest`.
 * The message says so plainly, because a shopkeeper whose button appears to do
 * nothing will press it again, and again.
 */
export async function acceptLiveRequest(
  requestId: string,
): Promise<LiveActionResult<{ sessionId: string; hostUrl: string | null; embeddable: boolean }>> {
  const seller = await requireSeller();

  const session = await live.acceptRequest({
    requestId,
    sellerId: seller.sellerId,
    attendantName: seller.fullName,
  });

  if (!session) {
    return { ok: false, error: 'Another store answered first.' };
  }

  if (session.status === 'FAILED') {
    return { ok: false, error: 'The live room could not be opened. Please try again.' };
  }

  // The host URL goes ONLY to the seller. See the header.
  return {
    ok: true,
    data: {
      sessionId: session.id,
      hostUrl: session.meeting?.hostUrl ?? null,
      embeddable: session.meeting?.embeddable ?? false,
    },
  };
}

export async function declineLiveRequest(requestId: string): Promise<LiveActionResult> {
  const seller = await requireSeller();
  await live.declineRequest(requestId, seller.sellerId);
  return { ok: true };
}

const offerSchema = z.object({
  sessionId: z.string().min(1),
  /** Paise. Bounded so a fat-fingered zero cannot sell stock for nothing. */
  price: z.number().int().positive().max(100_000_000),
});

/**
 * Offer a price during the call.
 *
 * Floored at 50% of the listed price. Live haggling is the point of the format,
 * but an offer is typed on a phone in a busy shop and a missing digit turns
 * ₹1,899 into ₹189 — which is a real order at a real loss. Half is far below
 * any genuine discount and well above a typo.
 */
export async function offerLivePrice(input: {
  sessionId: string;
  price: number;
}): Promise<LiveActionResult> {
  const parsed = offerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Enter a valid price.' };
  }

  const seller = await requireSeller();
  const session = await live.getSession(parsed.data.sessionId);

  if (!session || session.sellerId !== seller.sellerId) {
    return { ok: false, error: 'That live session could not be found.' };
  }

  if (parsed.data.price < Math.round(session.sellingPrice / 2)) {
    return { ok: false, error: 'That offer is far below the listed price. Check the amount.' };
  }

  await live.offerPrice(parsed.data.sessionId, seller.sellerId, parsed.data.price);
  return { ok: true };
}

/* ------------------------------------------------------------ in the call */

/** Who is asking: the shopper who owns the call, the shop hosting it, or nobody. */
async function callParty(session: LiveSession): Promise<LiveMessage['from'] | null> {
  const guestKey = await getGuestToken();
  if (guestKey && session.buyerKey === guestKey) return 'BUYER';
  const user = await getSessionUser();
  if (user?.sellerId && user.sellerId === session.sellerId) return 'SELLER';
  return null;
}

const messageSchema = z.object({
  sessionId: z.string().min(1),
  text: z.string().trim().min(1, 'Type a message.').max(200, 'Keep it under 200 characters.'),
});

/**
 * Say something without speaking.
 *
 * Either party may send; the sender is worked out from who is asking, never
 * taken from the request. Five messages in ten seconds is a stuck key or a
 * game, and the store is trying to hold a garment up to a camera.
 */
export async function sendLiveMessage(input: {
  sessionId: string;
  text: string;
}): Promise<LiveActionResult<LiveMessage>> {
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Type a message.' };
  }

  const session = await live.getSession(parsed.data.sessionId);
  if (!session) return { ok: false, error: 'That call has ended.' };

  const from = await callParty(session);
  if (!from) return { ok: false, error: 'You are not part of that call.' };

  const recent = (session.messages ?? []).filter(
    (message) => message.from === from && Date.now() - Date.parse(message.at) < 10_000,
  );
  if (recent.length >= 5) {
    return { ok: false, error: 'That is a lot at once. Give the store a moment.' };
  }

  const message = await live.postMessage(session.id, from, parsed.data.text);
  if (!message) return { ok: false, error: 'That call has ended.' };
  return { ok: true, data: message };
}

/** The shopper raises a hand. See `requestSpeak`. */
export async function requestLiveSpeak(sessionId: string): Promise<LiveActionResult> {
  const session = await live.getSession(sessionId);
  if (!session || (await callParty(session)) !== 'BUYER') {
    return { ok: false, error: 'That live session could not be found.' };
  }
  await live.requestSpeak(sessionId);
  return { ok: true };
}

/** The shop has seen the raised hand. */
export async function acknowledgeLiveSpeak(sessionId: string): Promise<LiveActionResult> {
  const seller = await requireSeller();
  await live.clearSpeakRequest(sessionId, seller.sellerId);
  return { ok: true };
}

/** Search again after nobody answered. Returns the NEW request to follow. */
export async function retryLiveRequest(
  requestId: string,
): Promise<LiveActionResult<{ requestId: string }>> {
  const guestKey = await getGuestToken();
  if (!guestKey) return { ok: false, error: 'Start again from the product.' };

  const request = await live.retryRequest(requestId, guestKey);
  if (!request) return { ok: false, error: 'Start again from the product.' };
  return { ok: true, data: { requestId: request.id } };
}

export interface SellerSessionView {
  id: string;
  status: LiveSession['status'];
  outcome: LiveSession['outcome'];
  offeredPrice: number | null;
  offerExpiresAt: string | null;
  startedAt: string | null;
  messages: LiveMessage[];
  speakRequestedAt: string | null;
}

/**
 * The shop's poll.
 *
 * Without it the shop's room never learned anything after it opened: not a
 * question typed by a muted shopper, not a raised hand, not even that the
 * shopper had hung up, which left a shopkeeper talking to an empty call.
 */
export async function getSellerLiveSession(
  sessionId: string,
): Promise<LiveActionResult<SellerSessionView>> {
  const seller = await requireSeller();
  const session = await live.getSession(sessionId);
  if (!session || session.sellerId !== seller.sellerId) {
    return { ok: false, error: 'That live session could not be found.' };
  }

  return {
    ok: true,
    data: {
      id: session.id,
      status: session.status,
      outcome: session.outcome,
      offeredPrice: session.offeredPrice,
      offerExpiresAt: session.offerExpiresAt,
      startedAt: session.startedAt,
      messages: session.messages ?? [],
      speakRequestedAt: session.speakRequestedAt ?? null,
    },
  };
}

/**
 * Put the piece in the bag at the price the store quoted.
 *
 * This is where a live offer becomes money, so everything the room SHOWS is
 * checked again here, on the server, because a client can send any number:
 * the call belongs to this browser, the size is a size of the product that was
 * on camera, and the offer is still current. Without a current offer it is an
 * ordinary add to bag at the listed price. Works after the call has ended too,
 * for as long as the offer lasts: hanging up is not a reason to lose the price.
 */
export async function buyAtLivePrice(input: {
  sessionId: string;
  variantId: string;
}): Promise<LiveActionResult<{ livePrice: number | null }>> {
  const guestKey = await getGuestToken();
  const session = await live.getSession(input.sessionId);
  if (!guestKey || !session || session.buyerKey !== guestKey) {
    return { ok: false, error: 'That live session could not be found.' };
  }

  const product = await getProductById(session.productId);
  const variant = product?.variants.find((v) => v.id === input.variantId);
  if (!product || !variant) return { ok: false, error: 'That size is no longer available.' };

  const owner = await currentOwner();
  const offer =
    session.offeredPrice !== null &&
    session.offerExpiresAt !== null &&
    Date.parse(session.offerExpiresAt) > Date.now() &&
    session.offeredPrice < variant.sellingPrice
      ? session.offeredPrice
      : null;

  const result =
    offer !== null
      ? await cart.addLiveOfferItem(owner, {
          productId: product.id,
          variantId: variant.id,
          hold: {
            sessionId: session.id,
            price: offer,
            expiresAt: session.offerExpiresAt as string,
            sellerName: session.sellerDisplayName,
          },
        })
      : await cart.addItem(owner, { productId: product.id, variantId: variant.id, quantity: 1 });

  if (!result.ok) return { ok: false, error: result.error };

  // The bag count is in the header of every page; see `addToBag`.
  refresh();
  return { ok: true, data: { livePrice: offer } };
}
