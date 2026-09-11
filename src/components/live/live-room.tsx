'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Check,
  ExternalLink,
  Hand,
  MessageSquare,
  MicOff,
  PhoneOff,
  Radio,
  Ruler,
  Send,
  Share2,
  ShoppingBag,
} from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { LiveMessage } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { leaveGroup } from '@/lib/immersive';
import { spring, tween } from '@/lib/motion';
import {
  buyAtLivePrice,
  endLiveSession,
  getLiveSession,
  markLiveSessionActive,
  requestLiveSpeak,
  retryLiveRequest,
  sendLiveMessage,
  type BuyerSessionView,
} from '@/server/actions/live';

/**
 * The live room.
 *
 * A full-bleed video surface with the product, the price and a Buy button over
 * it: the screen this whole feature exists to reach.
 *
 * ---------------------------------------------------------------------------
 * THE PRODUCT SITS ON TOP OF THE VIDEO
 * ---------------------------------------------------------------------------
 * Video in a box with the product beneath it shrinks the call to a letterbox
 * on a phone, and the shopper ends up squinting at a thumbnail of the thing
 * they asked to see up close. So the video fills the screen and everything
 * else floats over a scrim.
 *
 * ---------------------------------------------------------------------------
 * A MUTED SHOPPER STILL TAKES PART
 * ---------------------------------------------------------------------------
 * The provider joins the shopper muted and only the host can open their mic.
 * That is the privacy promise, and it means the shopper needs other ways in:
 *
 *   quick asks and chat   real messages, shown beside the shop's video
 *   ask to speak          a raised hand; the shop unmutes them in the call
 *
 * The room used to fake all three with toasts that went nowhere. Every control
 * here now reaches the other side, or it is not on the screen.
 *
 * ---------------------------------------------------------------------------
 * BUYING DOES NOT END THE CALL
 * ---------------------------------------------------------------------------
 * Buy puts the piece in the bag at the price the shop quoted (checked again
 * on the server, see `buyAtLivePrice`) and the call carries on: a shopper who
 * wants a second colour should not have to ring again. Checkout is the step
 * that leaves. When the call ends, from either side, the room becomes a
 * summary with the price still held, rather than dumping the shopper on the
 * homepage mid-thought.
 */

export interface LiveSize {
  variantId: string;
  size: string;
  colorLabel: string;
  available: number;
  sellingPrice: number;
}

const POLL_MS = 3000;

/** The questions actually asked about a garment on camera. */
const ASKS = [
  'Show another colour',
  'Is my size available?',
  'Show the fabric close up',
  'Any better price?',
] as const;

type Sheet = 'sizes' | 'chat' | 'leave' | null;

function clockLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function countFrom(messages: LiveMessage[], from: LiveMessage['from']): number {
  return messages.filter((message) => message.from === from).length;
}

