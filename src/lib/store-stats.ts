import type { Seller } from '@/domain/types';
import type { StorePageSettings } from '@/domain/page-designs/store';

import { formatCompactNumber } from './format';

/**
 * The three numbers every store layout leads with.
 *
 * Each one prefers the figure the team set on the seller's scorecard and falls
 * back to the operational record, and the LABEL follows the figure: "Products
 * sold" is only true when that is the number being shown. Derived once, here,
 * so the three layouts cannot drift into three different claims.
 */
export interface StoreStat {
  key: 'trustScore' | 'deliveryTime' | 'ordersShipped';
  label: string;
  value: string;
}

export function storeStats(seller: Seller, settings: StorePageSettings): StoreStat[] {
  const stats = seller.storefrontStats;
  if (stats?.showStats === false) return [];

  const all: StoreStat[] = [
    {
      key: 'trustScore',
      label: 'Trust score',
      value: stats?.trustScore ?? `${seller.rating.fulfilmentScore}/100`,
    },
    {
      key: 'deliveryTime',
      label: stats?.averageShipTime ? 'Avg. ship time' : 'Dispatch target',
      value: stats?.averageShipTime ?? `${seller.policies.dispatchSlaHours}h`,
    },
    {
      key: 'ordersShipped',
      label: stats?.productsSold ? 'Products sold' : 'Orders shipped',
      value: stats?.productsSold ?? formatCompactNumber(seller.metrics.orderCount),
    },
  ];

  return all.filter((stat) => settings[stat.key]);
}

/**
 * A WhatsApp chat link for the store's support phone, or null when there is
 * no usable number. Ten-digit numbers are Indian mobiles and get the country
 * code wa.me requires.
 */
export function whatsappLink(phone: string | null | undefined, storeName: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const number = digits.length === 10 ? `91${digits}` : digits;
  const text = encodeURIComponent(`Hi ${storeName}, I found your store on VestraWAB.`);
  return `https://wa.me/${number}?text=${text}`;
}
