'use client';

import { Check } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { updateStock } from '@/server/actions/seller';

/**
 * Inline stock count.
 *
 * A SET, not a delta, because that is what a stock take is: the seller counted
 * what is on the shelf. Offering "+/- 5" instead would make them do arithmetic
 * against a number they no longer trust.
 *
 * Commits on blur or Enter rather than on every keystroke — typing "12" should
 * not write 1 and then 12, which would briefly expose one unit to shoppers.
 */
export function StockEditor({
  variantId,
  available,
}: {
  variantId: string;
  available: number;
}) {
  const [value, setValue] = useState(String(available));
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const commit = () => {
    const next = Number.parseInt(value, 10);

    if (!Number.isFinite(next) || next < 0) {
      setValue(String(available));
      toast.error('Enter a whole number, zero or more.');
      return;
    }
    if (next === available) return;

    startTransition(async () => {
      const result = await updateStock({ variantId, available: next });
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1600);
      } else {
        setValue(String(available));
        toast.error(result.error ?? 'Could not update that count.');
      }
    });
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        disabled={pending}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') setValue(String(available));
        }}
        aria-label="Units available"
        className="border-line-strong bg-raised text-ink tabular focus:border-ink h-7 w-16 rounded-sm border px-1.5 text-right text-xs transition-colors disabled:opacity-50"
      />
      {saved ? (
        <Check className="text-success-600 size-3.5" aria-label="Saved" />
      ) : (
        <span className="size-3.5" aria-hidden />
      )}
    </span>
  );
}
