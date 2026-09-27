import type { Metadata } from 'next';

import { absoluteUrl } from '@/config/site';
import type { StoresPageSettings, StoresPageVariant } from '@/domain/page-designs/stores';
import { getLiveDesign } from '@/server/services/page-designs';

import { StoresFrame } from './stores-frame';

export const metadata: Metadata = {
  title: 'Sellers on VestraWAB',
  description:
    'The independent labels, workshops and family businesses selling on VestraWAB, each reviewed by our team before it can sell.',
  alternates: { canonical: absoluteUrl('/stores') },
};

/**
 * Seller directory.
 *
 * Exists for two reasons: shoppers who liked something want to find the maker
 * again, and every store page needs an internal link from somewhere crawlable.
 *
 * Stores with something to buy come first. A newly approved store still shows,
 * marked as opening soon, rather than with a row of zeros that reads as a store
 * nobody buys from.
 *
 * Which layout, and which of its parts, is decided under
 * Admin › Page designs › Sellers directory.
 */
export default async function StoresPage() {
  const design = await getLiveDesign('stores');
  const variant = design.variant as StoresPageVariant;
  return <StoresFrame variant={variant} settings={design.settings[variant] as StoresPageSettings} />;
}
