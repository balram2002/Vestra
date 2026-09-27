/**
 * The sellers directory's arithmetic: which store comes first, and how stores
 * group into local markets. Pure, so each layout orders stores the same way
 * and the rules are tested rather than re-derived in JSX.
 */

export interface DirectoryStore {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  about: string;
  logo: string;
  banner: string;
  city: string;
  verified: boolean;
  ratingAverage: number;
  ratingCount: number;
  orders: number;
  liveProducts: number;
  /** 0-100, the operational fulfilment score: what "trust" orders by. */
  trustValue: number;
  /** The three numbers every store layout leads with, already worded. */
  stats: Array<{ key: string; label: string; value: string }>;
  approvedAt: string | null;
  /** Approved within the last 30 days. */
  isNew: boolean;
}

export type DirectoryOrder = 'rating' | 'trust' | 'orders' | 'newest';

const ORDERS: readonly DirectoryOrder[] = ['rating', 'trust', 'orders', 'newest'];

/**
 * Stores with something to buy always come first -- an empty store at the top
 * reads as a directory of nobody -- then the chosen order, then the name, so
 * ties never shuffle between renders.
 */
export function orderStores(stores: DirectoryStore[], order: string, includeOpeningSoon = true): DirectoryStore[] {
  const key: DirectoryOrder = ORDERS.includes(order as DirectoryOrder) ? (order as DirectoryOrder) : 'rating';
  const score = (store: DirectoryStore): number => {
    switch (key) {
      case 'trust':
        return store.trustValue;
      case 'orders':
        return store.orders;
      case 'newest':
        return store.approvedAt ? Date.parse(store.approvedAt) : 0;
      default:
        // A 5.0 from two reviews should not outrank a 4.8 from two hundred.
        return store.ratingCount > 0 ? store.ratingAverage * Math.min(1, store.ratingCount / 10) : 0;
    }
  };
  return stores
    .filter((store) => includeOpeningSoon || store.liveProducts > 0)
    .toSorted(
      (a, b) =>
        Number(b.liveProducts > 0) - Number(a.liveProducts > 0) || score(b) - score(a) || a.name.localeCompare(b.name),
    );
}

export interface CityGroup {
  city: string;
  /** A fragment id: stable, ASCII, and unique per city. */
  anchor: string;
  stores: DirectoryStore[];
}

export const MORE_CITIES = 'More cities';

/**
 * Local markets: stores by city, the biggest markets first, keeping each
 * group in the order it was given.
 *
 * A city with fewer than `minimum` stores is not a market yet -- a page of
 * one-card sections reads as a list with headings in the way -- so those
 * stores, and any with no city on record, share one "More cities" group at
 * the end, where each card names its own city.
 */
export function groupByCity(stores: DirectoryStore[], minimum = 2): CityGroup[] {
  const byCity = new Map<string, DirectoryStore[]>();
  for (const store of stores) {
    const city = store.city.trim();
    byCity.set(city, [...(byCity.get(city) ?? []), store]);
  }
  const groups = new Map<string, DirectoryStore[]>();
  for (const [city, members] of byCity) {
    const key = city && members.length >= minimum ? city : MORE_CITIES;
    groups.set(key, [...(groups.get(key) ?? []), ...members]);
  }
  return [...groups.entries()]
    .map(([city, members]) => ({ city, anchor: `city-${slugifyCity(city)}`, stores: members }))
    .toSorted(
      (a, b) =>
        Number(a.city === MORE_CITIES) - Number(b.city === MORE_CITIES) ||
        b.stores.length - a.stores.length ||
        a.city.localeCompare(b.city),
    );
}

function slugifyCity(city: string): string {
  const slug = city
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'other';
}

/**
 * The story row: stores live for video calls now first, then the newest, then
 * the rest in the page's order -- each store once, and only stores with
 * something to buy, because a story that opens on an empty shop is a let-down.
 */
export function storyOrder(stores: DirectoryStore[], liveIds: ReadonlySet<string>): DirectoryStore[] {
  const trading = stores.filter((store) => store.liveProducts > 0);
  const live = trading.filter((store) => liveIds.has(store.id));
  const fresh = trading.filter((store) => !liveIds.has(store.id) && store.isNew);
  const rest = trading.filter((store) => !liveIds.has(store.id) && !store.isNew);
  return [...live, ...fresh, ...rest];
}
