import type { Metadata } from 'next';

import { Radio } from 'lucide-react';
import { Suspense } from 'react';

/**
 * The mock provider's meeting surface.
 *
 * This is what `LIVE_PROVIDER=mock` points its `joinUrl` and `hostUrl` at, and
 * it exists so the entire flow — request, match, accept, join, buy, hang up —
 * can be built, reviewed and demonstrated with no vendor account, no
 * credentials and no billing.
 *
 * It renders inside the live room's iframe exactly where the real video would
 * be, so every surface around the call is laid out against the real geometry
 * rather than against a placeholder that will move later.
 *
 * ---------------------------------------------------------------------------
 * IT SAYS WHAT IT IS
 * ---------------------------------------------------------------------------
 * Loudly, and that is the point. The failure mode this protects against is a
 * misconfigured deployment where a real provider silently falls back — see
 * `server/live/index.ts`, which does exactly that when Zoom credentials are
 * missing. A demo room that looked like a connecting call would let that ship;
 * one that says "demo room" cannot be mistaken for a shop.
 */

export const metadata: Metadata = {
  title: 'Demo room',
  robots: { index: false, follow: false },
};

/*
 * Not async, and neither `params` nor `searchParams` is awaited here.
 *
 * Both are runtime reads, and under Cache Components a runtime read outside a
 * Suspense boundary fails the build. They cross the boundary as Promises and
 * are resolved inside.
 */
export default function MockRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-slate-900" aria-hidden />}>
      <MockRoom params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function MockRoom({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const { id } = await params;
  const { role } = await searchParams;

  return (
    <div className="grid min-h-dvh place-items-center bg-slate-900 p-8 text-center">
      <div className="max-w-sm">
        <span
          className="mx-auto grid size-16 place-items-center rounded-full bg-white/10"
          aria-hidden
        >
          <Radio className="size-7 text-white" />
        </span>

        <p className="mt-5 text-sm font-semibold text-white">Demo room</p>

        <p className="mt-2 text-xs leading-relaxed text-white/70">
          No video provider is configured, so this stands in for the call. Every other part of
          the flow is real — the match, the product, the live price and the Buy button all work.
        </p>

        <dl className="mt-6 space-y-1 text-2xs text-white/50">
          <div className="flex justify-center gap-2">
            <dt>Room</dt>
            <dd className="font-mono">{id}</dd>
          </div>
          <div className="flex justify-center gap-2">
            <dt>Joined as</dt>
            {/*
              The role is shown because the two links are a real permission
              split even in the mock — a host link and a guest link are not
              interchangeable, and a mock that blurred them would teach the
              surfaces around it a lie.
            */}
            <dd>{role === 'host' ? 'Store (host)' : 'Shopper (muted)'}</dd>
          </div>
        </dl>

        <p className="mt-6 text-2xs text-white/40">
          Set <code className="font-mono">LIVE_PROVIDER=zoom</code> to use a real room.
        </p>
      </div>
    </div>
  );
}
