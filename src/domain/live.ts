import type { StatusMeta } from './enums';

/**
 * Live commerce — vocabulary and state machines.
 * ===========================================================================
 * Kept in its own module rather than folded into `enums.ts` because it is a
 * genuinely separate concern: order fulfilment is a long-running process
 * measured in days, and this is a real-time negotiation measured in seconds.
 * The two share a `Tone` and nothing else.
 *
 * ---------------------------------------------------------------------------
 * THE FLOW, IN THREE OBJECTS
 * ---------------------------------------------------------------------------
 *
 *   SellerPresence   Is this shop open for live calls RIGHT NOW? Heartbeat
 *                    driven, expires on its own — see `PRESENCE_STALE_MS`.
 *
 *   LiveRequest      One shopper asking to see one product. Fans out to the
 *                    nearby sellers who stock it, and holds the state of each
 *                    of those invitations. Lives for ~60 seconds and then
 *                    gives up. This is the "Finding the best retailer" screen.
 *
 *   LiveSession      The call itself, created the moment one seller accepts.
 *                    Owns the meeting room and the outcome.
 *
 * A request produces AT MOST ONE session. That is the whole reason the
 * candidate list has its own state machine: several sellers are ringing at
 * once, exactly one can win, and the losers have to be told why their phone
 * stopped ringing.
 *
 * ---------------------------------------------------------------------------
 * WHY FAN-OUT RATHER THAN A QUEUE
 * ---------------------------------------------------------------------------
 * Asking the nearest seller, waiting 20 seconds, then asking the next, is the
 * obvious design and it is unusable: three declines is a minute of a shopper
 * staring at a spinner. Ringing several at once and taking the first accept
 * turns a serial worst case into a parallel one — which is why the screen can
 * honestly promise a result inside its countdown.
 *
 * The cost is that sellers can lose a race they already answered. `SUPERSEDED`
 * exists to say exactly that, so the seller console can show "another store got
 * there first" rather than silently closing the card.
 */

/* ========================================================== seller presence */

/**
 * Whether a shop can take a live call.
 *
 * `BUSY` is distinct from `OFFLINE` on purpose: a seller mid-call is still open
 * for business, so the matcher can queue them as a fallback and the storefront
 * can honestly say "in a call, usually free in a few minutes" rather than
 * pretending the shop is shut.
 */
export const PRESENCE_STATES = ['OFFLINE', 'ONLINE', 'BUSY'] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

export const PRESENCE_META: Record<PresenceState, StatusMeta> = {
  OFFLINE: {
    label: 'Offline',
    tone: 'neutral',
    description: 'This store is not taking live calls at the moment.',
  },
  ONLINE: {
    label: 'Live now',
    tone: 'success',
    description: 'This store can show you products live right now.',
  },
  BUSY: {
    label: 'In a call',
    tone: 'warning',
    description: 'This store is with another shopper. Usually free within a few minutes.',
  },
};

/**
 * How long a heartbeat is trusted before the seller is treated as offline.
 *
 * Presence cannot be driven by an explicit "I am leaving" alone — browsers
 * close, phones sleep, and trains go into tunnels. A shop that went offline by
 * losing signal must not keep ringing, so the record carries a timestamp and
 * anything older than this is dead regardless of what it claims.
 *
 * 90 seconds against a 30-second heartbeat: two missed beats before a seller
 * drops out, which absorbs one bad request without stranding a shopper on a
 * phone nobody is holding.
 */
export const PRESENCE_STALE_MS = 90_000;
export const PRESENCE_HEARTBEAT_MS = 30_000;

/* ============================================================ live requests */

export const LIVE_REQUEST_STATUSES = [
  /** Ringing sellers. The countdown is running. */
  'MATCHING',
  /** A seller accepted; `sessionId` is set. */
  'MATCHED',
  /** Nobody accepted before the window closed. */
  'EXPIRED',
  /** Nobody was eligible to ring in the first place. */
  'NO_SELLERS',
  /** The shopper backed out. */
  'CANCELLED',
] as const;
export type LiveRequestStatus = (typeof LIVE_REQUEST_STATUSES)[number];

export const LIVE_REQUEST_META: Record<LiveRequestStatus, StatusMeta> = {
  MATCHING: {
    label: 'Finding a store',
    tone: 'accent',
    description: 'Calling nearby stores that can show you this product live.',
  },
  MATCHED: {
    label: 'Store found',
    tone: 'success',
    description: 'A store accepted. Connecting you now.',
  },
  EXPIRED: {
    label: 'No answer',
    tone: 'warning',
    description: 'No store picked up in time. Try again, or message them instead.',
  },
  NO_SELLERS: {
    label: 'None available',
    tone: 'neutral',
    description: 'No store near you is live with this product right now.',
  },
  CANCELLED: {
    label: 'Cancelled',
    tone: 'neutral',
    description: 'You cancelled this request.',
  },
};

export const LIVE_REQUEST_TRANSITIONS: Record<LiveRequestStatus, LiveRequestStatus[]> = {
  MATCHING: ['MATCHED', 'EXPIRED', 'CANCELLED'],
  // Terminal, every one of them. A matched request that later fails is the
  // SESSION failing, which is a different object with its own states.
  MATCHED: [],
  EXPIRED: [],
  NO_SELLERS: [],
  CANCELLED: [],
};

/**
 * How long the fan-out runs before giving up.
 *
 * The mockup shows a 60-second countdown and that is about right: long enough
 * for a shopkeeper to put down what they are holding and pick up a phone, short
 * enough that a shopper will actually wait. Past a minute the screen stops
 * reading as "connecting" and starts reading as "broken".
 */
export const LIVE_REQUEST_WINDOW_MS = 60_000;

