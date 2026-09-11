'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PhoneIncoming, Radio } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { PRESENCE_HEARTBEAT_MS } from '@/domain/live';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { spring } from '@/lib/motion';
import {
  acceptLiveRequest,
  beatLivePresence,
  declineLiveRequest,
  setLivePresence,
} from '@/server/actions/live';

/**
 * The shop's live desk.
 *
 * Two things, and they belong together because one is meaningless without the
 * other: a switch that opens the shop for calls, and the calls that arrive once
 * it is open.
 *
 * It lives in the console's accessory slot, which means it is on EVERY seller
 * screen. That is deliberate — a shopkeeper who has gone live is packing orders
 * or updating stock, not sitting on a dedicated page waiting. A call that only
 * rings on one screen is a call that gets missed.
 *
 * ---------------------------------------------------------------------------
 * THE HEARTBEAT
 * ---------------------------------------------------------------------------
 * Presence expires on its own after 90 seconds — see `PRESENCE_STALE_MS`. This
 * refreshes it every 30, so two beats can be missed before the shop drops out.
 *
 * That design is the whole reason a closed laptop stops ringing. An explicit
 * "I am leaving" is not enough on its own: browsers are closed, phones sleep,
 * and shop wifi drops. A shopper must never be matched to a shop nobody is
 * standing in.
 *
 * ---------------------------------------------------------------------------
 * WHY POLL RATHER THAN PUSH
 * ---------------------------------------------------------------------------
 * A websocket or SSE stream would be the obvious way to deliver an incoming
 * call, and it would need a pub/sub broker to survive more than one server
 * instance — infrastructure this application does not have, for a payload that
 * is a few hundred bytes every few seconds while a shop is open, and nothing at
 * all while it is closed.
 *
 * Three seconds against an 18-second ring means a call is on screen within a
 * sixth of its window. The same poll also drives the server's housekeeping, so
 * the interval is doing two jobs.
 */

const POLL_MS = 3000;

interface IncomingCall {
  id: string;
  productTitle: string;
  productImage: string;
  sellingPrice: number;
  pincode: string;
  hasExactItem: boolean;
  distanceKm: number;
  secondsRemaining: number;
}

