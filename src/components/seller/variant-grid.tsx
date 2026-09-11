'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { COLORS, SIZE_SCALES, type SizeSystem } from '@/domain/attributes';
import type { ProductVariant } from '@/domain/types';
import { formatMoney } from '@/lib/format';
import { toPaise, toRupees } from '@/lib/money';
import { saveVariants } from '@/server/actions/authoring';

/**
 * The size and colour matrix.
 *
 * This is where a fashion listing actually lives: one row per sellable
 * combination, each with its own price, stock and SKU. Two decisions matter.
 *
 * The GENERATOR exists because typing 24 rows by hand for six sizes in four
 * colours is how sellers give up and list one row called "Free size". Pick the
 * sizes and colours, and the grid fills itself with the price already on the
 * page.
 *
 * PRICES ARE ENTERED IN RUPEES and converted at this boundary. The rest of the
 * system holds integer paise; asking a seller to type paise would be absurd,
 * and letting rupee floats past this point would be a bug.
 */

interface Row {
  id?: string;
  size: string;
  color: string;
  mrpRupees: number;
  priceRupees: number;
  available: number;
  sellerSku: string;
  isActive: boolean;
}

function toRow(variant: ProductVariant): Row {
  return {
    id: variant.id,
    size: variant.size,
    color: variant.color,
    mrpRupees: toRupees(variant.mrp),
    priceRupees: toRupees(variant.sellingPrice),
    available: variant.inventory.available,
    sellerSku: variant.sellerSku,
    isActive: variant.isActive,
  };
}

