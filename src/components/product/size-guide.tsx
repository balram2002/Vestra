'use client';

import { Ruler } from 'lucide-react';
import { useState } from 'react';

import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/cn';

/**
 * Size guide.
 *
 * Replaces the toast stub that stood here, which told the shopper the feature
 * was coming rather than answering the question they asked.
 *
 * ---------------------------------------------------------------------------
 * WHAT A SIZE GUIDE IS ACTUALLY FOR
 * ---------------------------------------------------------------------------
 * Not "what does M mean". It is for a person holding a tape measure who has
 * already been burned by a return, and it has to answer three things in order:
 *
 *   1. what the garment measures, so they can compare against something they
 *      already own that fits;
 *   2. how to take the measurement, because "chest" is ambiguous and half of
 *      all returns are a measurement taken in the wrong place;
 *   3. what the number converts to, because this catalogue carries UK, US and
 *      EU sizing side by side.
 *
 * The chart is therefore keyed to the KIND of thing being sold, inferred from
 * the size options the product actually offers. A footwear chart on a kurta is
 * worse than no chart: it is confidently wrong, and it costs a return.
 *
 * ---------------------------------------------------------------------------
 * UNITS
 * ---------------------------------------------------------------------------
 * Centimetres lead because that is what an Indian tape measure shows, and
 * inches are one tap away rather than a second table. A guide that shows both
 * at once doubles the width of every column and is unreadable on the phone
 * where it is mostly opened.
 *
 * The conversion is done here rather than being stored twice, so the two units
 * cannot drift — and it rounds to the half, because nobody measures themselves
 * to a tenth of an inch.
 */

type Chart = {
  /** Column headings after the leading size column. */
  columns: string[];
  /** `[size, ...measurements in cm]`. */
  rows: Array<[string, ...number[]]>;
  /** How to take each measurement, in the same order as `columns`. */
  howTo: Array<{ label: string; detail: string }>;
};

/**
 * Alphabetical apparel — tops, dresses, kurtas, outerwear.
 *
 * These are BODY measurements, not garment measurements, which is the
 * convention for ready-to-wear in this market: the maker has already added ease
 * for the fit they intended, so a shopper comparing their own chest to this
 * column gets the right answer without knowing what "ease" is.
 */
const ALPHA: Chart = {
  columns: ['Chest', 'Waist', 'Hip'],
  rows: [
    ['XS', 81, 66, 89],
    ['S', 86, 71, 94],
    ['M', 91, 76, 99],
    ['L', 97, 81, 104],
    ['XL', 102, 86, 109],
    ['XXL', 107, 91, 114],
    ['3XL', 112, 97, 119],
  ],
  howTo: [
    {
      label: 'Chest',
      detail: 'Around the fullest part, under the arms, with the tape level and not pulled tight.',
    },
    { label: 'Waist', detail: 'Around the narrowest part, usually just above the navel.' },
    { label: 'Hip', detail: 'Around the fullest part, roughly 20cm below the waist.' },
  ],
};

/** Numeric bottoms — jeans, trousers, skirts. The number is the waist in inches. */
const NUMERIC: Chart = {
  columns: ['Waist', 'Hip', 'Inseam'],
  rows: [
    ['26', 66, 89, 74],
    ['28', 71, 94, 75],
    ['30', 76, 99, 76],
    ['32', 81, 104, 78],
    ['34', 86, 109, 79],
    ['36', 91, 114, 80],
    ['38', 97, 119, 81],
    ['40', 102, 124, 81],
  ],
  howTo: [
    { label: 'Waist', detail: 'Around where the waistband sits, not around the navel.' },
    { label: 'Hip', detail: 'Around the fullest part, standing with the feet together.' },
    {
      label: 'Inseam',
      detail: 'From the crotch seam to the hem of a pair that already fits, laid flat.',
    },
  ],
};

/**
 * Footwear.
 *
 * Foot length is the only honest column here. UK and EU numbers vary by maker
 * by up to a full size, so they are shown as the conversion they are — the
 * measurement is the thing to trust.
 */
const FOOTWEAR: Chart = {
  columns: ['Foot length', 'EU', 'US'],
  rows: [
    ['5', 23.5, 38, 6],
    ['6', 24.5, 39, 7],
    ['7', 25.5, 41, 8],
    ['8', 26.5, 42, 9],
    ['9', 27.5, 43, 10],
    ['10', 28.5, 44, 11],
    ['11', 29.5, 45, 12],
  ],
  howTo: [
    {
      label: 'Foot length',
      detail:
        'Stand on paper against a wall, mark the longest toe, and measure heel to mark. Do it in the evening — feet swell through the day.',
    },
    { label: 'EU / US', detail: 'A conversion, not a measurement. Trust the length column.' },
  ],
};

/**
 * Which chart this product wants.
 *
 * Inferred from the sizes on offer rather than passed in, because the taxonomy
 * does not carry a "size system" field and inventing one on the product record
 * for a presentational choice is the wrong place to put it.
 *
 * The order matters: alphabetical is checked first because it is unambiguous,
 * then footwear (a short run of small numbers), then numeric bottoms. A product
 * whose sizes match nothing gets no guide at all rather than a wrong one.
 */
