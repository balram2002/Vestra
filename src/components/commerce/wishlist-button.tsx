'use client';

import { Heart } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/cn';
import { toggleWishlistItem } from '@/server/actions/wishlist';

/**
 * The save heart.
 *
 * A tiny client island, mounted on a product card or in the buy box. Everything
 * around it stays a Server Component — a grid of 48 cards must not hydrate 48
 * copies of the page, only 48 buttons.
 *
 * **Optimistic, with a rollback.** The heart fills on press and reverts if the
 * action fails. Waiting for a round trip before filling makes the control feel
 * broken on a slow connection, which is exactly when someone is most likely to
 * press it twice.
 *
 * **The accessible name states the ACTION, not the state.** "Save" and
 * "Saved" — a heart alone cannot say which of the two it means, and
 * `aria-pressed` carries the current state separately so a screen reader
 * announces both without the label having to change its meaning mid-press.
 */
export function WishlistButton({
  productId,
  productTitle,
  initialSaved = false,
  size = 'md',
  variant = 'overlay',
  className,
}: {
  productId: string;
  /** Named in the toast, so a grid of hearts says WHICH product was saved. */
  productTitle?: string;
  initialSaved?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** `overlay` sits on a photograph; `outline` sits in a form row. */
  variant?: 'overlay' | 'outline';
  className?: string;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();

  const press = () => {
    const next = !saved;
    setSaved(next); // optimistic

    startTransition(async () => {
      const result = await toggleWishlistItem({ productId });

      if (!result.ok) {
        setSaved(!next); // rollback
        toast.error(result.error ?? 'Could not update your saved items.');
        return;
      }

      // Trust the server's answer over the optimistic guess: a double-press
      // that races can otherwise leave the heart out of step with the list.
      setSaved(result.saved ?? next);

      if (result.saved) {
        toast.success(productTitle ? `Saved ${productTitle}` : 'Saved to your list');
      }
    });
  };

  const box = { sm: 'size-8', md: 'size-9', lg: 'size-11' }[size];
  const glyph = { sm: 'size-4', md: 'size-[1.05rem]', lg: 'size-5' }[size];

  return (
    <button
      type="button"
      onClick={press}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? 'Saved. Remove from your list' : 'Save to your list'}
      className={cn(
        'grid shrink-0 place-items-center rounded-full',
        'transition-[background-color,border-color,color,transform] duration-(--duration-base) ease-(--ease-out)',
        'motion-safe:active:scale-90',
        'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
        variant === 'overlay'
          ? 'glass text-ink shadow-xs hover:scale-105'
          : 'border-line-control text-muted hover:border-ink hover:text-ink border',
        box,
        className,
      )}
    >
      <Heart
        className={cn(
          glyph,
          'transition-[fill,color] duration-(--duration-base)',
          // The fill is the state. Colour alone would be the only signal, and
          // a red-on-grey heart is one of the commonest colour-blind failures;
          // filled-versus-outline reads at a glance without any hue at all.
          saved ? 'fill-danger-600 text-danger-600' : 'fill-transparent',
        )}
        strokeWidth={saved ? 2 : 1.8}
        aria-hidden
      />
    </button>
  );
}
