import 'server-only';

import {
  LIVE_MAX_DISTANCE_KM,
  LIVE_REQUEST_WINDOW_MS,
  LIVE_RING_BATCH,
  LIVE_RING_TIMEOUT_MS,
  LIVE_SESSION_MAX_MS,
  isPresenceLive,
  type LiveCandidateState,
} from '@/domain/live';
import { galleryAssets, reelAssets } from '@/domain/media';
import type {
  LiveCandidate,
  LiveMessage,
  LiveRequest,
  LiveRequestView,
  LiveSession,
  SellerPresence,
} from '@/domain/types';
import { connection } from 'next/server';

import { entityId } from '@/lib/ids';
import { collections } from '@/server/db/collections';
import { meetingProvider } from '@/server/live';

/**
 * Live commerce — matching and session lifecycle.
 * ===========================================================================
 * The whole of "See it live" happens here: find the shops that can show this
 * product, ring them in batches, take the first accept, open a room.
 *
 * ---------------------------------------------------------------------------
 * WHY THE RING STATE ADVANCES ON READ
 * ---------------------------------------------------------------------------
 * There is no scheduler in this application, and adding one for a sixty-second
 * process would be adding a moving part with its own failure modes, its own
 * deployment story and its own monitoring — to drive a countdown that only
 * matters while somebody is actively watching it.
 *
 * So `advance()` is called on every read, and it is what promotes queued
 * candidates to ringing, times out the ones that never answered, and expires
 * the request when the window closes. The shopper's screen polls every two
 * seconds, which means the state machine is driven by exactly the thing that
 * cares about it, and a request nobody is watching costs nothing at all.
 *
 * That has one consequence worth stating plainly: an abandoned request stays
 * `MATCHING` in the database until something reads it. It is invisible — the
 * seller side filters on `expiresAt`, so nobody is rung by a ghost — and the
 * sweep in `expireStale()` cleans it up. It is not a leak, it is a lazily
 * evaluated timer.
 *
 * ---------------------------------------------------------------------------
 * ACCEPTING IS A RACE, AND IT IS RESOLVED IN THE DATABASE
 * ---------------------------------------------------------------------------
 * Three shops are ringing. Two press accept within the same second. Exactly one
 * must get the call and the other must be told, immediately, that it lost —
 * because the alternative is two shopkeepers walking to their shelves for one
 * pair of shoes.
 *
 * `accept()` therefore claims the request with a single conditional update that
 * only matches while the request is still `MATCHING` and unclaimed. Whoever
 * loses that update gets `null` back and is shown "another store answered".
 * Checking-then-writing would leave a window between the two, and at these
 * timings that window is where the bug lives.
 */

/* ------------------------------------------------------------------ geo */

/**
 * Great-circle distance in kilometres.
 *
 * Haversine rather than a flat approximation. A flat one is fine at these
 * distances and wrong in a way that is hard to notice — it under-reports as
 * latitude rises, so a shop in Chandigarh reads as nearer than one in Chennai
 * at the same true distance. This is fifteen lines and simply correct.
 */
function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * How candidates are ordered, and therefore who gets rung first.
 *
 * Distance dominates, because the promise is "your neighbourhood" — but not
 * absolutely, or a mediocre shop 200m away would out-rank an excellent one
 * three streets over on every single request, forever. Rating shifts a shop by
 * up to a kilometre of apparent distance, which is enough to break ties and far
 * too little to make "local" mean anything else.
 */
function rank(candidate: { distanceKm: number; ratingAverage: number }): number {
  return candidate.distanceKm - (candidate.ratingAverage - 3) * 0.5;
}

/* --------------------------------------------------------------- presence */

/**
 * Mark a shop open, or refresh its heartbeat.
 *
 * Upsert rather than insert-or-update by hand: a seller toggling live twice
 * quickly, or two tabs open in the shop, must converge on one record rather
 * than racing to create two and ringing the shop twice for one shopper.
 */
export async function setPresence(input: {
  sellerId: string;
  locationId: string;
  state: SellerPresence['state'];
  attendantUserId: string | null;
  attendantName: string | null;
}): Promise<void> {
  const presence = await collections.sellerPresence();
  const now = new Date().toISOString();

  await presence.updateOne(
    { sellerId: input.sellerId, locationId: input.locationId },
    {
      $set: {
        state: input.state,
        lastSeenAt: now,
        attendantUserId: input.attendantUserId,
        attendantName: input.attendantName,
        updatedAt: now,
      },
      $setOnInsert: {
        _id: entityId('prs'),
        id: entityId('prs'),
        sellerId: input.sellerId,
        locationId: input.locationId,
        activeSessionId: null,
      },
    },
    { upsert: true },
  );
}

