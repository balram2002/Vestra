import { PRICING } from '@/config/business';
import type { TaxLine } from '@/domain/types';
import { taxFromInclusive } from '@/lib/money';

/**
 * Indian GST for apparel is slab-based on the PER-UNIT selling price, not on the
 * line or order total: a 999-rupee kurta is taxed at 5%, a 1,001-rupee one at
 * 12%. Getting this wrong understates or overstates tax on almost every order,
 * so the rule lives in exactly one function.
 */
export function resolveGstRate(categoryTaxRatePercent: number, unitSellingPrice: number): number {
  // Categories outside apparel (beauty, electronics, home) carry a fixed slab.
  if (categoryTaxRatePercent !== PRICING.apparelHighSlabPercent) return categoryTaxRatePercent;
  return unitSellingPrice < PRICING.apparelLowSlabThreshold
    ? PRICING.apparelLowSlabPercent
    : PRICING.apparelHighSlabPercent;
}

/**
 * Split a tax amount into CGST/SGST or IGST.
 * Intra-state supply is halved into central and state components; inter-state
 * supply is a single integrated levy. The split is what appears on the invoice.
 */
export function splitGst(taxAmount: number, isInterState: boolean): Pick<TaxLine, 'cgst' | 'sgst' | 'igst'> {
  if (isInterState) return { cgst: 0, sgst: 0, igst: taxAmount };
  const half = Math.floor(taxAmount / 2);
  // Any odd paise goes to CGST so the two halves still sum to the whole.
  return { cgst: taxAmount - half, sgst: half, igst: 0 };
}

/**
 * Compute the tax component of a tax-inclusive taxable value.
 * Vestra quotes GST-inclusive prices (Indian retail convention), so tax is
 * extracted from the amount charged rather than added to it.
 */
export function taxForLine(
  taxableValueInclusive: number,
  ratePercent: number,
  isInterState: boolean,
): TaxLine {
  const total = taxFromInclusive(taxableValueInclusive, ratePercent);
  return {
    ratePercent,
    taxableValue: taxableValueInclusive - total,
    ...splitGst(total, isInterState),
    total,
  };
}

/** Roll per-line tax up into the slab-wise summary an invoice must show. */
export function aggregateTaxLines(lines: readonly TaxLine[]): TaxLine[] {
  const bySlab = new Map<number, TaxLine>();
  for (const line of lines) {
    if (line.total === 0 && line.taxableValue === 0) continue;
    const existing = bySlab.get(line.ratePercent);
    if (existing) {
      existing.taxableValue += line.taxableValue;
      existing.cgst += line.cgst;
      existing.sgst += line.sgst;
      existing.igst += line.igst;
      existing.total += line.total;
    } else {
      bySlab.set(line.ratePercent, { ...line });
    }
  }
  return [...bySlab.values()].sort((a, b) => a.ratePercent - b.ratePercent);
}

/** Whether the supply crosses a state border, which decides the GST split. */
export function isInterStateSupply(sellerState: string, deliveryState: string): boolean {
  return sellerState.trim().toLowerCase() !== deliveryState.trim().toLowerCase();
}
