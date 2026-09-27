'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { formatMoney } from '@/lib/format';
import { addToBag } from '@/server/actions/cart';
import type { ProductDemoData } from '@/server/services/product-demo';

export type DemoProduct = ProductDemoData['products'][number];

/**
 * Choose a colour and size, then add -- the one buying step every demo layout
 * shares, so adding from a demo works the same whichever layout is live.
 */
export function DemoChooser({ product, onClose }: { product: DemoProduct | null; onClose: () => void }) {
  return (
    <Dialog
      open={Boolean(product)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {/* Keyed on the product so each opening starts with nothing chosen. */}
      {product ? <ChooserBody key={product.id} product={product} onClose={onClose} /> : null}
    </Dialog>
  );
}

function ChooserBody({ product, onClose }: { product: DemoProduct; onClose: () => void }) {
  const [variantId, setVariantId] = useState('');
  const [pending, start] = useTransition();

  return (
    <DialogContent
      title={product.title}
      description="Choose a size and colour before adding to your bag."
      footer={
        <Button
          className="w-full"
          disabled={!variantId || pending}
          onClick={() =>
            start(async () => {
              const result = await addToBag({ productId: product.id, variantId, quantity: 1 });
              if (result.ok) {
                toast.success('Added to your bag');
                onClose();
              } else toast.error(result.error ?? 'Unable to add this item');
            })
          }
        >
          {pending ? 'Adding…' : 'Add to bag'}
        </Button>
      }
    >
      <div className="grid gap-2">
        {product.variants.map((variant) => (
          <label
            key={variant.id}
            className={`border-line flex min-h-12 items-center gap-3 rounded-xl border p-3 text-sm ${variant.available < 1 ? 'opacity-50' : ''}`}
          >
            <input
              type="radio"
              name="demo-variant"
              value={variant.id}
              disabled={variant.available < 1}
              checked={variantId === variant.id}
              onChange={() => setVariantId(variant.id)}
            />
            <span className="flex-1">
              {variant.color} · {variant.size}
              {variant.available < 1 ? ' · Sold out' : ''}
            </span>
            <span>{formatMoney(variant.sellingPrice)}</span>
          </label>
        ))}
      </div>
      <Link href={`/product/${product.slug}`} className="text-accent-ink mt-4 inline-flex min-h-11 items-center text-sm underline">
        Full product details & size guide
      </Link>
    </DialogContent>
  );
}
