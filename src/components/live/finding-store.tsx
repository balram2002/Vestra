'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, RotateCcw, ShieldCheck, Store, X } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { LIVE_CANDIDATE_META, LIVE_REQUEST_WINDOW_MS } from '@/domain/live';
import type { LiveCandidate, LiveRequestView } from '@/domain/types';
import { cn } from '@/lib/cn';
import { leaveGroup } from '@/lib/immersive';
import { spring } from '@/lib/motion';
import { cancelLiveRequest, retryLiveRequest } from '@/server/actions/live';

/**
 * "Finding the best store for you".
 *
 * The screen a shopper stares at for up to a minute, which makes it the surface
 * most responsible for whether the feature feels alive or broken.
 *
 * It SHOWS THE WORK. The candidate list is the loading state: named shops, each
 * with its distance, its rating and its own status moving from queued to
 * ringing to answered, over a countdown with a radar sweep behind it. Dead time
 * becomes information, the same reason a delivery app shows the courier's map
 * rather than an hourglass.
 *
 * Every ending has a next step. A search nobody answered offers Try again (a
 * fresh search reaches whoever has come online since) beside the way back to
 * the product, instead of a dead end that reads as a broken feature.
 *
 * The poll runs every two seconds and drives the server's state machine as
 * well as this screen. The countdown comes from the server on every poll, so a
 * wrong clock or a backgrounded tab still shows the truth.
 */

const POLL_MS = 2000;

