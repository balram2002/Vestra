'use client';

import { MapPin, Radio, ShieldCheck, ShoppingBag, Store, Video } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button, type ButtonProps } from '@/components/ui/button';
import { Switch } from '@/components/ui/choice';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { leaveGroup } from '@/lib/immersive';
import { startLiveRequest } from '@/server/actions/live';

/**
 * "See it live": the second CTA.
 *
 * Sits beside Add to bag and is deliberately the QUIETER of the two: one loud
 * action per screen, and on a product page that is still the one that takes
 * money. This is the alternative for a shopper who is not ready yet.
 *
 * ---------------------------------------------------------------------------
 * THE DIALOG EXPLAINS BEFORE IT ASKS
 * ---------------------------------------------------------------------------
 * The format is new to most shoppers, and "enter your pincode" with no context
 * reads like a delivery check. So the dialog opens on three short steps (who
 * rings, what happens on video, that the price can drop in the call) and says
 * which size the store will show, before asking for anything.
 *
 * ---------------------------------------------------------------------------
 * LOCATION, AND WHY IT ASKS TWICE
 * ---------------------------------------------------------------------------
 * Matching is ranked by distance. The pincode always works and is the
 * fallback the matcher needs regardless; precise location is attempted on top
 * of it, after the shopper has pressed the button, and they can switch it off.
 * Asking for the permission before any intent is how a prompt gets denied
 * for good. The pincode is remembered for next time on this device.
 */

export interface SeeLiveButtonProps extends Omit<ButtonProps, 'onClick' | 'children'> {
  productId: string;
  variantId: string | null;
  /** The size the shopper has picked, so the dialog can say what the store will show. */
  sizeLabel?: string | null;
  /** Prefilled when the shopper already has a delivery pincode on file. */
  defaultPincode?: string;
  label?: string;
  /**
   * Render the glyph alone, for the pinned bar on a phone. The accessible name
   * is kept: this is the entry point to the whole feature.
   */
  iconOnly?: boolean;
}

/** How long to wait for a position before going ahead with the pincode. */
const GEO_TIMEOUT_MS = 6000;
const PINCODE_KEY = 'vestra:live-pincode';

const STEPS = [
  { icon: Store, title: 'We ring stores near you', body: 'Only shops that stock this piece or its brand.' },
  { icon: Video, title: 'They show it on video', body: 'Fabric, fit and colour, up close, in real light.' },
  { icon: ShoppingBag, title: 'Buy it in the call', body: 'At any better price the store offers you.' },
] as const;

/**
 * Ask the browser where we are, and never let it hold up the request.
 *
 * Resolves to null on refusal, error and timeout alike: from the shopper's
 * side they are identical, the request goes out either way. The explicit
 * timeout matters because `getCurrentPosition` can hang for a long time on a
 * desktop with no GPS.
 */
function locate(): Promise<{ latitude: number; longitude: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: { latitude: number; longitude: number } | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timer = window.setTimeout(() => finish(null), GEO_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timer);
        finish({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => {
        window.clearTimeout(timer);
        finish(null);
      },
      // Network accuracy is enough to rank shops; the GPS is slower indoors.
      { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 120_000 },
    );
  });
}

export function SeeLiveButton({
  productId,
  variantId,
  sizeLabel = null,
  defaultPincode = '',
  label = 'See it live',
  iconOnly = false,
  className,
  variant = 'secondary',
  size = 'cta',
  shape = 'pill',
  ...props
}: SeeLiveButtonProps) {
  const [open, setOpen] = useState(false);
  const [pincode, setPincode] = useState(defaultPincode);
  const [precise, setPrecise] = useState(true);
  const [phase, setPhase] = useState<'locating' | 'calling'>('calling');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onOpenChange = (next: boolean) => {
    // Last time's pincode is read when the dialog opens, in an event, so the
    // server render and the first client render agree.
    if (next && !pincode) {
      try {
        const saved = window.localStorage.getItem(PINCODE_KEY);
        if (saved && /^\d{6}$/.test(saved)) setPincode(saved);
      } catch {
        // Storage is blocked; the field simply starts empty.
      }
    }
    setOpen(next);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!/^\d{6}$/.test(pincode)) {
      setError('Enter a valid 6-digit pincode.');
      return;
    }
    setError(null);

    startTransition(async () => {
      setPhase(precise ? 'locating' : 'calling');
      const position = precise ? await locate() : null;
      setPhase('calling');

      const result = await startLiveRequest({
        productId,
        variantId,
        pincode,
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
      });

      if (!result.ok || !result.data) {
        toast.error(result.error ?? 'Could not start a live request.');
        return;
      }

      try {
        window.localStorage.setItem(PINCODE_KEY, pincode);
      } catch {
        // Not remembering is fine.
      }

      /*
       * `NO_SELLERS` still navigates: the matching screen explains it properly
       * and offers Try again. A DOCUMENT navigation, because this crosses into
       * the immersive route group. See `lib/immersive`.
       */
      leaveGroup(`/live/finding/${result.data.requestId}`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          shape={shape}
          aria-label={iconOnly ? label : undefined}
          className={cn('gap-2', className)}
          {...props}
        >
          <span className="relative grid size-4 place-items-center" aria-hidden>
            <Radio className="size-4" />
          </span>
          {iconOnly ? null : label}
        </Button>
      </DialogTrigger>

      <DialogContent
        title="See it live before you buy"
        description="A store near you shows you this piece on a video call. Free, and nothing to install."
      >
        <ol className="grid gap-2.5 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li
              key={step.title}
              className="bg-sunken flex items-start gap-3 rounded-xl p-3 sm:flex-col sm:gap-2"
            >
              <span className="bg-raised text-accent-ink ring-line grid size-9 shrink-0 place-items-center rounded-full ring-1">
                <step.icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="text-ink block text-xs font-semibold">{step.title}</span>
                <span className="text-muted mt-0.5 block text-2xs leading-relaxed">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>

        <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
          <Input
            label="Your pincode"
            name="pincode"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            value={pincode}
            onChange={(event) => setPincode(event.target.value.replace(/\D/g, ''))}
            error={error ?? undefined}
            leading={<MapPin className="size-4" aria-hidden />}
            hint="We only ring stores near you."
            required
          />

          <Switch
            label="Use my precise location"
            description="Ranks stores by real distance. It is never shown to the store."
            checked={precise}
            onChange={(event) => setPrecise(event.target.checked)}
          />

          <p className="text-muted text-xs">
            {sizeLabel ? (
              <>
                The store will show you size <span className="text-ink font-medium">{sizeLabel}</span>.
              </>
            ) : (
              'No size picked yet. You can choose one in the call.'
            )}
          </p>

          <Button type="submit" size="cta" shape="pill" loading={pending} className="w-full">
            {pending
              ? phase === 'locating'
                ? 'Finding your location\u2026'
                : 'Ringing stores\u2026'
              : 'Find a live store'}
          </Button>

          <p className="text-faint flex items-center justify-center gap-1.5 text-center text-2xs">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
            You join muted with your camera off. Only the store is on video.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}