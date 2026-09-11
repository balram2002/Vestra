'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ExternalLink, Hand, IndianRupee, PhoneOff, Send } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { spring } from '@/lib/motion';
import {
  acknowledgeLiveSpeak,
  endLiveSession,
  getSellerLiveSession,
  offerLivePrice,
  sendLiveMessage,
  type SellerSessionView,
} from '@/server/actions/live';

/**
 * The shop's side of the call.
 *
 * Not the buyer's room with different data: the two people on this call are
 * doing different jobs. The shopper is deciding; the shop is selling, and gets
 * the one control the format exists for, a price quoted on camera that the
 * shopper's Buy button then charges (floored server-side at half the listed
 * price, because a missing digit typed on a phone in a busy shop is a real
 * order at a real loss).
 *
 * ---------------------------------------------------------------------------
 * IT POLLS
 * ---------------------------------------------------------------------------
 * It used to render once and never hear from the call again: not a question
 * typed by a muted shopper, not a raised hand, not even that the shopper had
 * left. Every three seconds it now reads the session, so the shopkeeper sees
 * the messages, the hand and the ending as they happen, and whether the call
 * sold.
 */

const POLL_MS = 3000;

/** What a shopkeeper actually types during a demonstration. */
const REPLIES = [
  'Yes, it is in stock',
  'Showing it now',
  'One moment, please',
  'That is our best price',
] as const;

const DISCOUNTS = [5, 10, 15] as const;

function clockLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** A discount off the list price, rounded to whole rupees, in paise. */
function discounted(sellingPrice: number, percent: number): number {
  return Math.round((sellingPrice * (100 - percent)) / 10_000) * 100;
}