export function SellerLiveDesk({
  locationId,
  initialState,
}: {
  locationId: string;
  initialState: 'ONLINE' | 'OFFLINE' | 'BUSY';
}) {
  const [online, setOnline] = useState(initialState !== 'OFFLINE');
  const [calls, setCalls] = useState<IncomingCall[]>([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;

  /*
   * Guards a shopkeeper double-pressing accept on the same card.
   *
   * The server already resolves the race — see `acceptRequest` — but a second
   * press before the first returns produces a second "another store answered"
   * toast for a call this shop actually won, which is a confusing lie.
   */
  const claiming = useRef<string | null>(null);

  /* ------------------------------------------------------------ heartbeat */

  useEffect(() => {
    if (!online) return;
    const timer = window.setInterval(() => {
      void beatLivePresence(locationId);
    }, PRESENCE_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [online, locationId]);

  /*
   * Close the shop when the tab goes away.
   *
   * The heartbeat would expire it within 90 seconds anyway, but that is 90
   * seconds in which shoppers are rung by a closed shop and get no answer —
   * which costs them a third of their matching window. `pagehide` rather than
   * `beforeunload`, which does not fire reliably on mobile.
   */
  useEffect(() => {
    if (!online) return;
    const leave = () => {
      void setLivePresence({ locationId, state: 'OFFLINE' });
    };
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  }, [online, locationId]);

  /* ----------------------------------------------------------------- poll */

  const poll = useCallback(async () => {
    try {
      const response = await fetch('/api/live/seller', { cache: 'no-store' });
      if (!response.ok) return;

      const body = (await response.json()) as { ok: boolean; data: IncomingCall[] };
      if (body.ok) setCalls(body.data);
    } catch {
      // A dropped poll is not a failure; the next one is three seconds away.
    }
  }, []);

  /*
   * The poll only runs while the shop is open.
   *
   * Clearing the list is done by the toggle that closed the shop, not here — a
   * `setState` inside an effect to undo something an event already knew about
   * is a second source of truth for the same fact, and React's lint says so.
   */
  useEffect(() => {
    if (!online) return;

    /*
     * The first poll is scheduled, not called.
     *
     * Calling `poll()` in the effect body would resolve into a `setState`
     * during the same commit that enabled it — which is what React's
     * `set-state-in-effect` rule exists to prevent, and which would make the
     * card list update in the middle of a render pass rather than after it.
     *
     * A zero-delay timeout defers it by one macrotask. The shopkeeper cannot
     * perceive the difference, and it means going live shows a waiting call
     * immediately rather than up to three seconds later.
     */
    const first = window.setTimeout(poll, 0);
    const timer = window.setInterval(poll, POLL_MS);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [online, poll]);

  /* -------------------------------------------------------------- actions */

  const toggle = (next: boolean) => {
    setOnline(next);
    // Closing the shop drops any call still on screen immediately, rather than
    // leaving a card the shopkeeper can no longer answer.
    if (!next) setCalls([]);

    startTransition(async () => {
      const result = await setLivePresence({
        locationId,
        state: next ? 'ONLINE' : 'OFFLINE',
      });

      if (!result.ok) {
        // Put the switch back rather than leaving it lying about the state.
        setOnline(!next);
        toast.error(result.error ?? 'Could not change your live status.');
        return;
      }

      toast.success(next ? 'You are live. Shoppers can call you.' : 'You are offline.');
    });
  };

  const accept = (requestId: string) => {
    if (claiming.current) return;
    claiming.current = requestId;

    startTransition(async () => {
      const result = await acceptLiveRequest(requestId);
      claiming.current = null;

      if (!result.ok || !result.data) {
        // Losing the race is the common case, not an error — say so plainly and
        // drop the card, because it is already gone.
        toast.info(result.error ?? 'That call is no longer available.');
        setCalls((current) => current.filter((call) => call.id !== requestId));
        return;
      }

      router.push(`/seller/live/${result.data.sessionId}`);
    });
  };

  const decline = (requestId: string) => {
    setCalls((current) => current.filter((call) => call.id !== requestId));
    void declineLiveRequest(requestId);
  };

  /*
   * Client-only, for the portal target.
   *
   * `useSyncExternalStore` with a server snapshot of `false` rather than a
   * mounted flag set in an effect — that would be a setState during commit,
   * which React's lint rejects. The store never changes; it only answers "is
   * there a document yet?" differently on each side.
   */
  const hasDocument = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <>
      {/*
        The switch is ONE ROW, because it lives in the console header.

        The previous version stacked the switch, the call cards and (via the
        layout) the signed-in name vertically inside a fixed 62px bar, and the
        content's bottom edge sat 6px below the header's — further with every
        call that arrived.
      */}
      <button
        type="button"
        role="switch"
        aria-checked={online}
        onClick={() => toggle(!online)}
        disabled={pending}
        className={cn(
          'flex h-9 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-xs font-semibold',
          'transition-[background-color,border-color,color] duration-(--duration-base)',
          'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
          'disabled:opacity-60',
          online
            ? 'border-success-500 bg-success-50 text-success-700'
            : 'border-line-control text-muted hover:border-line-bold hover:text-ink',
        )}
      >
        <span className="relative flex size-2" aria-hidden>
          {online ? (
            <span className="bg-success-500 absolute inline-flex size-2 animate-ping rounded-full opacity-70" />
          ) : null}
          <span
            className={cn(
              'relative inline-flex size-2 rounded-full',
              online ? 'bg-success-500' : 'bg-line-bold',
            )}
          />
        </span>
        {online ? 'Live' : 'Go live'}
        {online && calls.length > 0 ? (
          <span className="bg-success-600 tabular grid h-4.5 min-w-4.5 place-items-center rounded-full px-1 text-2xs text-white">
            {calls.length}
          </span>
        ) : null}
      </button>

      {/*
        The call cards are PORTALED to <body>.

        They cannot simply be `position: fixed` where they are: the header
        carries `.glass`, and `backdrop-filter` makes an element the containing
        block for its fixed descendants — the same mechanism that once put the
        product page's pinned bar 242px below the viewport. In the body, fixed
        means the viewport again.

        Bottom-right, stacked, like an incoming-call notification: a call must
        interrupt whatever screen the shopkeeper is on, without taking it over.
      */}
      {hasDocument
        ? createPortal(
            <div
              aria-live="assertive"
              className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
            >
              <AnimatePresence initial={false}>
                {calls.map((call) => (
                  <motion.div
                    key={call.id}
                    layout={!reduced}
                    initial={reduced ? false : { opacity: 0, y: 24, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduced ? undefined : { opacity: 0, x: 40 }}
                    transition={spring.base}
                    className="pointer-events-auto"
                  >
                    <CallCard
                      call={call}
                      onAccept={() => accept(call.id)}
                      onDecline={() => decline(call.id)}
                      busy={pending}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * One incoming call.
 *
 * The countdown is the important part: a shopkeeper deciding whether to walk to
 * a shelf needs to know they have eleven seconds, not that a call is "waiting".
 * It ticks down locally between polls and is corrected by each poll, which is
 * the right trade here — a number that only moves every three seconds reads as
 * frozen, and the drift over one interval is at most a second.
 *
 * The card says whether this shop has the EXACT item or merely the brand, so a
 * shopkeeper does not pick up expecting a sale they cannot make.
 */
function CallCard({
  call,
  onAccept,
  onDecline,
  busy,
}: {
  call: IncomingCall;
  onAccept: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  /*
   * The countdown has NO local timer and NO local state.
   *
   * Three versions of this were wrong before this one, and each was wrong in an
   * instructive way:
   *
   *   state + sync-from-prop    two sources of truth for one number, and the
   *                             sync is a `setState` inside an effect.
   *   derived from `Date.now()` reads the clock during render, which is impure
   *                             and which the React compiler rejects outright.
   *   a `now` in state          works, and spends a re-render of this card
   *                             every second for a figure that changes every
   *                             three.
   *
   * So the NUMBER comes straight from the poll and steps every three seconds,
   * which is the truth. The continuous motion a countdown needs comes from a
   * CSS bar that drains over `secondsRemaining` — re-keyed whenever the server
   * corrects the figure, so it restarts at the right length rather than drifting
   * away from it. The browser animates; React does nothing.
   */
  const seconds = call.secondsRemaining;

  return (
    <div className="border-accent-control bg-raised rounded-2xl border p-3.5 shadow-xl">
      <p className="text-accent-ink flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.1em]">
        <PhoneIncoming className="size-3.5" aria-hidden />
        Live request
        <span className="tabular ml-auto font-normal normal-case tracking-normal">{seconds}s</span>
      </p>

      {/*
        Keyed on the remaining seconds, so each poll restarts the drain at the
        corrected length instead of letting a local animation drift away from
        the server's clock.
      */}
      <div className="bg-accent-line mt-2 h-0.5 overflow-hidden rounded-full" aria-hidden>
        <div
          key={seconds}
          className="bg-accent h-full w-full origin-left motion-safe:[animation:mrd-drain_linear_forwards]"
          style={{ animationDuration: `${seconds}s` }}
        />
      </div>

      <div className="mt-2.5 flex gap-2.5">
        <div className="bg-sunken relative size-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-inset ring-black/[0.07]">
          {call.productImage ? (
            <Image src={call.productImage} alt="" fill sizes="44px" className="object-cover" />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-ink clamp-2 text-xs font-medium leading-snug">{call.productTitle}</p>
          <p className="text-muted tabular mt-1 text-2xs">
            {formatMoney(call.sellingPrice)}
            {call.distanceKm > 0 ? ` · ${call.distanceKm} km away` : ` · ${call.pincode}`}
          </p>
          {!call.hasExactItem ? (
            <p className="text-faint mt-0.5 text-2xs italic">You carry this brand, not this item</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Button size="sm" shape="pill" onClick={onAccept} loading={busy} className="flex-1">
          <Radio className="size-3.5" aria-hidden />
          Take the call
        </Button>
        <Button size="sm" shape="pill" variant="ghost" onClick={onDecline}>
          Skip
        </Button>
      </div>
    </div>
  );
}