function chartFor(sizes: string[]): { chart: Chart; unitLabel: string } | null {
  const upper = sizes.map((s) => s.trim().toUpperCase());

  if (upper.some((s) => ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'].includes(s))) {
    return { chart: ALPHA, unitLabel: 'Body measurements' };
  }

  const numbers = upper.map(Number).filter((n) => Number.isFinite(n));
  if (numbers.length === 0) return null;

  // Shoe sizes in this catalogue run 5-12; waist sizes run 26-44. The two
  // ranges do not overlap, which is what makes this inference safe.
  if (Math.max(...numbers) <= 13) return { chart: FOOTWEAR, unitLabel: 'Foot length' };
  if (Math.min(...numbers) >= 24) return { chart: NUMERIC, unitLabel: 'Body measurements' };

  return null;
}

/** Centimetres to inches, rounded to the nearest half. */
function toInches(cm: number): number {
  return Math.round((cm / 2.54) * 2) / 2;
}

export function SizeGuide({ sizes, className }: { sizes: string[]; className?: string }) {
  const [unit, setUnit] = useState<'cm' | 'in'>('cm');
  const resolved = chartFor(sizes);

  // No chart beats a wrong chart. The trigger disappears entirely rather than
  // opening a drawer that cannot answer anything.
  if (!resolved) return null;

  const { chart, unitLabel } = resolved;

  /*
   * Footwear's EU and US columns are SIZE CODES, not lengths, so they must not
   * be converted when the unit toggles. Only the first column is a measurement.
   */
  const convertible = (columnIndex: number) => chart !== FOOTWEAR || columnIndex === 0;

  return (
    <Drawer>
      <DrawerTrigger
        className={cn(
          'text-ink inline-flex items-center gap-1.5 text-xs font-medium',
          'border-b border-current pb-px transition-opacity hover:opacity-70',
          className,
        )}
      >
        <Ruler className="size-3.5" aria-hidden />
        Size guide
      </DrawerTrigger>

      <DrawerContent
        title="Size guide"
        description={unitLabel}
        /*
         * Bottom on a phone would be the usual choice, but this is a TABLE —
         * seven rows and four columns need height, and a bottom sheet capped at
         * 82dvh gives a table less room than a side panel does. The side panel
         * is also where the shopper's thumb already is, since the trigger sits
         * on the right of the size row.
         */
        side="right"
        className="sm:w-[min(30rem,92vw)]"
      >
        <div className="space-y-6">
          <Segmented
            label="Measurement unit"
            size="sm"
            value={unit}
            onChange={setUnit}
            options={[
              { value: 'cm', label: 'Centimetres' },
              { value: 'in', label: 'Inches' },
            ]}
          />

          {/*
            The table scrolls in its own box.

            A four-column table at 320px is wider than the viewport, and letting
            it push the drawer is how a panel ends up with a horizontal
            scrollbar under everything else in it.
          */}
          <div className="border-line overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Size chart in {unit === 'cm' ? 'centimetres' : 'inches'}
              </caption>
              <thead>
                <tr className="bg-sunken">
                  <th scope="col" className="text-faint px-3 py-2.5 text-left text-2xs font-semibold uppercase tracking-[0.1em]">
                    Size
                  </th>
                  {chart.columns.map((column, index) => (
                    <th
                      key={column}
                      scope="col"
                      className="text-faint whitespace-nowrap px-3 py-2.5 text-right text-2xs font-semibold uppercase tracking-[0.1em]"
                    >
                      {column}
                      {convertible(index) ? (
                        <span className="ml-1 font-normal normal-case tracking-normal opacity-70">
                          {unit}
                        </span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chart.rows.map(([size, ...measurements]) => {
                  /*
                   * Highlight the rows this product actually sells.
                   *
                   * A chart listing XS through 3XL for a style stocked only in
                   * M and L is a chart that invites a shopper to pick a size
                   * that does not exist. Dimming the rest answers the question
                   * and shows the range in one table.
                   */
                  const stocked = sizes.some((s) => s.trim().toUpperCase() === size);

                  return (
                    <tr
                      key={size}
                      className={cn(
                        'border-line border-t',
                        stocked ? 'text-ink' : 'text-faint',
                      )}
                    >
                      <th
                        scope="row"
                        className={cn(
                          'px-3 py-2.5 text-left text-sm',
                          stocked ? 'font-semibold' : 'font-normal',
                        )}
                      >
                        {size}
                        {!stocked ? <span className="sr-only"> — not stocked</span> : null}
                      </th>
                      {measurements.map((value, index) => (
                        <td key={index} className="tabular px-3 py-2.5 text-right">
                          {convertible(index) && unit === 'in' ? toInches(value) : value}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-ink text-sm font-semibold">How to measure</h3>
            <dl className="mt-3 space-y-3">
              {chart.howTo.map((item) => (
                <div key={item.label}>
                  <dt className="text-ink text-xs font-medium">{item.label}</dt>
                  <dd className="text-muted mt-0.5 text-xs leading-relaxed">{item.detail}</dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="text-faint border-line border-t pt-4 text-2xs leading-relaxed">
            Measurements are a guide. Cut and fabric change how a piece sits, so a garment may
            measure the same and fit differently. Anything that does not fit can be returned or
            exchanged free within 14 days.
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
