import { describe, expect, it } from 'vitest';

import { mapProviderStatus, shouldAdvance } from './status';

/**
 * Courier feeds are messy in specific, repeatable ways: statuses arrive out of
 * order, the same scan is delivered twice, and the reverse leg reuses forward
 * vocabulary to mean something else. Each of those has burned somebody's
 * tracking page before, so each has a test.
 */
describe('mapProviderStatus', () => {
  it('normalises spacing and case', () => {
    expect(mapProviderStatus('OUT_FOR_DELIVERY', 'FORWARD')).toBe('OUT_FOR_DELIVERY');
    expect(mapProviderStatus('out for delivery', 'FORWARD')).toBe('OUT_FOR_DELIVERY');
    expect(mapProviderStatus('  Picked-Up ', 'FORWARD')).toBe('PICKED_UP');
  });

  it('returns null for an unknown code rather than guessing', () => {
    expect(mapProviderStatus('teleported', 'FORWARD')).toBeNull();
  });

  /**
   * The one that matters most: on a return, `delivered` means the parcel
   * reached the SELLER. Reading it with the forward table would tell the
   * customer their refund shipment was delivered to them.
   */
  it('reads the reverse vocabulary differently from the forward one', () => {
    expect(mapProviderStatus('delivered_warehouse', 'RETURN')).toBe('DELIVERED');
    expect(mapProviderStatus('pickup_pending', 'RETURN')).toBe('PICKUP_SCHEDULED');
    // `pickup_pending` has no forward meaning at all.
    expect(mapProviderStatus('pickup_pending', 'FORWARD')).toBeNull();
  });
});

describe('shouldAdvance', () => {
  it('moves forward along the normal progression', () => {
    expect(shouldAdvance('PICKED_UP', 'IN_TRANSIT')).toBe(true);
    expect(shouldAdvance('IN_TRANSIT', 'OUT_FOR_DELIVERY')).toBe(true);
  });

  it('ignores a duplicate scan', () => {
    expect(shouldAdvance('IN_TRANSIT', 'IN_TRANSIT')).toBe(false);
  });

  it('refuses to un-deliver a parcel when a stale scan arrives late', () => {
    expect(shouldAdvance('DELIVERED', 'IN_TRANSIT')).toBe(false);
    expect(shouldAdvance('DELIVERED', 'OUT_FOR_DELIVERY')).toBe(false);
  });

  it('treats terminal states as final', () => {
    expect(shouldAdvance('CANCELLED', 'IN_TRANSIT')).toBe(false);
    expect(shouldAdvance('RTO_DELIVERED', 'DELIVERED')).toBe(false);
    expect(shouldAdvance('LOST', 'DELIVERED')).toBe(false);
  });

  it('always lets an exception through, wherever the parcel had reached', () => {
    expect(shouldAdvance('OUT_FOR_DELIVERY', 'DELIVERY_FAILED')).toBe(true);
    expect(shouldAdvance('IN_TRANSIT', 'LOST')).toBe(true);
    expect(shouldAdvance('REACHED_HUB', 'RTO_INITIATED')).toBe(true);
  });

  it('allows a re-attempt after a failed delivery', () => {
    // A failed attempt is not on the linear progression, so the next
    // out-for-delivery scan must still register.
    expect(shouldAdvance('DELIVERY_FAILED', 'OUT_FOR_DELIVERY')).toBe(true);
    expect(shouldAdvance('DELIVERY_FAILED', 'DELIVERED')).toBe(true);
  });
});
