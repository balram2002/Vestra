/**
 * Seed the database.
 *
 *     npm run seed
 *
 * Rebuilds the demo catalogue, stores, people and content from a fixed
 * generator seed. Destructive by design -- see `src/server/seed/run.ts`.
 */

import { closeDb, pingDb } from '@/server/db/client';
import { seedDatabase } from '@/server/seed/run';

const t0 = Date.now();

function log(message: string): void {
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
  process.stdout.write(`  ${elapsed}s  ${message}\n`);
}

async function main(): Promise<void> {
  process.stdout.write('\nVestraWAB — seeding MongoDB\n\n');

  const health = await pingDb();
  if (!health.ok) {
    process.stderr.write(
      `\n  Cannot reach MongoDB.\n\n` +
        `  ${health.error}\n\n` +
        `  Check that mongod is running and that MONGODB_URI in .env.local is correct.\n` +
        `  Default: mongodb://127.0.0.1:27017\n\n`,
    );
    process.exitCode = 1;
    return;
  }

  const report = await seedDatabase(log);

  process.stdout.write('\n  Seeded\n');
  const rows = Object.entries(report.counts).sort(([a], [b]) => a.localeCompare(b));
  for (const [name, count] of rows) {
    process.stdout.write(`    ${name.padEnd(18)} ${String(count).padStart(6)}\n`);
  }

  if (report.indexFailures.length > 0) {
    process.stderr.write('\n  Indexes that FAILED to build\n');
    for (const failure of report.indexFailures) {
      process.stderr.write(`    ${failure.collection}: ${failure.message}\n`);
    }
    process.stderr.write(
      '\n  A failed unique index means the generated data breaks a constraint the\n' +
        '  schema declares. Fix the generator or the index before relying on this data.\n',
    );
    process.exitCode = 1;
  }

  process.stdout.write('\n  Sign in with\n');
  for (const account of report.credentials) {
    process.stdout.write(
      `    ${account.role.padEnd(22)} ${account.email.padEnd(34)} ${account.password}\n`,
    );
  }

  process.stdout.write(`\n  Done in ${(report.durationMs / 1000).toFixed(1)}s\n\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`\n  Seed failed: ${error instanceof Error ? error.stack : error}\n\n`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
