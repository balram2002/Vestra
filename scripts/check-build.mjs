/**
 * Pre-build check, run automatically before `next build` (the npm "prebuild"
 * script, which Vercel runs as part of `npm run build`).
 *
 * The build prerenders the catalogue, categories, help and legal pages and the
 * sitemap FROM MONGODB. A build that cannot reach the database used to fail
 * late and obscurely, for example "Failed to collect page data for
 * /sitemap/[__metadata_id__]" after a chain of timeouts. This stops it within
 * seconds and says what to do, and warns when the database is reachable but
 * empty. Credentials are never printed: only the host.
 *
 * Set SKIP_BUILD_DB_CHECK=1 to bypass it.
 */

import { existsSync, readFileSync } from 'node:fs';

import { MongoClient } from 'mongodb';

if (process.env.SKIP_BUILD_DB_CHECK === '1') {
  console.log('> build check skipped (SKIP_BUILD_DB_CHECK=1)');
  process.exit(0);
}

// Locally the values live in .env.local, which Next loads but a plain script
// does not. Real environment variables (Vercel, CI) always win.
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const onVercel = process.env.VERCEL === '1';
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.MONGODB_DB || 'vestra';
const host = uri.replace(/^mongodb(\+srv)?:\/\/([^@/]*@)?/, '').split(/[/?]/)[0];
const local = /(^|,)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|,|$)/.test(host);

const VERCEL_HELP = [
  'To fix it on Vercel:',
  '  1. Use a hosted MongoDB such as MongoDB Atlas. A database on your own computer',
  '     cannot be reached from Vercel, neither by the build nor by the live site.',
  '  2. Atlas > Network Access > Add IP Address > Allow access from anywhere (0.0.0.0/0).',
  '     Vercel builds and functions run on changing IP addresses.',
  '  3. Vercel > Project > Settings > Environment Variables: set MONGODB_URI (the',
  '     mongodb+srv:// string from Atlas) and MONGODB_DB for Production AND Preview.',
  '  4. Put data in it once from your computer:',
  '     MONGODB_URI="<atlas uri>" MONGODB_DB=vestra npm run seed',
  '  5. Redeploy.',
];

function fail(lines) {
  console.error(['', '  Build stopped: MongoDB is not usable for this build.', '', ...lines.map((line) => `  ${line}`), ''].join('\n'));
  process.exit(1);
}

if (onVercel && !process.env.MONGODB_URI) {
  fail(['MONGODB_URI is not set in this Vercel environment.', '', ...VERCEL_HELP]);
}
if (onVercel && local) {
  fail([`MONGODB_URI points at ${host}, which is this build machine, not your database.`, '', ...VERCEL_HELP]);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000 });
try {
  await client.connect();
  const db = client.db(dbName);
  await db.command({ ping: 1 });
  const [products, categories] = await Promise.all([
    db.collection('products').countDocuments({ status: 'PUBLISHED' }),
    db.collection('categories').countDocuments({}),
  ]);
  console.log(`> build check: MongoDB reachable at ${host}, database "${dbName}": ${products} live products, ${categories} categories`);
  if (categories === 0) {
    console.warn('  warn: the database is empty. The site will build, but the storefront has nothing to show until data is loaded.');
  }
} catch (error) {
  fail([
    `Could not reach MongoDB at ${host} within 8 seconds (${error?.name ?? 'error'}).`,
    'The build prerenders pages from the database, so it must be reachable from where the build runs.',
    '',
    ...(onVercel ? VERCEL_HELP : ['Start MongoDB, or point MONGODB_URI in .env.local at a reachable server.']),
  ]);
} finally {
  await client.close().catch(() => {});
}