export function SellerLiveRoom({
  sessionId,
  hostUrl,
  embeddable,
  productTitle,
  productImage,
  sellingPrice,
  initial,
}: {
  sessionId: string;
  hostUrl: string | null;
  embeddable: boolean;
  productTitle: string;
  productImage: string;
  sellingPrice: number;
  initial: SellerSessionView;
}) {
  const [view, setView] = useState(initial);
  const [offer, setOffer] = useState('');
  const [reply, setReply] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [offering, startOffer] = useTransition();
  const [sending, startSend] = useTransition();
  const [leaving, startLeave] = useTransition();
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;
  const ended = useRef(initial.status === 'ENDED' || initial.status === 'FAILED');
  const log = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const poll = async () => {
      if (ended.current) return;
      const result = await getSellerLiveSession(sessionId).catch(() => null);
      if (!result?.ok || !result.data) return;
      const next = result.data;
      setView(next);
      if (next.status === 'ENDED' || next.status === 'FAILED') ended.current = true;
    };
    const timer = window.setInterval(poll, POLL_MS);
    return () => window.clearInterval(timer);
  }, [sessionId]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  // Keep the newest message in view without scrolling the page around it.
  useEffect(() => {
    const element = log.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [view.messages.length]);

  /*
   * Hang up when the tab goes away. Matters more on this side: a shop that
   * closes the tab without ending the call stays BUSY and stops receiving
   * requests until the sweep catches it.
   */
  useEffect(() => {
    const leave = () => {
      if (ended.current) return;
      ended.current = true;
      void endLiveSession(sessionId, 'NO_PURCHASE');
    };
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  }, [sessionId]);

  const submitOffer = (paise: number) => {
    startOffer(async () => {
      const result = await offerLivePrice({ sessionId, price: paise });
      if (!result.ok) {
        toast.error(result.error ?? 'Could not send that offer.');
        return;
      }
      setView((v) => ({ ...v, offeredPrice: paise }));
      setOffer('');
      toast.success(`Offer of ${formatMoney(paise)} sent`, {
        description: 'The shopper sees it on their screen now.',
      });
    });
  };

  const onOfferSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // Rupees in the field, because that is what a shopkeeper says out loud.
    const rupees = Number(offer);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      toast.error('Enter a valid price.');
      return;
    }
    submitOffer(Math.round(rupees * 100));
  };

  const sendReply = (text: string) => {
    const value = text.trim();
    if (!value) return;
    startSend(async () => {
      const result = await sendLiveMessage({ sessionId, text: value });
      if (!result.ok || !result.data) {
        toast.error(result.error ?? 'Could not send that.');
        return;
      }
      const message = result.data;
      setView((v) => ({ ...v, messages: [...v.messages, message] }));
      setReply('');
    });
  };

  const acknowledge = () => {
    setView((v) => ({ ...v, speakRequestedAt: null }));
    void acknowledgeLiveSpeak(sessionId);
  };

  const hangUp = () => {
    ended.current = true;
    startLeave(async () => {
      await endLiveSession(sessionId, 'NO_PURCHASE');
      router.push('/seller');
    });
  };

  const isEnded = view.status === 'ENDED' || view.status === 'FAILED';
  const joined = view.startedAt !== null;
  const elapsed = view.startedAt && now !== null ? now - Date.parse(view.startedAt) : null;
  const offerLeft =
    view.offerExpiresAt && now !== null ? Date.parse(view.offerExpiresAt) - now : null;
  const offerCurrent = view.offeredPrice !== null && (offerLeft === null || offerLeft > 0);
  const floor = Math.round(sellingPrice / 2);
  const sold = view.outcome === 'PURCHASED';

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-var(--spacing-console-header)-4rem)] lg:flex-row">
      {/* ------------------------------------------------------------ video */}

      <div className="relative min-h-[45dvh] flex-1 overflow-hidden rounded-2xl bg-slate-950 lg:min-h-0">
        {isEnded ? (
          <Ended sold={sold} joined={joined} reduced={reduced} onDone={() => router.push('/seller')} />
        ) : embeddable && hostUrl ? (
          <iframe
            src={hostUrl}
            title="Live call"
            className="size-full border-0"
            allow="camera; microphone; autoplay; display-capture; fullscreen"
          />
        ) : (
          <OpenExternally hostUrl={hostUrl} />
        )}

        {isEnded ? null : (
          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
            <span className="bg-danger-fill inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-bold text-white">
              <span className="size-1.5 rounded-full bg-white" aria-hidden />
              LIVE{elapsed !== null ? ` ${clockLabel(elapsed)}` : ''}
            </span>
            <span className="rounded-full bg-black/55 px-2.5 py-1 text-2xs text-white backdrop-blur">
              {joined ? 'Shopper is in the call' : 'Waiting for the shopper\u2026'}
            </span>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ panel */}

      <aside className="border-line bg-raised flex w-full shrink-0 flex-col overflow-hidden rounded-2xl border lg:w-[22rem]">
        <div className="border-line flex items-center gap-3 border-b p-4">
          <div className="bg-sunken relative size-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-inset ring-black/[0.07]">
            {productImage ? (
              <Image src={productImage} alt="" fill sizes="56px" className="object-cover" />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="eyebrow">Showing</p>
            <p className="text-ink clamp-2 mt-0.5 text-sm font-medium leading-snug">{productTitle}</p>
            <p className="text-muted tabular mt-0.5 text-xs">Listed at {formatMoney(sellingPrice)}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          <AnimatePresence initial={false}>
            {view.speakRequestedAt && !isEnded ? (
              <motion.div
                key="speak"
                initial={reduced ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -8 }}
                transition={spring.base}
                role="status"
                className="border-warning-100 bg-warning-50 flex items-start gap-3 rounded-xl border p-3"
              >
                <Hand className="text-warning-700 mt-0.5 size-5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-warning-700 text-sm font-semibold">The shopper wants to speak</p>
                  <p className="text-warning-700/80 mt-0.5 text-xs">
                    Unmute them from the participants list in the call.
                  </p>
                </div>
                <Button size="xs" variant="secondary" onClick={acknowledge}>
                  Done
                </Button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* ---------------------------------------------------- live price */}

          <section aria-labelledby="live-offer-title">
            <h2 id="live-offer-title" className="text-ink text-sm font-semibold">
              Live price
            </h2>
            <p className="text-muted mt-1 text-xs">
              {offerCurrent && view.offeredPrice !== null ? (
                <>
                  Offered{' '}
                  <span className="text-ink tabular font-semibold">{formatMoney(view.offeredPrice)}</span>
                  {offerLeft !== null ? ` \u00b7 held for ${clockLabel(offerLeft)}` : ''}
                </>
              ) : (
                'The shopper sees it within seconds, and their Buy button charges it.'
              )}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {DISCOUNTS.map((percent) => {
                const paise = discounted(sellingPrice, percent);
                return (
                  <button
                    key={percent}
                    type="button"
                    disabled={offering || isEnded || paise < floor}
                    onClick={() => submitOffer(paise)}
                    className="border-line text-ink hover:border-accent hover:text-accent-ink rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {percent}% off{' \u00b7 '}
                    <span className="tabular">{formatMoney(paise)}</span>
                  </button>
                );
              })}
            </div>

            <form onSubmit={onOfferSubmit} className="mt-3 space-y-2.5">
              <Input
                label="Or your own price"
                name="offer"
                inputMode="decimal"
                leading={<IndianRupee className="size-4" aria-hidden />}
                value={offer}
                onChange={(event) => setOffer(event.target.value.replace(/[^\d.]/g, ''))}
                disabled={isEnded}
                hint={`Not below ${formatMoney(floor)}.`}
              />
              <Button type="submit" className="w-full" loading={offering} disabled={isEnded || offer === ''}>
                Send offer
              </Button>
            </form>
          </section>

          {/* ------------------------------------------------------ messages */}

          <section aria-labelledby="live-chat-title">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="live-chat-title" className="text-ink text-sm font-semibold">
                Messages
              </h2>
              <span className="text-faint text-2xs">The shopper is muted</span>
            </div>

            <ol
              ref={log}
              aria-live="polite"
              className="bg-sunken mt-2.5 max-h-64 min-h-24 space-y-2 overflow-y-auto rounded-xl p-3"
            >
              {view.messages.length === 0 ? (
                <li className="text-faint py-4 text-center text-xs">
                  Questions the shopper types appear here.
                </li>
              ) : (
                view.messages.map((message) => (
                  <li
                    key={message.id}
                    className={cn('flex', message.from === 'SELLER' ? 'justify-end' : 'justify-start')}
                  >
                    <span
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3 py-1.5 text-xs',
                        message.from === 'SELLER'
                          ? 'bg-accent-soft text-accent-ink rounded-br-md'
                          : 'bg-raised text-ink rounded-bl-md shadow-xs',
                      )}
                    >
                      {message.text}
                    </span>
                  </li>
                ))
              )}
            </ol>

            <div className="no-scrollbar mt-2.5 flex gap-1.5 overflow-x-auto">
              {REPLIES.map((text) => (
                <button
                  key={text}
                  type="button"
                  disabled={sending || isEnded}
                  onClick={() => sendReply(text)}
                  className="border-line text-muted hover:border-line-strong hover:text-ink shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors disabled:opacity-50"
                >
                  {text}
                </button>
              ))}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                sendReply(reply);
              }}
              className="mt-2.5 flex items-center gap-2"
            >
              <div className="min-w-0 flex-1">
                <Input
                  label="Reply"
                  hideLabel
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  maxLength={200}
                  placeholder="Reply to the shopper"
                  disabled={isEnded}
                  autoComplete="off"
                />
              </div>
              <Button
                type="submit"
                size="icon"
                aria-label="Send reply"
                loading={sending}
                disabled={isEnded || reply.trim() === ''}
              >
                <Send className="size-4" aria-hidden />
              </Button>
            </form>
          </section>
        </div>

        <div className="border-line border-t p-4">
          {isEnded ? (
            <Button size="lg" variant="secondary" className="w-full" onClick={() => router.push('/seller')}>
              Back to the dashboard
            </Button>
          ) : (
            <Button variant="danger" size="lg" className="w-full" onClick={() => setConfirmEnd(true)}>
              <PhoneOff className="size-4" aria-hidden />
              End the call
            </Button>
          )}
        </div>
      </aside>

      <Dialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <DialogContent
          size="sm"
          title="End the call?"
          description={
            offerCurrent
              ? 'Your live price stays held for the shopper until it expires.'
              : 'The shopper sees that the call has ended.'
          }
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost" size="sm">
                  Keep talking
                </Button>
              </DialogClose>
              <Button variant="danger" size="sm" loading={leaving} onClick={hangUp}>
                End call
              </Button>
            </>
          }
        >
          <p className="text-muted text-sm">{productTitle}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Ended({
  sold,
  joined,
  reduced,
  onDone,
}: {
  sold: boolean;
  joined: boolean;
  reduced: boolean;
  onDone: () => void;
}) {
  return (
    <div className="grid size-full min-h-[45dvh] place-items-center p-8 text-center">
      <div className="max-w-xs text-white">
        <motion.span
          initial={reduced ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring.base}
          className={cn(
            'mx-auto grid size-14 place-items-center rounded-full',
            sold ? 'bg-success-fill' : 'bg-white/10',
          )}
        >
          {sold ? <Check className="size-7" aria-hidden /> : <PhoneOff className="size-6" aria-hidden />}
        </motion.span>
        <p className="mt-4 text-base font-semibold">{sold ? 'Sold on the call' : 'The call has ended'}</p>
        <p className="mt-1.5 text-sm text-white/70">
          {sold
            ? 'The shopper put it in their bag.'
            : joined
              ? 'The shopper has left.'
              : 'The shopper did not join.'}
        </p>
        <Button className="mt-6" variant="secondary" onClick={onDone}>
          Back to the dashboard
        </Button>
      </div>
    </div>
  );
}

function OpenExternally({ hostUrl }: { hostUrl: string | null }) {
  return (
    <div className="grid size-full min-h-[45dvh] place-items-center p-8 text-center">
      <div className="max-w-xs">
        <p className="text-sm font-semibold text-white">Your call is ready</p>
        <p className="mt-2 text-xs text-white/70">
          Open it in the meeting app, and keep this tab open to price and reply.
        </p>
        {hostUrl ? (
          <Button asChild size="lg" shape="pill" className="mt-5">
            <a href={hostUrl} target="_blank" rel="noreferrer">
              Open the call
              <ExternalLink className="size-4" aria-hidden />
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}