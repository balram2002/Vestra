import 'server-only';

import { mockProvider } from './mock-provider';
import type { LiveMeetingProvider } from './provider';
import { zoomProvider } from './zoom-provider';

/**
 * Provider selection.
 *
 * One place decides which vendor is live, so nothing downstream branches on it
 * — the same arrangement as `server/payments`. A session records the provider
 * it was created with, so flipping this variable does not orphan rooms that are
 * still open.
 *
 * ---------------------------------------------------------------------------
 * WHY ZOOM AND NOT GOOGLE MEET
 * ---------------------------------------------------------------------------
 * Both were on the table, and only one of them can actually be built into this
 * feature.
 *
 * A Meet room CANNOT BE EMBEDDED. Google serves it with `X-Frame-Options: DENY`
 * and no SDK to render it in-page, so the best any integration can do is open a
 * new tab or hand off to the Meet app. That is fatal here rather than
 * inconvenient: the entire design is a full-bleed video surface with a product
 * card, a price and a Buy button over it, and none of that can exist in
 * somebody else's tab. A shopper who leaves the site to watch the demo has to
 * find their way back to buy, which is the one step this feature exists to
 * remove.
 *
 * Zoom's Meeting SDK renders in-page, and its meeting settings map directly
 * onto the policy this feature needs — `mute_upon_entry`, participant video
 * off, waiting room, recording disabled. See `ROOM_POLICY`.
 *
 * A Meet adapter is still worth having for the case where a seller prefers to
 * take the call in the app they already use all day; it would declare
 * `embeddable: false` and the live room would render its link-out layout. It is
 * not built yet, and this file says so out loud rather than pretending.
 */
export function meetingProvider(): LiveMeetingProvider {
  const configured = process.env.LIVE_PROVIDER ?? 'mock';

  switch (configured) {
    case 'zoom': {
      /*
       * Every credential is checked here rather than at call time.
       *
       * A missing secret discovered inside `createRoom` fails the call AFTER a
       * shopkeeper has already picked up, which is the most expensive moment to
       * find out. Falling back loudly at selection time means the failure is a
       * line in the log at boot, not a shop owner staring at a dead room.
       */
      const ready =
        process.env.ZOOM_ACCOUNT_ID &&
        process.env.ZOOM_CLIENT_ID &&
        process.env.ZOOM_CLIENT_SECRET;

      if (!ready) {
        console.warn(
          '[vestrawab:live] LIVE_PROVIDER=zoom but ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ' +
            'ZOOM_CLIENT_SECRET are not all set; using the mock provider.',
        );
        return mockProvider();
      }

      return zoomProvider();
    }

    case 'meet':
      console.warn(
        '[vestrawab:live] The Google Meet adapter is not implemented — a Meet room cannot ' +
          'be embedded, so it needs the link-out layout first. Using the mock provider.',
      );
      return mockProvider();

    default:
      return mockProvider();
  }
}

export type { CreateRoomInput, LiveMeetingProvider } from './provider';
export { ROOM_POLICY } from './provider';
