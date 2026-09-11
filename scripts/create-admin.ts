/**
 * Create the first administrator.
 *
 *     npm run admin:create -- --email you@company.com --name "Your Name"
 *     npm run admin:create -- --email ops@company.com --name "Ops Lead" --role OPERATIONS
 *
 * The seed is for demos. A real deployment starts with an empty database and
 * needs one person who can sign in to the admin console; this makes exactly
 * that person, with the same password hashing, ids and defaults the app uses
 * when anyone registers, and refuses to touch an account that already exists.
 *
 * The password is read from the terminal with echo off, or from stdin when it
 * is piped in by a provisioning script. It is never taken as an argument,
 * where it would sit in shell history and in the process list.
 */

import { defaultNotificationPreferences } from '@/domain/notifications';
import type { User, UserRole } from '@/domain/types';
import { entityId } from '@/lib/ids';
import { emailSchema, passwordSchema } from '@/lib/validation/auth';
import { hashPassword } from '@/server/auth/password';
import { closeDb, pingDb } from '@/server/db/client';
import { collections } from '@/server/db/collections';
import { ensureIndexes } from '@/server/db/indexes';

const STAFF_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'OPERATIONS',
  'FINANCE',
  'SUPPORT',
  'CATALOG_MANAGER',
  'MARKETING_MANAGER',
];

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message: string): void {
  process.stderr.write(`\n  ${message}\n\n`);
  process.exitCode = 1;
}

let piped: string[] | null = null;

/** A line from the terminal with echo off, or the next piped line. */
async function readSecret(prompt: string): Promise<string> {
  const stdin = process.stdin;

  if (!stdin.isTTY) {
    if (piped === null) {
      let data = '';
      for await (const chunk of stdin) data += chunk;
      piped = data.split(/\r?\n/);
    }
    return piped.shift() ?? '';
  }

  process.stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  return new Promise((resolve) => {
    let value = '';
    const onData = (input: string) => {
      for (const char of input) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const email = arg('email')?.trim().toLowerCase();
  const name = arg('name')?.trim();
  const role = (arg('role') ?? 'SUPER_ADMIN').toUpperCase() as UserRole;

  if (!email || !name) {
    fail('Usage: npm run admin:create -- --email you@company.com --name "Your Name" [--role SUPER_ADMIN]');
    return;
  }
  if (!emailSchema.safeParse(email).success) {
    fail(`"${email}" is not a valid email address.`);
    return;
  }
  if (!STAFF_ROLES.includes(role)) {
    fail(`--role must be one of ${STAFF_ROLES.join(', ')}.`);
    return;
  }

  const health = await pingDb();
  if (!health.ok) {
    fail(`Cannot reach MongoDB: ${health.error}`);
    return;
  }

  const users = await collections.users();
  if (await users.findOne({ email })) {
    fail(`An account with ${email} already exists. Nothing was changed.`);
    return;
  }

  process.stdout.write(`\nCreating ${role} ${email}\n\n`);
  const password = await readSecret('  Password: ');
  const rule = passwordSchema.safeParse(password);
  if (!rule.success) {
    fail(rule.error.issues[0]?.message ?? 'That password is not allowed.');
    return;
  }
  if (process.stdin.isTTY && (await readSecret('  Again:    ')) !== password) {
    fail('The two passwords do not match. Nothing was changed.');
    return;
  }

  // A fresh database has no indexes yet, including the unique email index.
  await ensureIndexes();

  const now = new Date().toISOString();
  const user: User = {
    id: entityId('usr'),
    email,
    emailVerified: true,
    phone: null,
    phoneVerified: false,
    fullName: name,
    passwordHash: await hashPassword(password),
    roles: [role],
    status: 'ACTIVE',
    avatarUrl: null,
    gender: null,
    dateOfBirth: null,
    sellerId: null,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
    creditBalance: 0,
    preferences: {
      notifications: defaultNotificationPreferences(),
      marketingOptIn: false,
      theme: 'system',
      preferredSizes: {},
      language: 'en-IN',
      currency: 'INR',
    },
  };

  await users.insertOne({ ...user, _id: user.id });

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  process.stdout.write(`\n  Created. Sign in at ${site}/login\n\n`);
}

main()
  .catch((error: unknown) => {
    fail(error instanceof Error ? error.message : String(error));
  })
  .finally(() => closeDb());