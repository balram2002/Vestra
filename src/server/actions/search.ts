'use server';

import { searchEverything, type SearchResults } from '../services/search';

/**
 * Type-ahead, for the header overlay.
 *
 * PUBLIC on purpose: it returns exactly what an anonymous shopper can already
 * see by browsing -- live products, active brands and categories, trading
 * stores -- so requiring a session would only stop people searching before
 * they sign in, which is most of them.
 *
 * The work itself is cached in the service, so a popular query costs one
 * database round trip however many people type it.
 */
export async function suggest(input: { query: string }): Promise<SearchResults> {
  return searchEverything(input.query ?? '');
}
