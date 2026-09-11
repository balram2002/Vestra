/**
 * Server startup.
 *
 * Runs once per server process before the first request, with two jobs:
 *
 *   1. check the environment (see `config/env`), and in staging or production
 *      refuse to start with a list of what is wrong;
 *   2. make sure every database index exists, including the TTL indexes that
 *      expire rate-limit windows and guest carts. Indexes were only ever
 *      created by the seed script, which a production deployment never runs.
 *
 * Skipped while `next build` prerenders, so a CI build needs no secrets and
 * no database connection just to compile.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const { checkEnv } = await import('./config/env');
  const report = checkEnv();

  for (const warning of report.warnings) console.warn(`[vestrawab:env] ${warning}`);
  if (report.errors.length > 0) {
    const list = report.errors.map((error) => `  - ${error}`).join('\n');
    if (report.stage !== 'development') {
      throw new Error(`[vestrawab:env] refusing to start (${report.stage}):\n${list}`);
    }
    console.warn(`[vestrawab:env] configuration problems:\n${list}`);
  }

  if (process.env.NODE_ENV === 'production') {
    try {
      const { ensureIndexes } = await import('./server/db/indexes');
      const failures = await ensureIndexes();
      if (failures.length > 0) console.warn('[vestrawab:db] some indexes could not be created', failures);
    } catch (error) {
      console.error('[vestrawab:db] index check failed at startup', error);
    }
  }
}