export function VariantGrid({
  productId,
  variants,
  sizeSystem,
}: {
  productId: string;
  variants: ProductVariant[];
  sizeSystem: SizeSystem;
}) {
  const [rows, setRows] = useState<Row[]>(variants.map(toRow));
  const [pending, startTransition] = useTransition();
  const [showGenerator, setShowGenerator] = useState(variants.length === 0);

  const scale = SIZE_SCALES[sizeSystem] ?? SIZE_SCALES.ALPHA;

  const update = (index: number, patch: Partial<Row>) => {
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const save = () => {
    if (rows.length === 0) {
      toast.error('Add at least one size');
      return;
    }

    for (const row of rows) {
      if (row.priceRupees > row.mrpRupees) {
        toast.error(`${row.size} sells above its MRP. That is not a discount.`);
        return;
      }
    }

    startTransition(async () => {
      const result = await saveVariants({
        productId,
        variants: rows.map((row) => ({
          id: row.id,
          size: row.size,
          color: row.color,
          mrp: toPaise(row.mrpRupees),
          sellingPrice: toPaise(row.priceRupees),
          available: row.available,
          sellerSku: row.sellerSku || undefined,
          isActive: row.isActive,
        })),
      });

      if (result.ok) toast.success('Sizes saved');
      else toast.error(result.error ?? 'That did not save.');
    });
  };

  return (
    <Card as="section">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-ink text-md font-semibold">Sizes and stock</h2>
          <p className="text-muted mt-0.5 text-sm">
            One row per size and colour a shopper can buy.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowGenerator((open) => !open)}
          className="border-line-strong text-ink hover:border-ink inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs transition-colors"
        >
          <Plus className="size-3.5" aria-hidden />
          Build a grid
        </button>
      </header>

      {showGenerator ? (
        <Generator
          scaleSizes={scale.sizes}
          defaults={rows[0]}
          onGenerate={(generated) => {
            // Existing rows win: regenerating must never wipe stock a seller
            // has already counted.
            const existing = new Map(rows.map((row) => [`${row.size}::${row.color}`, row]));
            setRows(generated.map((row) => existing.get(`${row.size}::${row.color}`) ?? row));
            setShowGenerator(false);
          }}
        />
      ) : null}

      {rows.length === 0 ? (
        <p className="text-muted py-6 text-center text-sm">
          No sizes yet. Build a grid to get started.
        </p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-line text-faint border-b text-left text-2xs uppercase tracking-[0.1em]">
                <th className="py-2 pr-3 font-medium">Size</th>
                <th className="py-2 pr-3 font-medium">Colour</th>
                <th className="py-2 pr-3 text-right font-medium">MRP</th>
                <th className="py-2 pr-3 text-right font-medium">Selling price</th>
                <th className="py-2 pr-3 text-right font-medium">Stock</th>
                <th className="py-2 pr-3 font-medium">Your SKU</th>
                <th className="py-2 pr-3 text-center font-medium">Live</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const discount =
                  row.mrpRupees > 0 && row.priceRupees < row.mrpRupees
                    ? Math.floor(((row.mrpRupees - row.priceRupees) / row.mrpRupees) * 100)
                    : 0;

                return (
                  <tr key={`${row.size}-${row.color}-${index}`} className="border-line border-b">
                    <td className="py-2 pr-3">
                      <input
                        value={row.size}
                        onChange={(event) => update(index, { size: event.target.value })}
                        className="border-line-strong bg-canvas text-ink h-8 w-20 rounded-sm border px-2 text-sm"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={row.color}
                        onChange={(event) => update(index, { color: event.target.value })}
                        className="border-line-strong bg-canvas text-ink h-8 w-36 rounded-sm border px-1.5 text-sm"
                      >
                        {COLORS.map((color) => (
                          <option key={color.value} value={color.value}>
                            {color.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <input
                        type="number"
                        min={0}
                        value={row.mrpRupees}
                        onChange={(event) => update(index, { mrpRupees: Number(event.target.value) })}
                        className="border-line-strong bg-canvas text-ink tabular h-8 w-24 rounded-sm border px-2 text-right text-sm"
                      />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <input
                        type="number"
                        min={0}
                        value={row.priceRupees}
                        onChange={(event) =>
                          update(index, { priceRupees: Number(event.target.value) })
                        }
                        aria-invalid={row.priceRupees > row.mrpRupees}
                        className={
                          row.priceRupees > row.mrpRupees
                            ? 'border-danger-300 bg-danger-50 text-danger-700 tabular h-8 w-24 rounded-sm border px-2 text-right text-sm'
                            : 'border-line-strong bg-canvas text-ink tabular h-8 w-24 rounded-sm border px-2 text-right text-sm'
                        }
                      />
                      {discount > 0 ? (
                        <span className="text-success-600 mt-0.5 block text-2xs">{discount}% off</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <input
                        type="number"
                        min={0}
                        value={row.available}
                        onChange={(event) => update(index, { available: Number(event.target.value) })}
                        className="border-line-strong bg-canvas text-ink tabular h-8 w-20 rounded-sm border px-2 text-right text-sm"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        value={row.sellerSku}
                        onChange={(event) => update(index, { sellerSku: event.target.value })}
                        placeholder="Optional"
                        className="border-line-strong bg-canvas text-ink placeholder:text-faint h-8 w-28 rounded-sm border px-2 font-mono text-xs"
                      />
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <input
                        type="checkbox"
                        checked={row.isActive}
                        onChange={(event) => update(index, { isActive: event.target.checked })}
                        aria-label={`${row.size} is live`}
                        className="accent-ink size-4"
                      />
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => setRows(rows.filter((_, i) => i !== index))}
                        aria-label={`Remove ${row.size}`}
                        className="text-faint hover:text-danger-600 transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-line mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-faint text-2xs">
          {rows.filter((row) => row.isActive).length} live ·{' '}
          {rows.reduce((sum, row) => sum + row.available, 0)} units ·{' '}
          {rows.length > 0
            ? `from ${formatMoney(toPaise(Math.min(...rows.map((row) => row.priceRupees))))}`
            : '—'}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={pending || rows.length === 0}
          className="bg-ink text-canvas disabled:bg-line-strong rounded-md px-3.5 py-2 text-xs font-medium disabled:cursor-not-allowed"
        >
          {pending ? 'Saving…' : 'Save sizes'}
        </button>
      </div>
    </Card>
  );
}

/** Pick sizes and colours; get the cross product. */
function Generator({
  scaleSizes,
  defaults,
  onGenerate,
}: {
  scaleSizes: string[];
  defaults: Row | undefined;
  onGenerate: (rows: Row[]) => void;
}) {
  const [sizes, setSizes] = useState<string[]>([]);
  const [colours, setColours] = useState<string[]>([]);
  const [mrp, setMrp] = useState(defaults?.mrpRupees ?? 0);
  const [price, setPrice] = useState(defaults?.priceRupees ?? 0);
  const [stock, setStock] = useState(defaults?.available ?? 0);

  const build = () => {
    const rows: Row[] = [];
    for (const color of colours.length > 0 ? colours : ['black']) {
      for (const size of sizes) {
        rows.push({
          size,
          color,
          mrpRupees: mrp,
          priceRupees: price,
          available: stock,
          sellerSku: '',
          isActive: true,
        });
      }
    }
    onGenerate(rows);
  };

  return (
    <div className="border-accent-border bg-accent-soft mb-4 rounded-md border p-4">
      <p className="text-ink text-xs font-medium" id="grid-sizes-label">
        Sizes
      </p>
      {/*
        A named group, not a bare row of buttons. Without it a screen reader
        announces "XS, toggle button" with no indication of what is being
        toggled — and the same name is what makes the group addressable in
        tests.
      */}
      <div
        role="group"
        aria-labelledby="grid-sizes-label"
        className="mt-1.5 flex flex-wrap gap-1.5"
      >
        {scaleSizes.map((size) => {
          const selected = sizes.includes(size);
          return (
            <button
              key={size}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                setSizes(selected ? sizes.filter((value) => value !== size) : [...sizes, size])
              }
              className={
                selected
                  ? 'bg-ink text-canvas min-w-10 rounded-sm px-2 py-1 text-xs font-medium'
                  : 'border-line-strong bg-raised text-muted hover:border-ink min-w-10 rounded-sm border px-2 py-1 text-xs transition-colors'
              }
            >
              {size}
            </button>
          );
        })}
      </div>

      <p className="text-ink mt-3 text-xs font-medium" id="grid-colours-label">
        Colours
      </p>
      <div
        role="group"
        aria-labelledby="grid-colours-label"
        className="mt-1.5 flex flex-wrap gap-1.5"
      >
        {COLORS.slice(0, 18).map((color) => {
          const selected = colours.includes(color.value);
          return (
            <button
              key={color.value}
              type="button"
              aria-pressed={selected}
              title={color.label}
              onClick={() =>
                setColours(
                  selected ? colours.filter((value) => value !== color.value) : [...colours, color.value],
                )
              }
              className={
                selected
                  ? 'border-ink size-7 rounded-full border-2'
                  : 'border-line-strong size-7 rounded-full border'
              }
              style={{ backgroundColor: color.hex }}
            >
              <span className="sr-only">{color.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-faint block text-2xs">MRP</span>
          <input
            type="number"
            min={0}
            value={mrp}
            onChange={(event) => setMrp(Number(event.target.value))}
            className="border-line-strong bg-raised text-ink tabular mt-1 h-8 w-24 rounded-sm border px-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-faint block text-2xs">Selling price</span>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(event) => setPrice(Number(event.target.value))}
            className="border-line-strong bg-raised text-ink tabular mt-1 h-8 w-24 rounded-sm border px-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-faint block text-2xs">Stock each</span>
          <input
            type="number"
            min={0}
            value={stock}
            onChange={(event) => setStock(Number(event.target.value))}
            className="border-line-strong bg-raised text-ink tabular mt-1 h-8 w-20 rounded-sm border px-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={build}
          disabled={sizes.length === 0}
          className="bg-ink text-canvas disabled:bg-line-strong h-8 rounded-sm px-3 text-xs font-medium disabled:cursor-not-allowed"
        >
          Build {sizes.length * Math.max(1, colours.length)} rows
        </button>
      </div>
    </div>
  );
}
