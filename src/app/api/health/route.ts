import { connection } from 'next/server';

import { pingDb } from '@/server/db/client';

/**
 * Health check, for the load balancer and uptime monitoring.
 *
 * 200 when the process is up AND can reach the database, 503 otherwise, so a
 * node that has lost Mongo leaves the pool instead of serving errors. Nothing
 * about the deployment is disclosed: no versions, no hostnames, and no error
 * text from the driver.
 */
export async function GET() {
  await connection();

  const started = Date.now();
  const database = await pingDb();

  return Response.json(
    {
      status: database.ok ? 'ok' : 'degraded',
      checks: { database: database.ok ? 'ok' : 'unreachable' },
      latencyMs: Date.now() - started,
      uptimeSeconds: Math.round(process.uptime()),
      time: new Date().toISOString(),
    },
    { status: database.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}