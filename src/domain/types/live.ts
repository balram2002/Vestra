import type {
  LiveCandidateState,
  LiveOutcome,
  LiveRequestStatus,
  LiveSessionStatus,
  PresenceState,
} from '../live';

/**
 * Live commerce — record shapes.
 *
 * The state machines and their timings live in `domain/live.ts`; this is only
 * what gets stored. See that module's header for how the three objects relate.
 */

/* ========================================================== seller presence */

/**
 * One shop's availability for live calls.
 *
 * Keyed by LOCATION, not by seller: a chain with three shops has three
 * shutters, and only the branch that is actually open and staffed can take a
 * call about the stock on its own shelves. It is also the only way the distance
 * calculation means anything.
 */
export interface SellerPresence {
  id: string;
  sellerId: string;
  locationId: string;
  state: PresenceState;
  /**
   * Last heartbeat.
   *
   * Presence expires on its own rather than relying on a clean sign-off —
   * browsers close and phones lose signal, and a shop that dropped off the
   * network must not keep ringing. See `PRESENCE_STALE_MS`.
   */
  lastSeenAt: string;
  /** Set while `BUSY`, so a finished call can release the shop immediately. */
  activeSessionId: string | null;
  /**
   * Which staff member is holding the phone.
   *
   * Stored so the buyer's screen can name a person — "Rohit from Gupta
   * Footwear" — rather than a company. On a call about a pair of shoes, the
   * person is most of the reassurance.
   */
  attendantUserId: string | null;
  attendantName: string | null;
  updatedAt: string;
}

/* ============================================================ live requests */

/**
 * One seller's invitation inside a request.
 *
 * Denormalised on purpose. The matching screen shows a name, a distance and a
 * rating for four shops at once and polls every couple of seconds; joining out
 * to the seller record on every poll would be four lookups a second to render
 * text that cannot change during the sixty seconds the request exists.
 */
export interface LiveCandidate {
  sellerId: string;
  locationId: string;
  /** Snapshot, for the reason above. */
  displayName: string;
  logoUrl: string;
  area: string;
  ratingAverage: number;
  ratingCount: number;
  distanceKm: number;
  /**
   * Whether this shop has the exact style, or merely the brand in this
   * category.
   *
   * Surfaced to the shopper rather than kept internal: "has this item" and
   * "carries this brand" are different promises, and a shopper connected to
   * the second while expecting the first feels misled. See `findCandidates`
   * for how the two tiers are derived.
   */
  hasExactItem: boolean;
  state: LiveCandidateState;
  /** When this candidate started ringing. Null while `QUEUED`. */
  ringingAt: string | null;
  respondedAt: string | null;
}

export interface LiveRequest {
  id: string;
  /** Null for a guest — the flow works signed-out, sign-in happens at checkout. */
  buyerUserId: string | null;
  /** Anonymous owner key, so a guest can poll their own request. */
  buyerKey: string;
  productId: string;
  /** The variant the shopper was looking at, if they had chosen one. */
  variantId: string | null;
  /** Snapshot for the live room's product card, which must not re-query. */
  productTitle: string;
  productImage: string;
  sellingPrice: number;
  mrp: number;

  /** Where the shopper is. Pincode is the fallback when geolocation is refused. */
  pincode: string;
  latitude: number | null;
  longitude: number | null;

  status: LiveRequestStatus;
  candidates: LiveCandidate[];
  /** Set once a candidate accepts. */
  sessionId: string | null;
  acceptedSellerId: string | null;

  /** The countdown's end. See `LIVE_REQUEST_WINDOW_MS`. */
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

/* ============================================================ live sessions */

/**
 * The meeting room, as the provider describes it.
 *
 * `provider` is stored on the record rather than read from config at display
 * time, because config changes and a session that was created on one provider
 * has to keep resolving against that one for as long as anybody can open it.
 */
export interface LiveMeeting {
  provider: string;
  /** The provider's own identifier for the room. */
  roomId: string;
  /**
   * Where the SHOPPER joins.
   *
   * Distinct from `hostUrl` because the two are not the same permission. The
   * shopper joins muted and cannot admit others; the seller hosts. Handing the
   * host link to a buyer would let them mute the shopkeeper in their own shop.
   */
  joinUrl: string;
  hostUrl: string;
  /** Whether the provider's room can be embedded, or must open externally. */
  embeddable: boolean;
  /** Short-lived token for an embedded SDK, if the provider needs one. */
  joinToken: string | null;
  expiresAt: string | null;
}

/** One line of text in a live call. */
export interface LiveMessage {
  id: string;
  from: 'BUYER' | 'SELLER';
  text: string;
  at: string;
}

export interface LiveSession {
  id: string;
  requestId: string;
  buyerUserId: string | null;
  buyerKey: string;
  sellerId: string;
  locationId: string;

  productId: string;
  variantId: string | null;
  productTitle: string;
  productImage: string;
  sellingPrice: number;
  mrp: number;

  /** Named so the buyer's screen can say who is on the other end. */
  attendantName: string | null;
  sellerDisplayName: string;

  status: LiveSessionStatus;
  meeting: LiveMeeting | null;

  /**
   * A price the seller offered during the call.
   *
   * Live haggling is the point of the format in this market, so an accepted
   * offer has to survive the call and reach the bag. Null until one is made.
   */
  offeredPrice: number | null;
  offerExpiresAt: string | null;

  /**
   * What the shopper and the shop said in text, oldest first, newest fifty.
   *
   * The shopper joins muted, often in public, so text is how most of them take
   * part at all. Optional because calls recorded before it existed have none.
   */
  messages?: LiveMessage[];
  /** When the shopper asked to speak; cleared once the shop has seen it. */
  speakRequestedAt?: string | null;

  outcome: LiveOutcome | null;
  /** Set when the call converts, so attribution is a fact rather than a guess. */
  orderId: string | null;

  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ views */

/**
 * What the matching screen polls for.
 *
 * Deliberately narrow: the poll runs every two seconds for a minute, so it
 * returns the four fields that can actually change and nothing else.
 */
export interface LiveRequestView {
  id: string;
  status: LiveRequestStatus;
  candidates: LiveCandidate[];
  sessionId: string | null;
  /** Seconds left on the countdown, computed server-side so clocks cannot drift. */
  secondsRemaining: number;
}
