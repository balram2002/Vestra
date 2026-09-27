'use server';

import { z } from 'zod';

import { getQuickView, type QuickViewData } from '../services/quick-view';

/**
 * Loads a listing's quick view on demand. A listing ships forty cards; sending
 * every card's options up front would be forty products' worth of variants
 * for the one or two a shopper actually opens.
 */
export async function loadQuickView(slug: string): Promise<QuickViewData | null> {
  const parsed = z.string().min(1).max(200).safeParse(slug);
  if (!parsed.success) return null;
  return getQuickView(parsed.data);
}
