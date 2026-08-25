/**
 * Stands in for the `server-only` package under Vitest.
 *
 * The real module throws unless resolved with the `react-server` condition.
 * Its job is to fail a BUILD that pulls server code into a client bundle;
 * inside a Node test process there is no bundle and no boundary to protect,
 * so an empty module is the honest substitute.
 */
export {};
