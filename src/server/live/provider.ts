import 'server-only';

import type { LiveMeeting } from '@/domain/types';

/**
 * The meeting provider contract.
 * ===========================================================================
 * Deliberately the same shape as `server/payments/gateway`: one interface, one
 * selection point, adapters that drop in. Live video is exactly the kind of
 * dependency that should never be reachable from a component — it has
 * credentials, it bills by the minute, and the vendor will be swapped at least
 * once.
 *
 * ---------------------------------------------------------------------------
 * WHAT A PROVIDER MUST DO
 * ---------------------------------------------------------------------------
 * Create a private room for exactly two people, hand back two DIFFERENT ways in
 * — a host link for the shop and a guest link for the shopper — and let the
 * room be destroyed when the call ends.
 *
 * The two links are not a convenience. They are the permission model: the
 * shopper joins muted, cannot admit anyone else and cannot remove the host; the
 * shopkeeper hosts their own shop. Handing one URL to both parties would let a
 * buyer mute the seller mid-demonstration, and there is no way to take that
 * back once the link is out.
 *
 * ---------------------------------------------------------------------------
 * `embeddable`, AND WHY IT IS ON THE RESULT
 * ---------------------------------------------------------------------------
 * Some providers can be rendered inside the page and some cannot, and the
 * difference is invisible until it fails. Google Meet sends
 * `X-Frame-Options: DENY`, so a Meet room can only ever be opened in a new tab
 * or the Meet app — it cannot be the full-bleed video surface with a product
 * card over it that this feature is designed around.
 *
 * Rather than pretend otherwise, the provider declares it and the live room
 * renders one of two layouts. A provider that lies here produces a blank black
 * rectangle in production and nothing in the console.
 */
export interface LiveMeetingProvider {
  /** Stored on the session, so a room keeps resolving after config changes. */
  readonly name: string;

  /**
   * Create a room for one session.
   *
   * `subject` reaches the provider's own UI and any calendar entry it makes, so
   * it carries the product and the shop rather than an opaque id — a
   * shopkeeper's Zoom history should read as a day's work, not as a log file.
   */
  createRoom(input: CreateRoomInput): Promise<LiveMeeting>;

  /**
   * Tear the room down.
   *
   * Called when a session ends, and on the timeout sweep. Providers bill for
   * open rooms, and a room left behind by a crashed tab bills all night.
   *
   * Must not throw for a room that is already gone: ending a call twice is a
   * normal race between the two participants hanging up, not an error.
   */
  endRoom(meeting: LiveMeeting): Promise<void>;
}

export interface CreateRoomInput {
  sessionId: string;
  subject: string;
  /** Display name for the shop's side of the call. */
  hostName: string;
  /** Display name for the shopper's side. */
  guestName: string;
  /**
   * Hard ceiling in minutes.
   *
   * Passed to providers that can enforce it themselves, so a forgotten tab is
   * closed by the vendor rather than only by our own sweep.
   */
  maxMinutes: number;
}

/**
 * Room policy, applied by every adapter that can express it.
 *
 * These are the "meeting controls" the feature actually depends on, and they
 * are stated here once so no adapter has to re-derive them:
 *
 *   muteGuestOnEntry   The shopper arrives silent. A live shopping call is a
 *                      DEMONSTRATION, not a conference — the shop talks, and
 *                      the buyer unmutes to ask. It also means a call that
 *                      connects while someone is on a train does not open with
 *                      a carriage full of noise in a shopkeeper's ear.
 *   guestVideoOff      The shopper's camera starts off. Nobody expects to be on
 *                      camera to look at a pair of shoes, and a buy button next
 *                      to their own face is the fastest way to lose them.
 *   lockRoom           No third party can join, even holding the link. The room
 *                      is for one shopper and one shop.
 *   disableRecording   Neither side may record. A shop's interior and a
 *                      customer's face are not ours to capture, and a provider
 *                      default that allows it is a privacy incident waiting for
 *                      a slow week.
 */
export const ROOM_POLICY = {
  muteGuestOnEntry: true,
  guestVideoOff: true,
  lockRoom: true,
  disableRecording: true,
} as const;
