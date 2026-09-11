import 'server-only';

import { randomUUID } from 'node:crypto';

import type { LiveMeeting } from '@/domain/types';

import type { CreateRoomInput, LiveMeetingProvider } from './provider';

/**
 * The development provider.
 * ===========================================================================
 * Hands back a room on our own origin rather than calling a vendor, so the
 * whole flow — request, match, accept, join, buy, end — is buildable and
 * demoable with no credentials, no billing account and no network.
 *
 * It is the DEFAULT deliberately. An unconfigured real provider that silently
 * fails every call is far worse than an obvious mock: the mock says what it is
 * on the screen, and the failure mode of a missing credential becomes "the demo
 * room appears" rather than "the button does nothing and nobody knows why".
 * This is the same reasoning as `payments/mock-gateway`.
 *
 * The room it returns is real in every respect the application cares about: it
 * has two distinct URLs, it is embeddable, it expires, and it can be ended
 * twice without complaint. What it does not have is video — the page it points
 * at renders the product, the seller's name and a "demo room" notice, which is
 * enough to build and review every surface around the call.
 */
export function mockProvider(): LiveMeetingProvider {
  return {
    name: 'mock',

    async createRoom(input: CreateRoomInput): Promise<LiveMeeting> {
      const roomId = `mock-${randomUUID().slice(0, 12)}`;

      /*
       * Two tokens, not one.
       *
       * The mock models the permission split faithfully even though nothing
       * would break if it did not — because the surfaces built against it must
       * be built against the real shape. A mock that returns the same URL twice
       * teaches the UI a lie it will only discover in production.
       */
      const hostToken = randomUUID();
      const guestToken = randomUUID();

      return {
        provider: 'mock',
        roomId,
        joinUrl: `/live/room/${roomId}?t=${guestToken}&role=guest`,
        hostUrl: `/live/room/${roomId}?t=${hostToken}&role=host`,
        embeddable: true,
        joinToken: guestToken,
        expiresAt: new Date(Date.now() + input.maxMinutes * 60_000).toISOString(),
      };
    },

    async endRoom(): Promise<void> {
      // Nothing to tear down. Silent by contract: ending a call twice is a
      // normal race between two people hanging up, not an error.
    },
  };
}
