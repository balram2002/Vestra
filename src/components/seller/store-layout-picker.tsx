'use client';

import { Check, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { DesignSketch } from '@/components/console/design/sketches';
import { cn } from '@/lib/cn';
import { chooseStoreLayout } from '@/server/actions/store-layout';

interface LayoutOption {
  variant: string;
  name: string;
  description: string;
  sketch: string;
}

/**
 * The layouts this seller may use for their store page, as the marketplace
 * offers them. Saving is one click, and the store page link reflects it at
 * once.
 */
export function StoreLayoutPicker({
  options,
  marketplace,
  initial,
  storePath,
}: {
  options: LayoutOption[];
  /** The layout a store gets by choosing nothing. */
  marketplace: LayoutOption;
  initial: string | null;
  storePath: string;
}) {
  const [chosen, setChosen] = useState<string | null>(initial);
  const [pending, start] = useTransition();

  const pick = (variant: string | null) => {
    if (variant === chosen || pending) return;
    const before = chosen;
    setChosen(variant);
    start(async () => {
      const result = await chooseStoreLayout({ variant });
      if (result.ok) toast.success(variant ? 'Your store uses its new layout' : 'Your store uses the marketplace layout');
      else {
        setChosen(before);
        toast.error(result.error);
      }
    });
  };

  const cards: Array<LayoutOption & { value: string | null; badge?: string }> = [
    { ...marketplace, value: null, badge: 'Marketplace default' },
    ...options.filter((option) => option.variant !== marketplace.variant).map((option) => ({ ...option, value: option.variant })),
  ];

  return (
    <div>
      <div role="radiogroup" aria-label="Store page layout" className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => {
          // Choosing the default layout by name is the same as choosing nothing.
          const onDefault = chosen === null || chosen === marketplace.variant || !options.some((option) => option.variant === chosen);
          const selected = card.value === null ? onDefault : chosen === card.value;
          return (
            <button
              key={card.value ?? 'default'}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={pending}
              onClick={() => pick(card.value)}
              className={cn(
                'relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors disabled:cursor-wait',
                selected ? 'border-ink ring-ink ring-1' : 'border-line hover:border-ink',
              )}
            >
              {/* A fixed frame: some sketches are tall (Studio's reel wall) and would stretch the card. */}
              <span aria-hidden className="block h-28 overflow-hidden rounded-md">
                <DesignSketch sketch={card.sketch} />
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-ink text-sm font-semibold">{card.name}</span>
                {card.badge ? <span className="text-faint text-2xs">· {card.badge}</span> : null}
                {selected ? <Check className="text-accent-ink ml-auto size-4" aria-hidden /> : null}
              </span>
              <span className="text-muted line-clamp-3 text-xs">{card.description}</span>
            </button>
          );
        })}
      </div>
      <Link href={storePath} className="text-accent-ink mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-medium">
        See your store page
        <ExternalLink className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