export function FindingStore({
  requestId,
  initial,
  productTitle,
  productImage,
  productHref,
}: {
  requestId: string;
  initial: LiveRequestView;
  productTitle: string;
  productImage: string;
  productHref: string;
}) {
  const [view, setView] = useState<LiveRequestView>(initial);
  const [cancelling, startCancel] = useTransition();
  const [retrying, startRetry] = useTransition();
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;

  /*
   * The poll stops itself. Held in a ref rather than state so the interval is
   * not torn down and rebuilt on every status change, which would reset its
   * phase often enough to visibly stutter the countdown.
   */
  const stopped = useRef(false);

  const poll = useCallback(async () => {
    if (stopped.current) return;

    try {
      const response = await fetch(`/api/live/request/${requestId}`, { cache: 'no-store' });
      if (!response.ok) {
        stopped.current = true;
        return;
      }

      const body = (await response.json()) as { ok: boolean; data: LiveRequestView };
      if (!body.ok) {
        stopped.current = true;
        return;
      }

      setView(body.data);

      if (body.data.status === 'MATCHED' && body.data.sessionId) {
        stopped.current = true;
        // `replace`: the matching screen must not be in the back stack, or a
        // shopper who ends a call and presses back lands on a dead countdown.
        router.replace(`/live/session/${body.data.sessionId}`);
        return;
      }

      if (body.data.status !== 'MATCHING') stopped.current = true;
    } catch {
      // A dropped poll is not a failure; the next one is two seconds away.
    }
  }, [requestId, router]);

  useEffect(() => {
    if (view.status !== 'MATCHING') return;
    const timer = window.setInterval(poll, POLL_MS);
    return () => window.clearInterval(timer);
    // Keyed on the STATUS, not the whole view, so the interval keeps its phase.
  }, [poll, view.status]);

  const cancel = () => {
    stopped.current = true;
    startCancel(async () => {
      await cancelLiveRequest(requestId);
      leaveGroup(productHref);
    });
  };

  const retry = () =>
    startRetry(async () => {
      const result = await retryLiveRequest(requestId);
      if (!result.ok || !result.data) {
        toast.error(result.error ?? 'Could not search again.');
        return;
      }
      // A document navigation, so the new request mounts with a clean slate
      // rather than inheriting this one's finished state.
      leaveGroup(`/live/finding/${result.data.requestId}`);
    });

  const matching = view.status === 'MATCHING';
  const ringing = view.candidates.filter((candidate) => candidate.state === 'RINGING').length;
  const queued = view.candidates.filter((candidate) => candidate.state === 'QUEUED').length;
  const accepted = view.candidates.find((candidate) => candidate.state === 'ACCEPTED') ?? null;

  const title = matching ? 'Finding the best store for you' : LABEL[view.status];
  const detail = matching
    ? 'Ringing nearby stores that can show you this product live.'
    : view.status === 'MATCHED' && accepted
      ? `Connecting you to ${accepted.displayName}\u2026`
      : DETAIL[view.status];

  // What a screen reader hears: status changes, never the ticking seconds.
  const announcement = matching
    ? ringing > 0
      ? `Ringing ${ringing} ${ringing === 1 ? 'store' : 'stores'}`
      : 'Lining up stores near you'
    : `${title}. ${detail}`;

  return (
    <div className="gutter shell-narrow flex min-h-dvh flex-col py-6">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="title text-ink text-xl sm:text-2xl">{title}</h1>
          <p className="text-muted mt-1.5 text-sm">{detail}</p>
        </div>

        {/* A plain anchor: leaving the immersive group needs a document navigation. */}
        <a
          href={productHref}
          aria-label="Back to the product"
          className="text-muted hover:bg-sunken hover:text-ink grid size-11 shrink-0 place-items-center rounded-full transition-colors"
        >
          <X className="size-5" aria-hidden />
        </a>
      </header>

      {/* ------------------------------------------------------- countdown */}

      {matching ? (
        <Countdown seconds={view.secondsRemaining} reduced={reduced} ringing={ringing} queued={queued} />
      ) : (
        <div className="my-8 flex justify-center">
          <motion.div
            initial={reduced ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={spring.base}
            className={cn(
              'grid size-24 place-items-center rounded-full',
              view.status === 'MATCHED' ? 'bg-success-50' : 'bg-sunken',
            )}
            aria-hidden
          >
            {view.status === 'MATCHED' ? (
              <Check className="text-success-700 size-10" strokeWidth={2.5} />
            ) : (
              <Store className="text-faint size-9" strokeWidth={1.5} />
            )}
          </motion.div>
        </div>
      )}

      {/* ------------------------------------------------------ candidates */}

      {view.candidates.length > 0 ? (
        <ul className="space-y-2" aria-label="Stores being called">
          <AnimatePresence initial={false}>
            {view.candidates.map((candidate, index) => (
              <motion.li
                key={candidate.sellerId}
                layout={!reduced}
                initial={reduced ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring.base, delay: reduced ? 0 : index * 0.05 }}
              >
                <CandidateRow candidate={candidate} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : null}

      {/* ---------------------------------------------------------- footer */}

      <div className="mt-auto pt-8">
        {matching ? (
          <>
            <div className="border-line bg-raised flex items-start gap-3 rounded-xl border p-4">
              <ShieldCheck className="text-accent-ink mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="text-ink text-sm font-medium">
                  We&apos;ll connect you to the first nearby store that picks up
                </p>
                <p className="text-muted mt-1 text-xs">
                  You join muted with your camera off. Only the store is on video.
                </p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="lg"
              className="mt-3 w-full"
              onClick={cancel}
              loading={cancelling}
            >
              Cancel
            </Button>
          </>
        ) : view.status === 'MATCHED' ? null : (
          <div className="space-y-2.5">
            <Button size="cta" shape="pill" onClick={retry} loading={retrying}>
              <RotateCcw className="size-4" aria-hidden />
              {view.status === 'CANCELLED' ? 'Start again' : 'Try again'}
            </Button>
            <Button asChild size="lg" shape="pill" variant="secondary" className="w-full">
              <a href={productHref}>Back to the product</a>
            </Button>
            <p className="text-faint text-center text-2xs">
              You can still add it to your bag and buy it now.
            </p>
          </div>
        )}
      </div>

      {/* The product, so the shopper never loses track of what they asked for. */}
      <div className="border-line mt-6 flex items-center gap-3 border-t pt-5">
        <div className="bg-sunken relative size-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-inset ring-black/[0.07]">
          {productImage ? (
            <Image src={productImage} alt="" fill sizes="48px" className="object-cover" />
          ) : null}
        </div>
        <p className="text-muted clamp-2 text-xs">{productTitle}</p>
      </div>
    </div>
  );
}

const LABEL: Record<LiveRequestView['status'], string> = {
  MATCHING: 'Finding the best store for you',
  MATCHED: 'Store found',
  EXPIRED: 'No store picked up',
  NO_SELLERS: 'No store live nearby',
  CANCELLED: 'Cancelled',
};

const DETAIL: Record<LiveRequestView['status'], string> = {
  MATCHING: '',
  MATCHED: 'Connecting you now.',
  EXPIRED: 'Stores near you were busy with other shoppers. Try again in a minute.',
  NO_SELLERS: 'No store near you is live with this right now. Stores go live through the day.',
  CANCELLED: 'You cancelled this request.',
};

/**
 * The ring, the number inside it, and the sweep behind it.
 *
 * An SVG arc rather than a conic gradient, because a gradient cannot have a
 * rounded cap. The arc steps once per poll from the server's number, with a
 * transition to smooth the step: prettier local animation would drift from the
 * truth on a backgrounded tab. The radar rings are decoration, off under
 * reduced motion, and the number is hidden from screen readers; the timer role
 * carries it without announcing every second.
 */
function Countdown({
  seconds,
  reduced,
  ringing,
  queued,
}: {
  seconds: number;
  reduced: boolean;
  ringing: number;
  queued: number;
}) {
  const RADIUS = 46;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const total = LIVE_REQUEST_WINDOW_MS / 1000;
  const ratio = Math.max(0, Math.min(1, seconds / total));

  return (
    <div className="my-8 flex flex-col items-center">
      <div
        className="relative grid size-28 place-items-center"
        role="timer"
        aria-label={`${seconds} seconds left`}
      >
        {reduced
          ? null
          : [0, 1, 2].map((ring) => (
              <motion.span
                key={ring}
                aria-hidden
                className="border-accent absolute inset-0 rounded-full border"
                initial={{ scale: 1, opacity: 0.4 }}
                animate={{ scale: 1.9, opacity: 0 }}
                transition={{
                  duration: 2.4,
                  repeat: Infinity,
                  delay: ring * 0.8,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
            ))}

        <svg viewBox="0 0 100 100" className="absolute inset-0 size-28 -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={RADIUS} fill="var(--surface-raised)" strokeWidth="5" stroke="var(--surface-sunken)" />
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            stroke="var(--accent-solid)"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
            style={{ transition: reduced ? undefined : `stroke-dashoffset ${POLL_MS}ms linear` }}
          />
        </svg>

        <p className="tabular text-ink relative text-2xl font-semibold" aria-hidden>
          {String(Math.floor(seconds / 60)).padStart(2, '0')}:
          {String(seconds % 60).padStart(2, '0')}
        </p>
      </div>

      <p className="text-muted mt-5 text-xs" aria-hidden>
        {ringing > 0 ? `Ringing ${ringing} ${ringing === 1 ? 'store' : 'stores'}` : 'Lining up stores'}
        {queued > 0 ? ` \u00b7 ${queued} waiting` : ''}
      </p>
    </div>
  );
}

/**
 * One shop in the list. The state on the right is the point of the row: it is
 * what turns a static list into visible progress.
 */
function CandidateRow({ candidate }: { candidate: LiveCandidate }) {
  const meta = LIVE_CANDIDATE_META[candidate.state];
  const ringing = candidate.state === 'RINGING';
  const accepted = candidate.state === 'ACCEPTED';

  return (
    <div
      className={cn(
        'border-line bg-raised flex items-center gap-3 rounded-xl border p-3',
        'transition-colors duration-(--duration-base)',
        accepted && 'border-success-500 bg-success-50',
        (candidate.state === 'DECLINED' ||
          candidate.state === 'TIMED_OUT' ||
          candidate.state === 'SUPERSEDED') &&
          'opacity-55',
      )}
    >
      <div className="bg-sunken relative size-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-inset ring-black/[0.07]">
        {candidate.logoUrl ? (
          <Image src={candidate.logoUrl} alt="" fill sizes="44px" className="object-cover" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-sm font-medium">{candidate.displayName}</p>
        <p className="text-faint tabular mt-0.5 truncate text-2xs">
          {candidate.distanceKm > 0 ? `${candidate.distanceKm} km` : candidate.area}
          {' \u00b7 '}
          {candidate.ratingAverage.toFixed(1)}
          {'\u2605'} ({candidate.ratingCount})
        </p>
        {/*
          "Has this item" and "carries this brand" are different promises, and
          the shopper is told which one they are being connected to.
        */}
        {!candidate.hasExactItem ? (
          <p className="text-faint mt-0.5 text-2xs italic">Carries this brand</p>
        ) : null}
      </div>

      <div className="shrink-0">
        {ringing ? (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="border-accent size-4 animate-spin rounded-full border-2 border-t-transparent"
            />
            <span className="text-accent-ink text-2xs font-medium">Ringing</span>
          </span>
        ) : (
          <span className={cn('text-2xs font-medium', accepted ? 'text-success-700' : 'text-faint')}>
            {meta.label}
          </span>
        )}
      </div>
    </div>
  );
}