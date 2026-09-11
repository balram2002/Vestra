import 'server-only';

import type { LiveMeeting } from '@/domain/types';

import type { CreateRoomInput, LiveMeetingProvider } from './provider';
import { ROOM_POLICY } from './provider';

/**
 * Zoom, via Server-to-Server OAuth.
 * ===========================================================================
 * Creates a meeting per session and returns the two links the permission model
 * needs: `start_url` for the shop (host) and `join_url` for the shopper.
 *
 * ---------------------------------------------------------------------------
 * WHY SERVER-TO-SERVER OAUTH AND NOT A JWT APP
 * ---------------------------------------------------------------------------
 * Zoom retired JWT apps. Server-to-Server OAuth is the replacement for exactly
 * this shape of integration — a backend acting as itself, with no user to send
 * through a consent screen. It exchanges an account id and a client secret for
 * a short-lived token, which is why `token()` below exists at all.
 *
 * ---------------------------------------------------------------------------
 * THE POLICY, AND WHERE IT IS ENFORCED
 * ---------------------------------------------------------------------------
 * Everything in `ROOM_POLICY` is set on the MEETING at creation time rather
 * than applied by the client after joining:
 *
 *   mute_upon_entry        the shopper arrives silent
 *   participant_video      the shopper's camera starts off
 *   waiting_room           nobody enters until the shop admits them, which is
 *                          also what stops a leaked link being used later
 *   auto_recording: none   neither side records
 *   join_before_host       off, so a room can never be occupied before the
 *                          shop is in it
 *
 * Applying these client-side would leave a window — however brief — in which a
 * shopper is live and unmuted in a shop's room. Set on the meeting, there is no
 * such window.
 *
 * ---------------------------------------------------------------------------
 * `start_url` IS A SECRET
 * ---------------------------------------------------------------------------
 * It embeds a host token. Anyone holding it can host the meeting, mute the
 * shopkeeper and admit strangers. It is stored on the session and served ONLY
 * to the seller — see the session service, which never puts `hostUrl` in a
 * buyer-facing payload. It is also short-lived, which is why `expiresAt` is
 * recorded alongside it.
 */

const ZOOM_API = 'https://api.zoom.us/v2';
const ZOOM_OAUTH = 'https://zoom.us/oauth/token';

/**
 * A cached access token.
 *
 * Zoom's tokens last an hour and the endpoint is rate limited, so fetching one
 * per room would spend a request on every call at the exact moment latency is
 * most visible — a shopper is watching a countdown while this runs.
 *
 * Module scope is the right lifetime: it dies with the process, which is the
 * same lifetime as the credentials it was minted from. The 60-second margin
 * means a token is never used in the last minute of its life, so a call cannot
 * fail because the token expired in flight.
 */
let cached: { token: string; expiresAt: number } | null = null;

async function token(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const accountId = process.env.ZOOM_ACCOUNT_ID ?? '';
  const clientId = process.env.ZOOM_CLIENT_ID ?? '';
  const clientSecret = process.env.ZOOM_CLIENT_SECRET ?? '';

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(
    `${ZOOM_OAUTH}?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}` },
      // Never cached by Next: this is a credential exchange, and a cached token
      // outlives its own expiry by definition.
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error(`[vestrawab:live] Zoom token request failed with ${response.status}.`);
  }

  const body = (await response.json()) as { access_token: string; expires_in: number };
  cached = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return cached.token;
}

export function zoomProvider(): LiveMeetingProvider {
  return {
    name: 'zoom',

    async createRoom(input: CreateRoomInput): Promise<LiveMeeting> {
      const access = await token();

      const response = await fetch(`${ZOOM_API}/users/me/meetings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          topic: input.subject,
          /*
           * Type 1 — "instant".
           *
           * A scheduled meeting (type 2) would need a start time, and this room
           * is wanted NOW: a shopkeeper has just pressed accept and a shopper is
           * watching a spinner. An instant meeting exists the moment the call
           * returns.
           */
          type: 1,
          duration: input.maxMinutes,
          settings: {
            host_video: true,
            participant_video: !ROOM_POLICY.guestVideoOff,
            mute_upon_entry: ROOM_POLICY.muteGuestOnEntry,
            waiting_room: ROOM_POLICY.lockRoom,
            join_before_host: false,
            auto_recording: ROOM_POLICY.disableRecording ? 'none' : 'local',
            // The shop is the only host. Zoom's default lets participants be
            // promoted, which would undo the whole permission split.
            alternative_hosts: '',
            approval_type: 2,
          },
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
          `[vestrawab:live] Zoom meeting creation failed with ${response.status}. ${detail}`,
        );
      }

      const body = (await response.json()) as {
        id: number;
        join_url: string;
        start_url: string;
      };

      return {
        provider: 'zoom',
        roomId: String(body.id),
        joinUrl: body.join_url,
        // See the header: this is a secret and never reaches a buyer payload.
        hostUrl: body.start_url,
        /*
         * True because the Meeting SDK renders in-page — but only where the SDK
         * is actually mounted. The live room checks this flag to decide between
         * the embedded surface and the link-out layout, so a deployment without
         * the SDK key configured still produces a working call rather than a
         * black rectangle.
         */
        embeddable: Boolean(process.env.ZOOM_SDK_KEY),
        joinToken: null,
        expiresAt: new Date(Date.now() + input.maxMinutes * 60_000).toISOString(),
      };
    },

    async endRoom(meeting: LiveMeeting): Promise<void> {
      const access = await token();

      const response = await fetch(`${ZOOM_API}/meetings/${meeting.roomId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${access}` },
        cache: 'no-store',
      });

      /*
       * 404 is success here.
       *
       * Both participants hang up, and both hang-ups try to end the room; the
       * second one finds it already gone. Treating that as an error would put a
       * red line in the log on every single completed call, which is the fastest
       * way to teach everyone to ignore the log.
       */
      if (!response.ok && response.status !== 404) {
        console.warn(
          `[vestrawab:live] Zoom room ${meeting.roomId} could not be ended (${response.status}).`,
        );
      }
    },
  };
}