export async function getPresence(sellerId: string): Promise<SellerPresence | null> {
  const presence = await collections.sellerPresence();
  const found = await presence.findOne({ sellerId });
  if (!found) return null;

  const record = found as unknown as SellerPresence;
  // A stale heartbeat is reported as offline rather than as what it claims —
  // the caller should never have to remember to check the clock.
  if (!isPresenceLive(record.state, record.lastSeenAt)) {
    return { ...record, state: 'OFFLINE' };
  }
  return record;
}

/* ---------------------------------------------------------------- matching */

export interface StartRequestInput {
  buyerUserId: string | null;
  buyerKey: string;
  productId: string;
  variantId: string | null;
  productTitle: string;
  productImage: string;
  sellingPrice: number;
  mrp: number;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Open a request and build its candidate list.
 *
 * Returns a request in `NO_SELLERS` rather than throwing when nothing matches.
 * "No shop near you has this live right now" is an ANSWER — the screen can show
 * it, offer the normal buy button and suggest a time — whereas an exception is
 * a dead end that reads as a broken feature.
 */
export async function startRequest(input: StartRequestInput): Promise<LiveRequest> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const candidates = await findCandidates(input);

  const request: LiveRequest = {
    id: entityId('lrq'),
    buyerUserId: input.buyerUserId,
    buyerKey: input.buyerKey,
    productId: input.productId,
    variantId: input.variantId,
    productTitle: input.productTitle,
    productImage: input.productImage,
    sellingPrice: input.sellingPrice,
    mrp: input.mrp,
    pincode: input.pincode,
    latitude: input.latitude,
    longitude: input.longitude,
    status: candidates.length === 0 ? 'NO_SELLERS' : 'MATCHING',
    candidates,
    sessionId: null,
    acceptedSellerId: null,
    expiresAt: new Date(now + LIVE_REQUEST_WINDOW_MS).toISOString(),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // The first batch starts ringing immediately. Inserting them all as QUEUED
  // and waiting for the first poll would waste two seconds of a sixty-second
  // window on every single request.
  if (request.status === 'MATCHING') {
    for (const candidate of request.candidates.slice(0, LIVE_RING_BATCH)) {
      candidate.state = 'RINGING';
      candidate.ringingAt = nowIso;
    }
  }

  const requests = await collections.liveRequests();
  await requests.insertOne({ ...request, _id: request.id });

  return request;
}

/**
 * Which shops can show this product, right now, near enough to count.
 *
 * ---------------------------------------------------------------------------
 * "THE SAME PRODUCT" ACROSS SELLERS
 * ---------------------------------------------------------------------------
 * This is the part that does not fall out of the existing catalogue model, and
 * it is worth being explicit about.
 *
 * A `Product` here belongs to ONE seller — it is a listing, not a catalogue
 * entry. The same Nike model stocked by four shops is four product records. So
 * "which shops can show me these shoes" cannot be answered by looking up the
 * product's `sellerId`: that returns exactly one shop, and makes the whole
 * fan-out pointless.
 *
 * `styleCode` is the bridge. It is the manufacturer's style code printed on the
 * label, so two shops stocking the same model genuinely share one — that is
 * what a style code IS. Matching on brand plus style code therefore finds the
 * same physical product across sellers, which is precisely the question being
 * asked.
 *
 * Two tiers, because they are different promises:
 *
 *   EXACT   same brand and style code. This shop has this item.
 *   CLOSE   same brand and leaf category. This shop carries this brand in this
 *           category, and can likely show these or something very near.
 *
 * Exact always outranks close regardless of distance, because a shop that
 * cannot produce the item is a wasted call however near it is. Within a tier,
 * distance and rating decide — see `rank`.
 *
 * The proper long-term fix is a shared catalogue identity (a GTIN, or an
 * internal style record that several listings point at), which would make the
 * exact tier authoritative rather than inferred. Style code gets there for most
 * real inventory and needs no migration.
 *
 * ---------------------------------------------------------------------------
 * FILTER ORDER
 * ---------------------------------------------------------------------------
 * Presence first, then stock, then distance — the order that discards the most
 * for the least work. Only a handful of shops are ever live at once, so leading
 * with presence turns a catalogue-wide query into a lookup over a short list.
 * Reversing it would compute a haversine for every seller in the country in
 * order to discard all but four.
 */
async function findCandidates(input: StartRequestInput): Promise<LiveCandidate[]> {
  const [presenceCol, productCol, sellerCol, locationCol] = await Promise.all([
    collections.sellerPresence(),
    collections.products(),
    collections.sellers(),
    collections.sellerLocations(),
  ]);

  const live = (await presenceCol
    .find({ state: { $in: ['ONLINE', 'BUSY'] } })
    .toArray()) as unknown as SellerPresence[];

  const fresh = live.filter((p) => isPresenceLive(p.state, p.lastSeenAt));
  if (fresh.length === 0) return [];

  const subject = await productCol.findOne({ _id: input.productId });
  if (!subject) return [];

  const liveSellerIds = [...new Set(fresh.map((p) => p.sellerId))];

  /*
   * One query for both tiers.
   *
   * `$or` across (brand + style) and (brand + category), scoped to sellers that
   * are actually live and to listings that are actually buyable. Splitting it
   * into two round trips would double the latency of the slowest step in a flow
   * where a shopper is already watching a countdown.
   */
  const listings = await productCol
    .find({
      sellerId: { $in: liveSellerIds },
      // 'PUBLISHED' is the buyable state — see `listing.ts`, which filters the
      // storefront on the same value.
      status: 'PUBLISHED',
      brandId: subject.brandId,
      $or: [{ styleCode: subject.styleCode }, { categoryId: subject.categoryId }],
    })
    .toArray();

  /** sellerId -> whether that seller has the exact style, not merely the brand. */
  const stocking = new Map<string, boolean>();
  for (const listing of listings) {
    const exact = listing.styleCode === subject.styleCode;
    stocking.set(listing.sellerId, (stocking.get(listing.sellerId) ?? false) || exact);
  }
  if (stocking.size === 0) return [];

  const ids = [...stocking.keys()];
  const [sellers, locations] = await Promise.all([
    sellerCol.find({ _id: { $in: ids } }).toArray(),
    locationCol.find({ sellerId: { $in: ids } }).toArray(),
  ]);

  const sellerById = new Map(sellers.map((s) => [s.id, s]));
  const locationById = new Map(locations.map((l) => [l.id, l]));

  const scored: Array<{ candidate: LiveCandidate; exact: boolean }> = [];

  for (const presence of fresh) {
    const exact = stocking.get(presence.sellerId);
    if (exact === undefined) continue;

    const seller = sellerById.get(presence.sellerId);
    const location = locationById.get(presence.locationId);
    if (!seller || !location) continue;

    /*
     * A shop with no coordinates is never matched.
     *
     * See `SellerLocation`: coordinates are geocoded, not typed, and a seller
     * whose address has not resolved yet must still be able to sell normally.
     * Guessing a position from the pincode would put them in the wrong
     * neighbourhood and match them to people they cannot reach.
     */
    if (location.latitude === null || location.longitude === null) continue;

    let km = 0;
    if (input.latitude !== null && input.longitude !== null) {
      km = distanceKm(
        { lat: input.latitude, lon: input.longitude },
        { lat: location.latitude, lon: location.longitude },
      );
      if (km > LIVE_MAX_DISTANCE_KM) continue;
    } else if (location.pincode !== input.pincode) {
      /*
       * No geolocation permission, so fall back to an exact pincode match.
       *
       * Deliberately strict. Without coordinates there is no way to tell 800m
       * from 8km, and a "nearby" shop that turns out to be across the city
       * breaks the one promise this feature makes. Same pincode is the only
       * claim that can be made honestly, and the distance is left at zero
       * rather than invented.
       */
      continue;
    }

    scored.push({
      exact,
      candidate: {
        sellerId: seller.id,
        locationId: location.id,
        displayName: seller.displayName,
        logoUrl: seller.logoUrl,
        area: [location.line2, location.city].filter(Boolean).join(', '),
        ratingAverage: seller.rating.average,
        ratingCount: seller.rating.count,
        distanceKm: Number(km.toFixed(1)),
        hasExactItem: exact,
        // A shop already in a call is queued behind the free ones rather than
        // excluded: it may well finish inside the window.
        state: 'QUEUED',
        ringingAt: null,
        respondedAt: null,
      },
    });
  }

  return scored
    .sort((a, b) => {
      // Tier first, and absolutely: a shop that cannot produce the item is a
      // wasted call however near it is.
      if (a.exact !== b.exact) return a.exact ? -1 : 1;
      return rank(a.candidate) - rank(b.candidate);
    })
    // More than eight is a list nobody reads and a lot of shopkeepers
    // interrupted for one sale.
    .slice(0, 8)
    .map((entry) => entry.candidate);
}

/* ---------------------------------------------------------------- advance */

/**
 * Move the request's clock forward.
 *
 * Pure given a timestamp, and returns whether anything changed so the caller
 * can skip the write on the (common) poll where nothing has. Called on every
 * read — see the header for why there is no scheduler.
 */
function advance(request: LiveRequest, now: number): boolean {
  if (request.status !== 'MATCHING') return false;

  let changed = false;

  if (now >= Date.parse(request.expiresAt)) {
    request.status = 'EXPIRED';
    for (const candidate of request.candidates) {
      if (candidate.state === 'RINGING') candidate.state = 'TIMED_OUT';
      if (candidate.state === 'QUEUED') candidate.state = 'SUPERSEDED';
    }
    return true;
  }

  // Ring-outs first, so the batch that replaces them is filled in the same pass
  // and a shopper never sees fewer than three shops being called.
  for (const candidate of request.candidates) {
    if (candidate.state !== 'RINGING' || !candidate.ringingAt) continue;
    if (now - Date.parse(candidate.ringingAt) >= LIVE_RING_TIMEOUT_MS) {
      candidate.state = 'TIMED_OUT';
      candidate.respondedAt = new Date(now).toISOString();
      changed = true;
    }
  }

  const ringing = request.candidates.filter((c) => c.state === 'RINGING').length;
  if (ringing < LIVE_RING_BATCH) {
    for (const candidate of request.candidates) {
      if (request.candidates.filter((c) => c.state === 'RINGING').length >= LIVE_RING_BATCH) break;
      if (candidate.state !== 'QUEUED') continue;
      candidate.state = 'RINGING';
      candidate.ringingAt = new Date(now).toISOString();
      changed = true;
    }
  }

  /*
   * Nobody left to ring, and the window still open.
   *
   * The request expires NOW rather than letting the countdown run down to zero
   * in front of a shopper for whom nothing further can happen. A spinner that
   * is known to be pointless is worse than an answer.
   */
  const pending = request.candidates.some(
    (c) => c.state === 'RINGING' || c.state === 'QUEUED',
  );
  if (!pending) {
    request.status = 'EXPIRED';
    changed = true;
  }

  return changed;
}

/** Read a request, advancing its clock, and shape it for the polling screen. */
export async function pollRequest(
  requestId: string,
  buyerKey: string,
): Promise<LiveRequestView | null> {
  const requests = await collections.liveRequests();
  const found = await requests.findOne({ _id: requestId });
  if (!found) return null;

  const request = found as unknown as LiveRequest;
  // The key is the whole of a guest's authorisation. Without it, a request id
  // in a log would let anyone watch a stranger's match.
  if (request.buyerKey !== buyerKey) return null;

  const now = Date.now();
  if (advance(request, now)) {
    await requests.updateOne(
      { _id: requestId },
      {
        $set: {
          status: request.status,
          candidates: request.candidates,
          updatedAt: new Date(now).toISOString(),
        },
      },
    );
  }

  return {
    id: request.id,
    status: request.status,
    candidates: request.candidates,
    sessionId: request.sessionId,
    secondsRemaining: Math.max(
      0,
      Math.ceil((Date.parse(request.expiresAt) - now) / 1000),
    ),
  };
}

/** What a seller's console shows as incoming calls. */
export async function pendingForSeller(sellerId: string): Promise<LiveRequest[]> {
  const requests = await collections.liveRequests();
  const now = new Date().toISOString();

  const found = await requests
    .find({
      status: 'MATCHING',
      expiresAt: { $gt: now },
      candidates: { $elemMatch: { sellerId, state: 'RINGING' } },
    })
    .toArray();

  return found as unknown as LiveRequest[];
}

/* ----------------------------------------------------------------- accept */

/**
 * Claim a request and open the room.
 *
 * Returns null when the race was lost — see the header. The caller shows
 * "another store answered", which is the honest reason and the only one that
 * stops a shopkeeper wondering whether their button is broken.
 */
export async function acceptRequest(input: {
  requestId: string;
  sellerId: string;
  attendantName: string | null;
}): Promise<LiveSession | null> {
  const requests = await collections.liveRequests();
  const now = new Date().toISOString();

  /*
   * One conditional update decides the winner.
   *
   * The filter is the guard: still matching, not already claimed, not expired,
   * and this seller genuinely was ringing. Mongo applies it atomically, so the
   * loser's update matches nothing and returns a null document. There is no
   * window between the check and the write, because there is no check.
   */
  const claimed = await requests.findOneAndUpdate(
    {
      _id: input.requestId,
      status: 'MATCHING',
      acceptedSellerId: null,
      expiresAt: { $gt: now },
      candidates: { $elemMatch: { sellerId: input.sellerId, state: 'RINGING' } },
    },
    { $set: { status: 'MATCHED', acceptedSellerId: input.sellerId, updatedAt: now } },
    { returnDocument: 'after' },
  );

  if (!claimed) return null;

  const request = claimed as unknown as LiveRequest;

  const [sellerCol] = await Promise.all([collections.sellers()]);
  const seller = await sellerCol.findOne({ _id: input.sellerId });
  const candidate = request.candidates.find((c) => c.sellerId === input.sellerId);

  const session: LiveSession = {
    id: entityId('lss'),
    requestId: request.id,
    buyerUserId: request.buyerUserId,
    buyerKey: request.buyerKey,
    sellerId: input.sellerId,
    locationId: candidate?.locationId ?? '',
    productId: request.productId,
    variantId: request.variantId,
    productTitle: request.productTitle,
    productImage: request.productImage,
    sellingPrice: request.sellingPrice,
    mrp: request.mrp,
    attendantName: input.attendantName,
    sellerDisplayName: seller?.displayName ?? candidate?.displayName ?? 'Store',
    status: 'PENDING',
    meeting: null,
    offeredPrice: null,
    offerExpiresAt: null,
    outcome: null,
    orderId: null,
    startedAt: null,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  /*
   * The room is created AFTER the claim, not before.
   *
   * Creating it first would mean every losing seller in the race also created a
   * room — three rooms billed for one call, two of them abandoned. Claiming
   * first means exactly one room is ever created per request.
   *
   * If creation fails the session is still written, in `FAILED`. A session that
   * exists and says it failed can be shown, retried and counted; one that was
   * never written is a shopkeeper who pressed accept and watched nothing
   * happen.
   */
  try {
    const provider = meetingProvider();
    session.meeting = await provider.createRoom({
      sessionId: session.id,
      subject: `${request.productTitle} — live at ${session.sellerDisplayName}`,
      hostName: session.attendantName ?? session.sellerDisplayName,
      guestName: 'Shopper',
      maxMinutes: Math.round(LIVE_SESSION_MAX_MS / 60_000),
    });
  } catch (error) {
    console.error('[vestrawab:live] room creation failed', error);
    session.status = 'FAILED';
  }

  const sessions = await collections.liveSessions();
  await sessions.insertOne({ ...session, _id: session.id });

  await requests.updateOne({ _id: request.id }, { $set: { sessionId: session.id } });

  // Everyone else stops ringing at once. Without this the losers' phones keep
  // going until they time out, for a call that has already started.
  await requests.updateOne(
    { _id: request.id },
    {
      $set: {
        'candidates.$[winner].state': 'ACCEPTED' satisfies LiveCandidateState,
        'candidates.$[winner].respondedAt': now,
      },
    },
    { arrayFilters: [{ 'winner.sellerId': input.sellerId }] },
  );

  await requests.updateOne(
    { _id: request.id },
    { $set: { 'candidates.$[other].state': 'SUPERSEDED' satisfies LiveCandidateState } },
    {
      arrayFilters: [
        { 'other.sellerId': { $ne: input.sellerId }, 'other.state': { $in: ['RINGING', 'QUEUED'] } },
      ],
    },
  );

  await markBusy(input.sellerId, session.id);

  return session;
}

/** A seller who declines drops out of this request only. */
export async function declineRequest(requestId: string, sellerId: string): Promise<void> {
  const requests = await collections.liveRequests();
  await requests.updateOne(
    { _id: requestId, status: 'MATCHING' },
    {
      $set: {
        'candidates.$[me].state': 'DECLINED' satisfies LiveCandidateState,
        'candidates.$[me].respondedAt': new Date().toISOString(),
      },
    },
    { arrayFilters: [{ 'me.sellerId': sellerId, 'me.state': 'RINGING' }] },
  );
}

export async function cancelRequest(requestId: string, buyerKey: string): Promise<void> {
  const requests = await collections.liveRequests();
  await requests.updateOne(
    { _id: requestId, buyerKey, status: 'MATCHING' },
    { $set: { status: 'CANCELLED', updatedAt: new Date().toISOString() } },
  );
}

/* ---------------------------------------------------------------- sessions */

async function markBusy(sellerId: string, sessionId: string | null): Promise<void> {
  const presence = await collections.sellerPresence();
  await presence.updateOne(
    { sellerId },
    {
      $set: {
        state: sessionId ? 'BUSY' : 'ONLINE',
        activeSessionId: sessionId,
        updatedAt: new Date().toISOString(),
      },
    },
  );
}

export async function getSession(sessionId: string): Promise<LiveSession | null> {
  const sessions = await collections.liveSessions();
  const found = await sessions.findOne({ _id: sessionId });
  return found ? (found as unknown as LiveSession) : null;
}

export async function startSession(sessionId: string): Promise<void> {
  const sessions = await collections.liveSessions();
  const now = new Date().toISOString();
  await sessions.updateOne(
    { _id: sessionId, status: 'PENDING' },
    { $set: { status: 'ACTIVE', startedAt: now, updatedAt: now } },
  );
}

/**
 * End a call and release the shop.
 *
 * Idempotent: both participants hang up, and both hang-ups land here. The
 * status filter means the second one changes nothing, and `endRoom` is
 * contractually silent about a room that has already gone.
 */
export async function endSession(
  sessionId: string,
  outcome: LiveSession['outcome'] = 'NO_PURCHASE',
): Promise<void> {
  const sessions = await collections.liveSessions();
  const found = await sessions.findOne({ _id: sessionId });
  if (!found) return;

  const session = found as unknown as LiveSession;
  if (session.status === 'ENDED') return;

  const now = new Date().toISOString();
  await sessions.updateOne(
    { _id: sessionId },
    {
      $set: {
        status: 'ENDED',
        outcome: session.outcome ?? outcome,
        endedAt: now,
        updatedAt: now,
      },
    },
  );

  if (session.meeting) {
    try {
      await meetingProvider().endRoom(session.meeting);
    } catch (error) {
      // Never let a vendor failure block the shop from taking its next call.
      console.warn('[vestrawab:live] room teardown failed', error);
    }
  }

  await markBusy(session.sellerId, null);
}

/**
 * Record a price the shop offered during the call.
 *
 * Live haggling is the point of the format in this market, so the offer has to
 * outlive the conversation and reach the bag. It expires because a price agreed
 * in a demo is not a price the shop is bound to a week later.
 */
export async function offerPrice(
  sessionId: string,
  sellerId: string,
  price: number,
  validMinutes = 30,
): Promise<void> {
  const sessions = await collections.liveSessions();
  await sessions.updateOne(
    { _id: sessionId, sellerId, status: { $in: ['PENDING', 'ACTIVE'] } },
    {
      $set: {
        offeredPrice: price,
        offerExpiresAt: new Date(Date.now() + validMinutes * 60_000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
  );
}

/**
 * Housekeeping for requests and sessions nobody is watching.
 *
 * Called from the seller console's poll — the one place guaranteed to run
 * regularly while the feature is in use — rather than from a cron this
 * application does not have. It is cheap, indexed on status, and bounded.
 */
export async function expireStale(): Promise<void> {
  const now = new Date().toISOString();

  const requests = await collections.liveRequests();
  await requests.updateMany(
    { status: 'MATCHING', expiresAt: { $lte: now } },
    { $set: { status: 'EXPIRED', updatedAt: now } },
  );

  const sessions = await collections.liveSessions();
  const cutoff = new Date(Date.now() - LIVE_SESSION_MAX_MS).toISOString();
  const overrun = (await sessions
    .find({ status: { $in: ['PENDING', 'ACTIVE'] }, createdAt: { $lte: cutoff } })
    .toArray()) as unknown as LiveSession[];

  for (const session of overrun) {
    await endSession(session.id, session.startedAt ? 'NO_PURCHASE' : 'ABANDONED');
  }
}

/**
 * The static half of a request, for the matching screen.
 *
 * Separate from `pollRequest` because the two have different lifetimes: this is
 * read once when the screen mounts, while the poll runs every two seconds for a
 * minute. Folding these fields into `LiveRequestView` would send an unchanging
 * product title thirty times over one match.
 *
 * Ownership is checked here too rather than trusted from the caller — a helper
 * that returns somebody's product only when asked nicely is a helper that will
 * eventually be called from somewhere that forgot to ask.
 */
export async function describeRequest(
  requestId: string,
  buyerKey: string,
): Promise<{ productId: string; productTitle: string; productImage: string } | null> {
  const requests = await collections.liveRequests();
  const found = await requests.findOne({ _id: requestId });
  if (!found) return null;

  const request = found as unknown as LiveRequest;
  if (request.buyerKey !== buyerKey) return null;

  return {
    productId: request.productId,
    productTitle: request.productTitle,
    productImage: request.productImage,
  };
}


/* ------------------------------------------------------------- reporting */

export interface LiveStats {
  /** Calls answered in the window. */
  sessions: number;
  /** Of those, how many ended in an order. */
  purchased: number;
  /** Percentage, 0-100. Null when there were no calls to derive one from. */
  conversionRate: number | null;
  /** Requests this shop was rung for but did not answer in time. */
  missed: number;
}

/**
 * What live commerce is actually worth to one shop.
 *
 * This exists because the outcome was already being recorded and nothing read
 * it — and an outcome nobody reads is a column, not a metric. A live commerce
 * feature that cannot report its conversion rate is a feature nobody can decide
 * to keep, which is the decision this number exists to inform.
 *
 * `missed` is deliberately alongside it. Conversion alone flatters a shop that
 * answers one call a week and sells on it; the two together say whether the
 * shop is good at this AND whether it is showing up.
 *
 * Counted, not aggregated: three `countDocuments` on indexed fields is cheaper
 * than a pipeline here, and it stays readable.
 */
export async function getLiveStats(sellerId: string, days = 30): Promise<LiveStats> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [sessionCol, requestCol] = await Promise.all([
    collections.liveSessions(),
    collections.liveRequests(),
  ]);

  const [sessions, purchased, missed] = await Promise.all([
    sessionCol.countDocuments({ sellerId, createdAt: { $gte: since } }),
    sessionCol.countDocuments({ sellerId, createdAt: { $gte: since }, outcome: 'PURCHASED' }),
    /*
     * A miss is a request where this shop rang out — not one it declined.
     *
     * Declining is a legitimate answer ("I do not have it in that size"), and
     * counting it as a miss would push shops toward answering calls they cannot
     * serve, which wastes the shopper's window and the shop's afternoon.
     */
    requestCol.countDocuments({
      createdAt: { $gte: since },
      candidates: { $elemMatch: { sellerId, state: 'TIMED_OUT' } },
    }),
  ]);

  return {
    sessions,
    purchased,
    // Null rather than 0 when there is nothing to divide: "0%" reads as failure,
    // and no calls is not a failure to convert.
    conversionRate: sessions > 0 ? Math.round((purchased / sessions) * 1000) / 10 : null,
    missed,
  };
}


/* ----------------------------------------------------------------- reels */

export interface ReelView {
  id: string;
  videoUrl: string | null;
  posterUrl: string;
  caption: string;
  sellerName: string;
  sellerSlug: string;
  sellerLogoUrl: string;
  sellerIsLive: boolean;
  productId: string;
  productSlug: string;
  productTitle: string;
  productImage: string;
  sellingPrice: number;
  mrp: number;
  discountPercent: number;
  likes: number;
}

/**
 * The reel feed.
 *
 * ---------------------------------------------------------------------------
 * THESE ARE BUILT FROM PRODUCT PHOTOGRAPHY, NOT FROM UPLOADED CLIPS
 * ---------------------------------------------------------------------------
 * And that is worth saying plainly rather than hiding behind a field name.
 *
 * There is no clip on any product in this catalogue — sellers have never been
 * asked for one, and there is no upload path for video. So each reel is a
 * product's own hero shot with its caption drawn from the listing, and
 * `videoUrl` is null. `ReelsFeed` renders that as a full-bleed poster, which is
 * a legitimate reel and not a placeholder.
 *
 * The shape is the finished one: the moment a `media` entry of kind `VIDEO`
 * exists, this returns it and the feed plays it with no change to the
 * component. What is missing is the seller-side upload, not this.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS IN THE FEED
 * ---------------------------------------------------------------------------
 * Shops that are LIVE come first. That is the whole point of putting reels in
 * this application rather than treating them as a marketing surface: a shopper
 * watching a clip is already interested, and if that shop is standing there
 * right now the feed can hand them straight to a call.
 *
 * After that it is recency, because a reel feed that shows the same twelve
 * items every day is a feed nobody opens twice.
 */
export async function getReels(limit = 15): Promise<ReelView[]> {
  /*
   * Declare this request-time before reading the clock.
   *
   * Presence is decided by comparing a heartbeat against `Date.now()`, and
   * under Cache Components an unstable value during prerender is a build error
   * rather than a silent opt-out — correctly, because a prerendered feed would
   * freeze every shop's shutter at build time and show them as live all day.
   *
   * Every other dynamic surface in this application announces itself by reading
   * a cookie through the session helpers. This one reads no request data at all,
   * only the clock, so it has to say so explicitly.
   */
  await connection();

  const [productCol, sellerCol, presenceCol] = await Promise.all([
    collections.products(),
    collections.sellers(),
    collections.sellerPresence(),
  ]);

  const products = await productCol
    .find({ status: 'PUBLISHED' })
    .sort({ createdAt: -1 })
    // Over-fetch, because some listings will be dropped below for having no
    // usable photograph and the feed should still come back full.
    .limit(limit * 3)
    .toArray();

  if (products.length === 0) return [];

  const sellerIds = [...new Set(products.map((p) => p.sellerId))];

  const [sellers, presence] = await Promise.all([
    sellerCol.find({ _id: { $in: sellerIds } }).toArray(),
    presenceCol.find({ sellerId: { $in: sellerIds } }).toArray(),
  ]);

  const sellerById = new Map(sellers.map((seller) => [seller.id, seller]));

  const liveSellers = new Set(
    (presence as unknown as SellerPresence[])
      .filter((record) => isPresenceLive(record.state, record.lastSeenAt))
      .map((record) => record.sellerId),
  );

  const reels: ReelView[] = [];

  for (const product of products) {
    const seller = sellerById.get(product.sellerId);
    if (!seller) continue;

    /*
     * The clips a seller shot FOR this feed, and nothing else.
     *
     * Sellers upload vertical clips into a reel slot on the listing form, and
     * each one earns its own entry here. The landscape product video is
     * deliberately not a fallback: letterboxed 16:9 in a full-screen vertical
     * feed looks like a mistake, so a listing with no reels appears as its
     * photograph, exactly as it did before video existed.
     */
    const clips = reelAssets(product.media);
    const poster = galleryAssets(product.media)[0] ?? null;

    // No photograph, no reel. A full-screen empty frame is worse than a shorter
    // feed.
    if (!poster) continue;

    const variant =
      product.variants.find((v) => v.isActive && v.inventory.available > 0) ?? product.variants[0];
    if (!variant) continue;

    const discountPercent =
      variant.mrp > variant.sellingPrice
        ? Math.round(((variant.mrp - variant.sellingPrice) / variant.mrp) * 100)
        : 0;

    // A listing with several clips earns several entries; one with none
    // still appears, as its photograph.
    for (const clip of clips.length > 0 ? clips : [null]) {
      reels.push({
        id: clip ? `${product.id}-${clip.id}` : product.id,
        videoUrl: clip?.url ?? null,
        posterUrl: poster.url,
        // The listing's first highlight, which is written as a short selling line
        // and reads far better over a clip than a truncated description would.
        caption: product.highlights[0] ?? product.title,
        sellerName: seller.displayName,
        sellerSlug: seller.slug,
        sellerLogoUrl: seller.logoUrl,
        sellerIsLive: liveSellers.has(seller.id),
        productId: product.id,
        productSlug: product.slug,
        productTitle: product.title,
        productImage: poster.url,
        sellingPrice: variant.sellingPrice,
        mrp: variant.mrp,
        discountPercent,
        likes: product.rating.count,
      });
    }
  }

  // Live shops to the front, order otherwise preserved (already newest first).
  return reels
    .sort((a, b) => Number(b.sellerIsLive) - Number(a.sellerIsLive))
    .slice(0, limit);
}

/* --------------------------------------------------------- in the call */

const MESSAGE_LIMIT = 50;
const OPEN: LiveSession['status'][] = ['PENDING', 'ACTIVE'];

/**
 * Add a line of text to a call.
 *
 * Only while the call is open: a message into an ended call reaches nobody and
 * would sit on the record as if it had been read. `$slice` keeps the newest
 * fifty, far more than a ten-minute call produces and small enough that the
 * room's poll never carries a transcript.
 */
export async function postMessage(
  sessionId: string,
  from: LiveMessage['from'],
  text: string,
): Promise<LiveMessage | null> {
  const message: LiveMessage = { id: entityId('lmg'), from, text, at: new Date().toISOString() };
  const sessions = await collections.liveSessions();
  const result = await sessions.updateOne(
    { _id: sessionId, status: { $in: OPEN } },
    {
      $push: { messages: { $each: [message], $slice: -MESSAGE_LIMIT } },
      $set: { updatedAt: message.at },
    },
  );
  return result.modifiedCount > 0 ? message : null;
}

/**
 * The shopper asks to speak.
 *
 * The provider joins them muted and only the host can open their microphone,
 * so this is a hand raised, not a switch: the shop sees it and unmutes them
 * with the meeting's own host controls.
 */
export async function requestSpeak(sessionId: string): Promise<void> {
  const sessions = await collections.liveSessions();
  const now = new Date().toISOString();
  await sessions.updateOne(
    { _id: sessionId, status: { $in: OPEN } },
    { $set: { speakRequestedAt: now, updatedAt: now } },
  );
}

export async function clearSpeakRequest(sessionId: string, sellerId: string): Promise<void> {
  const sessions = await collections.liveSessions();
  await sessions.updateOne(
    { _id: sessionId, sellerId },
    { $set: { speakRequestedAt: null, updatedAt: new Date().toISOString() } },
  );
}

/**
 * Ask again: after nobody answered, or after a call has ended.
 *
 * Starts a NEW request from the old one's product and location rather than
 * reopening it: its candidates have already declined, timed out or taken the
 * call, and a fresh search reaches whoever is free now.
 */
export async function retryRequest(requestId: string, buyerKey: string): Promise<LiveRequest | null> {
  const requests = await collections.liveRequests();
  const found = await requests.findOne({ _id: requestId, buyerKey });
  if (!found) return null;

  const previous = found as unknown as LiveRequest;
  // Still searching: the shopper is already watching that one.
  if (previous.status === 'MATCHING') return null;

  return startRequest({
    buyerUserId: previous.buyerUserId,
    buyerKey,
    productId: previous.productId,
    variantId: previous.variantId,
    productTitle: previous.productTitle,
    productImage: previous.productImage,
    sellingPrice: previous.sellingPrice,
    mrp: previous.mrp,
    pincode: previous.pincode,
    latitude: previous.latitude,
    longitude: previous.longitude,
  });
}
