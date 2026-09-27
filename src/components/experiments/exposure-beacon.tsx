'use client';

import { useEffect } from 'react';

import { recordExposure } from '@/server/actions/experiments';

/**
 * Counts this visitor in a running A/B test, once. The server recomputes the
 * arm from the visitor's own cookie and skips anyone already counted, so the
 * session guard here only saves requests; it is not what keeps counts honest.
 */
export function ExposureBeacon({ experimentId }: { experimentId: string }) {
  useEffect(() => {
    const key = `vx:${experimentId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // Storage refused: the server still dedupes.
    }
    void recordExposure({ experimentId });
  }, [experimentId]);
  return null;
}
