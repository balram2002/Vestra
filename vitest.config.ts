import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Unit tests, and one deliberate integration suite.
 *
 * The domain engines — pricing, tax, coupons, promotions, the shipment state
 * machine, the barcode table — are pure functions with a lot of branches and no
 * I/O, which is exactly what unit tests are good at. Anything that needs a
 * session or a browser is covered by the smoke suites instead.
 *
 * The exception is `repositories/inventory.test.ts`, which talks to a real
 * MongoDB on a throwaway database. Every movement in that repository IS a Mongo
 * query, so a mock would only re-state the source; and the guarantee that
 * matters — that a conditional update cannot oversell under concurrency — is a
 * claim about MongoDB that only MongoDB can settle. It skips itself when no
 * server is reachable.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      /*
       * `server-only` throws on import unless the resolver runs with the
       * `react-server` condition, which Vitest does not. The guard exists to
       * stop server code reaching a client bundle — a concern that does not
       * apply to a Node test process — so it is stubbed out rather than
       * worked around by weakening the real import.
       */
      'server-only': path.resolve(__dirname, './src/tests/server-only-stub.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
  },
});