/* --------------------------------------------------------------- candidates */

/**
 * One seller's invitation within a request.
 *
 * `QUEUED` sellers are NOT ringing. The matcher rings a few at a time — see
 * `LIVE_RING_BATCH` — so the shopper's screen can show a real queue instead of
 * pretending every shop in the city is being called at once.
 */
export const LIVE_CANDIDATE_STATES = [
  'QUEUED',
  'RINGING',
  'ACCEPTED',
  'DECLINED',
  /** Rang out without an answer. */
  'TIMED_OUT',
  /** Another seller won the race while this one was still ringing. */
  'SUPERSEDED',
] as const;
export type LiveCandidateState = (typeof LIVE_CANDIDATE_STATES)[number];

export const LIVE_CANDIDATE_META: Record<LiveCandidateState, StatusMeta> = {
  QUEUED: { label: 'Queued', tone: 'neutral', description: 'Waiting to be called.' },
  RINGING: { label: 'Ringing', tone: 'accent', description: 'Calling this store now.' },
  ACCEPTED: { label: 'Connected', tone: 'success', description: 'This store picked up.' },
  DECLINED: { label: 'Unavailable', tone: 'neutral', description: 'This store cannot take the call.' },
  TIMED_OUT: { label: 'No answer', tone: 'neutral', description: 'This store did not pick up.' },
  SUPERSEDED: {
    label: 'Another store answered',
    tone: 'neutral',
    description: 'A different store picked up first.',
  },
};

export const LIVE_CANDIDATE_TRANSITIONS: Record<LiveCandidateState, LiveCandidateState[]> = {
  QUEUED: ['RINGING', 'SUPERSEDED'],
  RINGING: ['ACCEPTED', 'DECLINED', 'TIMED_OUT', 'SUPERSEDED'],
  ACCEPTED: [],
  DECLINED: [],
  TIMED_OUT: [],
  SUPERSEDED: [],
};

/**
 * How many sellers ring at once, and for how long each.
 *
 * Three is a deliberate middle. Ringing one at a time is a minute of serial
 * waiting; ringing everyone at once means a dozen shopkeepers drop what they
 * are doing so that eleven of them can lose — which is how a marketplace burns
 * its supply side in a fortnight.
 *
 * 18 seconds per ring gives roughly three batches inside the 60-second window.
 */
export const LIVE_RING_BATCH = 3;
export const LIVE_RING_TIMEOUT_MS = 18_000;

/**
 * How far to look for a shop.
 *
 * The whole promise is "your neighbourhood", so this is a hard ceiling rather
 * than a sort key — a live demo from 40km away is not a local store, it is a
 * call centre, and matching one would quietly break the thing being sold.
 */
export const LIVE_MAX_DISTANCE_KM = 12;

/* ============================================================ live sessions */

export const LIVE_SESSION_STATUSES = [
  /** Room created, waiting for both parties to arrive. */
  'PENDING',
  /** Both in the room. */
  'ACTIVE',
  'ENDED',
  /** The room could not be created, or nobody ever joined. */
  'FAILED',
] as const;
export type LiveSessionStatus = (typeof LIVE_SESSION_STATUSES)[number];

export const LIVE_SESSION_META: Record<LiveSessionStatus, StatusMeta> = {
  PENDING: { label: 'Connecting', tone: 'accent', description: 'Setting up your live room.' },
  ACTIVE: { label: 'Live', tone: 'success', description: 'You are in a live call.' },
  ENDED: { label: 'Ended', tone: 'neutral', description: 'This live call has ended.' },
  FAILED: { label: 'Failed', tone: 'danger', description: 'The live call could not be connected.' },
};

export const LIVE_SESSION_TRANSITIONS: Record<LiveSessionStatus, LiveSessionStatus[]> = {
  PENDING: ['ACTIVE', 'ENDED', 'FAILED'],
  ACTIVE: ['ENDED'],
  ENDED: [],
  FAILED: [],
};

/**
 * What the call was worth.
 *
 * Recorded because it is the only number that says whether any of this works.
 * A live commerce feature that cannot report its conversion rate is a feature
 * nobody can decide to keep.
 */
export const LIVE_OUTCOMES = ['PURCHASED', 'NO_PURCHASE', 'ABANDONED'] as const;
export type LiveOutcome = (typeof LIVE_OUTCOMES)[number];

export const LIVE_OUTCOME_LABEL: Record<LiveOutcome, string> = {
  PURCHASED: 'Bought during the call',
  NO_PURCHASE: 'Ended without buying',
  ABANDONED: 'Nobody joined',
};

/**
 * The longest a call may run.
 *
 * A cap exists because the meeting provider bills by the minute and a room left
 * open on a forgotten tab bills all night. Twenty minutes is far longer than
 * any real "show me those shoes" conversation.
 */
export const LIVE_SESSION_MAX_MS = 20 * 60_000;

/* ---------------------------------------------------------------- guards */

export function canTransitionRequest(from: LiveRequestStatus, to: LiveRequestStatus): boolean {
  return LIVE_REQUEST_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionCandidate(
  from: LiveCandidateState,
  to: LiveCandidateState,
): boolean {
  return LIVE_CANDIDATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionSession(from: LiveSessionStatus, to: LiveSessionStatus): boolean {
  return LIVE_SESSION_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Presence is only real if it was refreshed recently. See `PRESENCE_STALE_MS`. */
export function isPresenceLive(state: PresenceState, lastSeenAt: string, now = Date.now()): boolean {
  if (state === 'OFFLINE') return false;
  const seen = Date.parse(lastSeenAt);
  if (!Number.isFinite(seen)) return false;
  return now - seen <= PRESENCE_STALE_MS;
}