function lastFrom(messages: LiveMessage[], from: LiveMessage['from']): LiveMessage | null {
  for (const message of [...messages].reverse()) if (message.from === from) return message;
  return null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function LiveRoom({
  session: initial,
  sizes,
  productHref,
}: {
  session: BuyerSessionView;
  sizes: LiveSize[];
  productHref: string;
}) {
  const [session, setSession] = useState(initial);
  const [ended, setEnded] = useState(false);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const [variantId, setVariantId] = useState<string | null>(
    initial.variantId ?? (sizes.length === 1 ? (sizes[0]?.variantId ?? null) : null),
  );
  const [inBag, setInBag] = useState(false);
  const [seenSeller, setSeenSeller] = useState(() => countFrom(initial.messages, 'SELLER'));
  const [incoming, setIncoming] = useState<LiveMessage | null>(null);
  const [offerPop, setOfferPop] = useState(false);
  const [sentAsks, setSentAsks] = useState<string[]>([]);
  const [clock, setClock] = useState<{ start: number | null; now: number | null }>({
    start: null,
    now: null,
  });

  const [buying, startBuying] = useTransition();
  const [leaving, startLeaving] = useTransition();
  const [sending, startSending] = useTransition();
  const [retrying, startRetry] = useTransition();
  const reduced = useReducedMotion() ?? false;

  // Read only in handlers and timers, never during render.
  const endedRef = useRef(false);
  const sheetRef = useRef<Sheet>(null);
  const lastOffer = useRef(initial.offeredPrice);
  const lastSeller = useRef(lastFrom(initial.messages, 'SELLER')?.id ?? null);

  const sessionId = initial.id;

  /* ------------------------------------------------------------------ poll */

  useEffect(() => {
    const poll = async () => {
      if (endedRef.current) return;
      const result = await getLiveSession(sessionId).catch(() => null);
      if (!result?.ok || !result.data) return;
      const next = result.data;
      setSession(next);

      // A new price from the shop: said once, loudly, then it lives on the card.
      if (next.offeredPrice !== null && next.offeredPrice !== lastOffer.current) {
        setOfferPop(true);
        window.setTimeout(() => setOfferPop(false), 6000);
      }
      lastOffer.current = next.offeredPrice;

      const latest = lastFrom(next.messages, 'SELLER');
      if (latest && latest.id !== lastSeller.current) {
        lastSeller.current = latest.id;
        if (sheetRef.current === 'chat') {
          setSeenSeller(countFrom(next.messages, 'SELLER'));
        } else {
          setIncoming(latest);
          window.setTimeout(
            () => setIncoming((current) => (current?.id === latest.id ? null : current)),
            8000,
          );
        }
      }

      if (next.status === 'ENDED' || next.status === 'FAILED') {
        endedRef.current = true;
        sheetRef.current = null;
        setSheet(null);
        setEnded(true);
        setEndedAt(Date.now());
      }
    };

    const timer = window.setInterval(poll, POLL_MS);
    return () => window.clearInterval(timer);
  }, [sessionId]);

  // Arriving on this screen is what separates a room somebody opened from one
  // nobody reached. See `markLiveSessionActive`.
  useEffect(() => {
    void markLiveSessionActive(sessionId);
  }, [sessionId]);

  // The call clock and the offer countdown.
  useEffect(() => {
    const tick = () => setClock((c) => ({ start: c.start ?? Date.now(), now: Date.now() }));
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  // A frame that has not loaded in twelve seconds gets a way out.
  useEffect(() => {
    if (frameReady || !initial.embeddable) return;
    const timer = window.setTimeout(() => setSlow(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [frameReady, initial.embeddable]);

  /*
   * Hang up when the tab goes away. `pagehide`, not `beforeunload`, which
   * mobile Safari does not fire reliably. Without it a shop stays BUSY and a
   * room keeps billing until the sweep catches it.
   */
  useEffect(() => {
    const leave = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      void endLiveSession(sessionId, 'NO_PURCHASE');
    };
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  }, [sessionId]);

  /* -------------------------------------------------------------- handlers */

  const openSheet = (next: Exclude<Sheet, null>) => {
    sheetRef.current = next;
    setSheet(next);
    if (next === 'chat') {
      setSeenSeller(countFrom(session.messages, 'SELLER'));
      setIncoming(null);
    }
  };

  const closeSheet = () => {
    if (sheetRef.current === 'chat') setSeenSeller(countFrom(session.messages, 'SELLER'));
    sheetRef.current = null;
    setSheet(null);
  };

  const buy = (target: string | null = variantId) => {
    if (!target) {
      openSheet('sizes');
      return;
    }
    startBuying(async () => {
      const result = await buyAtLivePrice({ sessionId, variantId: target });
      if (!result.ok) {
        toast.error(result.error ?? 'Could not add that to your bag.');
        return;
      }
      // The card says "In your bag" itself. A toast here would sit on top of
      // the call controls, which is the last place anything should cover.
      setVariantId(target);
      setInBag(true);
      closeSheet();
    });
  };

  const checkout = () => {
    endedRef.current = true;
    startLeaving(async () => {
      await endLiveSession(sessionId, 'PURCHASED');
      leaveGroup('/checkout');
    });
  };

  const hangUp = () => {
    endedRef.current = true;
    startLeaving(async () => {
      await endLiveSession(sessionId, inBag ? 'PURCHASED' : 'NO_PURCHASE');
      sheetRef.current = null;
      setSheet(null);
      setEnded(true);
      setEndedAt(Date.now());
    });
  };

  const send = (text: string, onSent?: () => void) => {
    startSending(async () => {
      const result = await sendLiveMessage({ sessionId, text });
      if (!result.ok || !result.data) {
        toast.error(result.error ?? 'Could not send that.');
        return;
      }
      const message = result.data;
      setSession((s) => ({ ...s, messages: [...s.messages, message] }));
      onSent?.();
    });
  };

  const raiseHand = () => {
    if (session.speakRequestedAt !== null) return;
    setSession((s) => ({ ...s, speakRequestedAt: new Date().toISOString() }));
    void requestLiveSpeak(sessionId).then((result) => {
      if (!result.ok) toast.error(result.error ?? 'Could not reach the store.');
    });
  };

  const share = async () => {
    const url = new URL(productHref, window.location.origin).toString();
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: session.productTitle, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('Product link copied');
    } catch {
      // The share sheet was dismissed. Nothing to say.
    }
  };

  const retry = () =>
    startRetry(async () => {
      const result = await retryLiveRequest(session.requestId);
      if (!result.ok || !result.data) {
        toast.error(result.error ?? 'Start again from the product.');
        return;
      }
      leaveGroup(`/live/finding/${result.data.requestId}`);
    });

  /* --------------------------------------------------------------- derived */

  const host = session.attendantName ?? session.sellerDisplayName;
  const chosen = sizes.find((size) => size.variantId === variantId) ?? null;
  const listPrice = chosen?.sellingPrice ?? session.sellingPrice;
  const offerLeft =
    session.offerExpiresAt && clock.now !== null
      ? Date.parse(session.offerExpiresAt) - clock.now
      : null;
  const offerLive =
    session.offeredPrice !== null &&
    session.offeredPrice < listPrice &&
    (offerLeft === null || offerLeft > 0);
  const price = offerLive && session.offeredPrice !== null ? session.offeredPrice : listPrice;
  const startMs = session.startedAt ? Date.parse(session.startedAt) : clock.start;
  const elapsed = startMs !== null && clock.now !== null ? (endedAt ?? clock.now) - startMs : 0;
  const unread = Math.max(0, countFrom(session.messages, 'SELLER') - seenSeller);
  const raised = session.speakRequestedAt !== null;
  const multiColour = new Set(sizes.map((size) => size.colorLabel)).size > 1;
  const embedded = session.embeddable && Boolean(session.joinUrl);
  /* ---------------------------------------------------------------- render */

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-slate-950 text-white">
      {/* ------------------------------------------------------------ video */}

      <div className="absolute inset-0">
        {ended ? null : embedded && session.joinUrl ? (
          <iframe
            src={session.joinUrl}
            title={`Live with ${session.sellerDisplayName}`}
            className="size-full border-0"
            // The minimum the call needs. Camera is allowed so a shopper MAY
            // turn theirs on; it is off by default at the provider.
            allow="camera; microphone; autoplay; display-capture; fullscreen"
            onLoad={() => setFrameReady(true)}
          />
        ) : (
          <LinkOut session={session} />
        )}
      </div>

      <AnimatePresence>
        {embedded && !frameReady && !ended ? (
          <motion.div
            key="connecting"
            className="absolute inset-0 z-20 grid place-items-center bg-slate-950 p-8 text-center"
            initial={false}
            exit={{ opacity: 0 }}
            transition={tween.base}
          >
            <Connecting
              name={session.sellerDisplayName}
              slow={slow}
              joinUrl={session.joinUrl}
              reduced={reduced}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* -------------------------------------------------------------- top */}

      <header className="scrim relative z-10 flex items-start gap-3 px-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))]">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-semibold backdrop-blur-md"
        >
          {initials(host)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{host}</p>
          <p className="truncate text-2xs text-white/70">{session.sellerDisplayName}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="bg-danger-fill inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-bold tracking-wide">
            <span className="relative flex size-1.5" aria-hidden>
              {reduced ? null : (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
              )}
              <span className="relative inline-flex size-1.5 rounded-full bg-white" />
            </span>
            LIVE
            <span className="tabular font-medium">{clockLabel(elapsed)}</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-2xs text-white/85 backdrop-blur-md">
            <MicOff className="size-3" aria-hidden />
            You joined muted
          </span>
        </div>
      </header>

      {/* ----------------------------------------------------------- bottom */}

      <div className="relative z-10 mt-auto space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-col items-start gap-2 px-4" aria-live="polite">
          <AnimatePresence initial={false}>
            {raised && !ended ? (
              <motion.p
                key="hand"
                initial={reduced ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -8 }}
                transition={spring.base}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs text-white backdrop-blur-md"
              >
                <Hand className="size-3.5" aria-hidden />
                Hand raised. Accept the unmute prompt when the store sends it.
              </motion.p>
            ) : null}

            {incoming ? (
              <motion.button
                key={incoming.id}
                type="button"
                onClick={() => openSheet('chat')}
                initial={reduced ? false : { opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduced ? undefined : { opacity: 0, y: -8 }}
                transition={spring.base}
                className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/95 px-3.5 py-2.5 text-left text-sm text-slate-900 shadow-lg"
              >
                <span className="block text-2xs font-semibold text-slate-500">{host}</span>
                {incoming.text}
              </motion.button>
            ) : null}

            {offerPop && offerLive ? (
              <motion.div
                key={`offer-${session.offeredPrice}`}
                initial={reduced ? false : { opacity: 0, y: 16, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduced ? undefined : { opacity: 0, scale: 0.96 }}
                transition={spring.base}
                className="bg-success-fill inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold text-white shadow-lg"
              >
                <Check className="size-4" aria-hidden />
                {session.sellerDisplayName} offered you {formatMoney(price)}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/*
          The product card. It carries the price the shop just quoted, not the
          listed one: an offer made on camera that the button underneath does
          not honour is the fastest way to lose a shopper's trust in the format.
        */}
        <div className="px-4">
          <motion.div
            layout={!reduced}
            transition={spring.base}
            className="glass text-ink flex items-center gap-3 rounded-2xl p-2.5 shadow-lg"
          >
            <div className="bg-sunken relative size-14 shrink-0 overflow-hidden rounded-xl ring-1 ring-inset ring-black/[0.07]">
              {session.productImage ? (
                <Image src={session.productImage} alt="" fill sizes="56px" className="object-cover" />
              ) : null}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-ink clamp-2 text-xs font-medium leading-snug">
                {session.productTitle}
              </p>
              <div className="tabular mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={price}
                    initial={reduced ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? undefined : { opacity: 0, y: -8 }}
                    transition={tween.base}
                    className="text-ink text-md font-semibold"
                  >
                    {formatMoney(price)}
                  </motion.span>
                </AnimatePresence>
                {offerLive ? (
                  <>
                    <s className="text-faint text-2xs">{formatMoney(listPrice)}</s>
                    <span className="bg-success-50 text-success-700 rounded px-1.5 py-0.5 text-2xs font-semibold">
                      Live offer
                    </span>
                  </>
                ) : null}
              </div>
              <p
                className={cn(
                  'mt-0.5 truncate text-2xs',
                  inBag ? 'text-success-700 font-medium' : 'text-muted',
                )}
              >
                {inBag ? (
                  `In your bag${chosen ? `, size ${chosen.size}` : ''}. The call carries on.`
                ) : (
                  <>
                    {offerLive && offerLeft !== null ? `Held for ${clockLabel(offerLeft)}` : null}
                    {offerLive && offerLeft !== null && chosen ? ' \u00b7 ' : null}
                    {chosen ? `Size ${chosen.size}` : offerLive ? null : 'Choose a size to buy'}
                  </>
                )}
              </p>
            </div>

            {inBag ? (
              <Button size="sm" shape="pill" onClick={checkout} loading={leaving} className="shrink-0">
                Checkout
              </Button>
            ) : (
              <Button size="sm" shape="pill" onClick={() => buy()} loading={buying} className="shrink-0">
                <ShoppingBag className="size-3.5" aria-hidden />
                {variantId ? 'Buy now' : 'Choose size'}
              </Button>
            )}
          </motion.div>
        </div>

        {/* Quick asks: real messages, so a muted shopper can join in at once. */}
        <div
          role="group"
          aria-label="Quick questions for the store"
          className="no-scrollbar flex gap-2 overflow-x-auto px-4"
        >
          {ASKS.map((ask) => {
            const done = sentAsks.includes(ask);
            return (
              <button
                key={ask}
                type="button"
                disabled={sending}
                onClick={() =>
                  send(ask, () => setSentAsks((list) => [...list, ask]))
                }
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-2xs font-medium',
                  'text-white backdrop-blur-md transition-[background-color,transform] duration-(--duration-base)',
                  'hover:bg-white/25 motion-safe:active:scale-95 disabled:opacity-60',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                  done ? 'bg-white/30' : 'bg-white/15',
                )}
              >
                {done ? <Check className="size-3" aria-hidden /> : null}
                {ask}
              </button>
            );
          })}
        </div>

        {/* --------------------------------------------------------- controls */}

        <div className="flex items-start justify-center gap-3 px-4 pt-1 sm:gap-5">
          <Control
            label={raised ? 'Hand raised' : 'Ask to speak'}
            onClick={raiseHand}
            active={raised}
          >
            <Hand className="size-5" />
          </Control>
          <Control label="Chat" onClick={() => openSheet('chat')} badge={unread}>
            <MessageSquare className="size-5" />
          </Control>
          <Control label="End" onClick={() => openSheet('leave')} tone="danger" size="lg">
            <PhoneOff className="size-6" />
          </Control>
          <Control label="Sizes" onClick={() => openSheet('sizes')} disabled={sizes.length === 0}>
            <Ruler className="size-5" />
          </Control>
          <Control label="Share" onClick={share}>
            <Share2 className="size-5" />
          </Control>
        </div>
      </div>

      {/* ------------------------------------------------------------ ended */}

      <AnimatePresence>
        {ended ? (
          <motion.div
            key="ended"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={tween.base}
            className="absolute inset-0 z-30 flex flex-col overflow-y-auto bg-slate-950/95 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] backdrop-blur-xl"
          >
            <div className="m-auto w-full max-w-sm text-center">
              <motion.span
                initial={reduced ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={spring.base}
                className="mx-auto grid size-16 place-items-center rounded-full bg-white/10"
              >
                <PhoneOff className="size-7" aria-hidden />
              </motion.span>
              <h1 className="mt-5 text-xl font-semibold">Call ended</h1>
              <p className="mt-1.5 text-sm text-white/70">
                {session.sellerDisplayName}
                {elapsed > 0 ? ` \u00b7 ${clockLabel(elapsed)}` : ''}
              </p>

              {offerLive ? (
                <div className="mt-6 rounded-2xl bg-white/10 p-4 text-left">
                  <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-white/60">
                    Your live price
                  </p>
                  <p className="tabular mt-1 text-2xl font-semibold">{formatMoney(price)}</p>
                  <p className="mt-1 text-xs text-white/70">
                    <s>{formatMoney(listPrice)}</s>
                    {offerLeft !== null ? ` \u00b7 held for ${clockLabel(offerLeft)}` : ''}
                  </p>
                </div>
              ) : null}

              <div className="mt-8 space-y-2.5">
                {inBag ? (
                  <Button size="cta" shape="pill" onClick={checkout} loading={leaving}>
                    Checkout
                  </Button>
                ) : (
                  <Button size="cta" shape="pill" onClick={() => buy()} loading={buying}>
                    <ShoppingBag className="size-4" aria-hidden />
                    {offerLive ? `Buy at ${formatMoney(price)}` : 'Buy now'}
                  </Button>
                )}
                <Button
                  size="lg"
                  shape="pill"
                  variant="secondary"
                  className="w-full"
                  onClick={retry}
                  loading={retrying}
                >
                  <Radio className="size-4" aria-hidden />
                  Find another store
                </Button>
                {/* A document navigation: the product page is in another route group. */}
                <a
                  href={productHref}
                  className="block py-2 text-sm text-white/70 underline-offset-2 hover:text-white hover:underline"
                >
                  Back to the product
                </a>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ----------------------------------------------------------- sheets */}

      <Dialog open={sheet === 'sizes'} onOpenChange={(open) => (open ? openSheet('sizes') : closeSheet())}>
        <DialogContent
          title="Choose your size"
          description={
            offerLive
              ? `At your live price of ${formatMoney(price)}, for one piece.`
              : 'It goes in your bag and the call carries on.'
          }
          footer={
            <Button
              size="lg"
              shape="pill"
              className="w-full"
              disabled={!chosen || chosen.available < 1}
              loading={buying}
              onClick={() => buy(variantId)}
            >
              <ShoppingBag className="size-4" aria-hidden />
              {chosen ? `Add size ${chosen.size} \u00b7 ${formatMoney(price)}` : 'Pick a size'}
            </Button>
          }
        >
          <SizeGrid sizes={sizes} value={variantId} onChange={setVariantId} showColour={multiColour} />
        </DialogContent>
      </Dialog>

      <Dialog open={sheet === 'chat'} onOpenChange={(open) => (open ? openSheet('chat') : closeSheet())}>
        <DialogContent
          title={`Chat with ${session.sellerDisplayName}`}
          description="They see your messages beside the video."
          footer={<Composer pending={sending} disabled={ended} onSend={(text, done) => send(text, done)} />}
        >
          <ChatLog messages={session.messages} host={host} />
        </DialogContent>
      </Dialog>

      <Dialog open={sheet === 'leave'} onOpenChange={(open) => (open ? openSheet('leave') : closeSheet())}>
        <DialogContent
          size="sm"
          title="End the call?"
          description={
            inBag
              ? 'Your bag keeps what you added, at the price you were given.'
              : offerLive
                ? `Your live price of ${formatMoney(price)} stays held for a while after the call.`
                : `${session.sellerDisplayName} will see that you left.`
          }
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost" size="sm">
                  Stay
                </Button>
              </DialogClose>
              <Button variant="danger" size="sm" loading={leaving} onClick={hangUp}>
                <PhoneOff className="size-3.5" aria-hidden />
                End call
              </Button>
            </>
          }
        >
          <div className="flex items-center gap-3">
            <div className="bg-sunken relative size-12 shrink-0 overflow-hidden rounded-lg">
              {session.productImage ? (
                <Image src={session.productImage} alt="" fill sizes="48px" className="object-cover" />
              ) : null}
            </div>
            <p className="text-muted clamp-2 text-xs">{session.productTitle}</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
/* --------------------------------------------------------------- controls */

function Control({
  label,
  onClick,
  children,
  active,
  tone,
  size = 'md',
  badge = 0,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  tone?: 'danger';
  size?: 'md' | 'lg';
  badge?: number;
  disabled?: boolean;
}) {
  return (
    <div className="flex w-14 flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={badge > 0 ? `${label}, ${badge} new` : label}
        aria-pressed={active}
        className={cn(
          'relative grid shrink-0 place-items-center rounded-full backdrop-blur-md',
          'transition-[transform,background-color] duration-(--duration-base) ease-(--ease-out)',
          'motion-safe:active:scale-90 disabled:opacity-40',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
          size === 'lg' ? 'size-16' : 'size-12',
          tone === 'danger'
            ? 'bg-danger-fill text-white'
            : active
              ? 'bg-white text-slate-900'
              : 'bg-white/15 text-white hover:bg-white/25',
        )}
      >
        {children}
        {badge > 0 ? (
          <span className="bg-danger-fill absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full px-1 text-2xs font-bold text-white ring-2 ring-slate-950">
            {badge}
          </span>
        ) : null}
      </button>
      <span aria-hidden className="text-center text-2xs font-medium leading-tight text-white/80">
        {label}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ sizes */

function SizeGrid({
  sizes,
  value,
  onChange,
  showColour,
}: {
  sizes: LiveSize[];
  value: string | null;
  onChange: (variantId: string) => void;
  showColour: boolean;
}) {
  if (sizes.length === 0) {
    return <p className="text-muted text-sm">No sizes are on sale right now.</p>;
  }

  return (
    <div role="radiogroup" aria-label="Size" className="grid grid-cols-4 gap-2 sm:grid-cols-5">
      {sizes.map((size) => {
        const out = size.available < 1;
        const selected = size.variantId === value;
        return (
          <button
            key={size.variantId}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={out}
            onClick={() => onChange(size.variantId)}
            className={cn(
              'border-line text-ink flex min-h-12 flex-col items-center justify-center rounded-xl border px-2 py-2 text-sm font-medium',
              'transition-colors duration-(--duration-fast)',
              'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
              selected && 'border-accent bg-accent-soft text-accent-ink',
              out && 'text-faint cursor-not-allowed line-through opacity-60',
            )}
          >
            {size.size}
            {showColour ? <span className="text-faint text-2xs font-normal">{size.colorLabel}</span> : null}
            {!out && size.available <= 3 ? (
              <span className="text-warning-700 text-2xs font-normal">{size.available} left</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------- chat */

function ChatLog({ messages, host }: { messages: LiveMessage[]; host: string }) {
  const end = useRef<HTMLLIElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <p className="text-muted py-6 text-center text-sm">
        Nothing yet. Ask anything without unmuting; the store reads it beside the video.
      </p>
    );
  }

  return (
    <ol className="space-y-2.5">
      {messages.map((message) => (
        <li
          key={message.id}
          className={cn('flex', message.from === 'BUYER' ? 'justify-end' : 'justify-start')}
        >
          <div
            className={cn(
              'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm',
              message.from === 'BUYER'
                ? 'bg-accent-soft text-accent-ink rounded-br-md'
                : 'bg-sunken text-ink rounded-bl-md',
            )}
          >
            {message.from === 'SELLER' ? (
              <span className="text-faint block text-2xs font-semibold">{host}</span>
            ) : null}
            {message.text}
          </div>
        </li>
      ))}
      <li ref={end} aria-hidden className="h-px" />
    </ol>
  );
}

function Composer({
  pending,
  disabled,
  onSend,
}: {
  pending: boolean;
  disabled: boolean;
  onSend: (text: string, done: () => void) => void;
}) {
  const [text, setText] = useState('');

  return (
    <form
      className="flex w-full items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const value = text.trim();
        if (!value) return;
        onSend(value, () => setText(''));
      }}
    >
      <div className="min-w-0 flex-1">
        <Input
          label="Message"
          hideLabel
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={200}
          placeholder={disabled ? 'The call has ended' : 'Ask the store anything'}
          disabled={disabled}
          autoComplete="off"
        />
      </div>
      <Button
        type="submit"
        size="icon"
        shape="pill"
        aria-label="Send message"
        disabled={disabled || text.trim() === ''}
        loading={pending}
      >
        <Send className="size-4" aria-hidden />
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------ connecting */

function Connecting({
  name,
  slow,
  joinUrl,
  reduced,
}: {
  name: string;
  slow: boolean;
  joinUrl: string | null;
  reduced: boolean;
}) {
  return (
    <div className="max-w-xs">
      <div className="relative mx-auto grid size-20 place-items-center">
        {reduced
          ? null
          : [0, 1].map((ring) => (
              <motion.span
                key={ring}
                aria-hidden
                className="absolute inset-0 rounded-full border border-white/30"
                initial={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 1.9, opacity: 0 }}
                transition={{ duration: 1.8, repeat: Infinity, delay: ring * 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            ))}
        <span className="grid size-20 place-items-center rounded-full bg-white/10">
          <Radio className="size-8" aria-hidden />
        </span>
      </div>
      <p className="mt-6 text-base font-semibold" role="status">
        {'Connecting you to '}
        {name}
        {'\u2026'}
      </p>
      <p className="mt-2 text-sm text-white/65">
        You join muted, with your camera off. Only the store is on video.
      </p>
      {slow && joinUrl ? (
        <a
          href={joinUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-white underline underline-offset-4"
        >
          Taking a while? Open the call in a new tab
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

/**
 * When the room cannot be embedded.
 *
 * Not an error: the call works, it simply happens in another tab. The product,
 * the price and Buy stay here, so the shopper comes back to finish rather than
 * trying to buy inside a meeting app.
 */
function LinkOut({ session }: { session: BuyerSessionView }) {
  return (
    <div className="grid size-full place-items-center bg-slate-900 p-8 text-center">
      <div className="max-w-xs">
        <p className="text-sm font-semibold text-white">
          Your call with {session.sellerDisplayName} is ready
        </p>
        <p className="mt-2 text-xs text-white/70">
          This store uses a meeting app that opens in its own tab. Come back here to buy.
        </p>
        {session.joinUrl ? (
          <Button asChild size="lg" shape="pill" className="mt-5">
            <a href={session.joinUrl} target="_blank" rel="noreferrer">
              Join the call
              <ExternalLink className="size-4" aria-hidden />
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}