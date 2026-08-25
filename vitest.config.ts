import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Unit tests only.
 *
 * The domain engines — pricing, tax, coupons, the shipment state machine, the
 * barcode table — are pure functions with a lot of branches and no I/O, which
 * is exactly what unit tests are good at. Anything that needs Mongo, a session
 * or a browser is covered by the smoke suites instead, because a mocked
 * database mostly tests the mock.
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
