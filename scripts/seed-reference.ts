/**
 * Load the reference data a fresh database needs, and nothing else.
 *
 *     npm run seed:reference
 *
 * Loads:
 *   - the category tree (departments and their categories, with tax slabs and
 *     return policies), which every product has to belong to;
 *   - the site pages: terms, privacy, returns policy, grievance officer,
 *     shipping, returns, refunds, contact, size guide, about, sell with us;
 *   - the homepage layout. Its sections stay hidden until there is something
 *     to show in them, and there are no banners until you add your own;
 *   - the role catalogue.
 *
 * Does not load stores, brands, products, banners, customers, orders, offers
 * or reviews. Those are real data, created in the consoles.
 *
 * Safe on a live database: it only INSERTS what is missing, matched by slug,
 * name or key, and never overwrites or deletes, so an edited page or a
 * renamed category is left alone. Run it again after an upgrade to pick up
 * new reference data. It finishes by making sure every index exists.
 *
 * Unlike `npm run seed`, which wipes the database and loads a demo shop.
 */

import { closeDb, getDb, pingDb } from '@/server/db/client';
import { COLLECTIONS } from '@/server/db/collections';
import { ensureIndexes } from '@/server/db/indexes';
import { generateCategories, generateHomeSections, generateRoles } from '@/server/seed/generate';
import { generateCmsPages } from '@/server/seed/pages';

type Row = { id: string } & Record<string, unknown>;

async function insertMissing(
  collection: string,
  rows: Row[],
  match: (row: Row) => Record<string, unknown>,
): Promise<{ added: number; kept: number }> {
  const db = await getDb();
  let added = 0;
  for (const row of rows) {
    const result = await db
      .collection(collection)
      .updateOne(match(row), { $setOnInsert: { ...row, _id: row.id } }, { upsert: true });
    if (result.upsertedCount > 0) added += 1;
  }
  return { added, kept: rows.length - added };
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
  const host = uri.replace(/^mongodb(\+srv)?:\/\/([^@/]*@)?/, '').split(/[/?]/)[0];
  process.stdout.write(`\nVestraWAB: reference data for ${host}, database "${process.env.MONGODB_DB ?? 'vestra'}"\n\n`);

  const health = await pingDb();
  if (!health.ok) {
    process.stderr.write(`  Cannot reach MongoDB: ${health.error}\n\n`);
    process.exitCode = 1;
    return;
  }

  const now = new Date();
  const db = await getDb();

  /*
   * Categories point at their parents by id. On a database that already has
   * some of them, the ids of those are reused, so a missing child hangs off
   * the parent that is really there instead of an id that was never stored.
   */
  const stored = await db
    .collection(COLLECTIONS.categories)
    .find({}, { projection: { slug: 1 } })
    .toArray();
  const existingId = new Map(stored.map((doc) => [String(doc.slug), String(doc._id)]));
  const generated = generateCategories(now);
  const idFor = new Map(generated.map((category) => [category.slug, existingId.get(category.slug) ?? category.id]));
  const categories = generated.map((category) => {
    const parentSlug = category.path.length > 1 ? category.path[category.path.length - 2] : null;
    return {
      ...category,
      id: idFor.get(category.slug) ?? category.id,
      parentId: parentSlug ? (idFor.get(parentSlug) ?? null) : null,
    };
  });

  const results: Array<[string, { added: number; kept: number }]> = [
    ['roles', await insertMissing(COLLECTIONS.roles, generateRoles() as unknown as Row[], (row) => ({ key: row.key }))],
    ['categories', await insertMissing(COLLECTIONS.categories, categories as unknown as Row[], (row) => ({ slug: row.slug }))],
    ['site pages', await insertMissing(COLLECTIONS.cmsPages, generateCmsPages('system', now) as unknown as Row[], (row) => ({ slug: row.slug }))],
    ['homepage sections', await insertMissing(COLLECTIONS.homeSections, generateHomeSections(now) as unknown as Row[], (row) => ({ kind: row.kind, title: row.title }))],
  ];

  for (const [label, { added, kept }] of results) {
    process.stdout.write(`  ${label.padEnd(18)} ${String(added).padStart(4)} added   ${String(kept).padStart(4)} already there\n`);
  }

  const failures = await ensureIndexes();
  process.stdout.write(`\n  indexes            ${failures.length === 0 ? 'all present' : `${failures.length} could not be created`}\n\n`);
  if (failures.length > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`\n  ${error instanceof Error ? error.message : String(error)}\n\n`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());