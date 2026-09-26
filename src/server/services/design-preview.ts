import 'server-only';

import type { PreviewEntity } from '@/domain/page-designs/types';

import { requirePermission } from '../auth/session';
import { listSellers } from './catalog';

/**
 * The real records a designer can preview its page with.
 *
 * Real ones, deliberately: a layout that only ever looks right on a store
 * with a perfect banner and a three-word name has not been tested. The list
 * leads with records that exercise the layout -- stores that are trading --
 * and is short, because it is a picker, not a search.
 */
export async function previewEntities(
  entity: PreviewEntity,
): Promise<{ label: string; options: Array<{ value: string; label: string }> }> {
  await requirePermission('cms:write');

  switch (entity) {
    case 'seller': {
      const sellers = await listSellers(40);
      return {
        label: 'Preview with store',
        options: sellers
          .filter((seller) => ['ACTIVE', 'APPROVED'].includes(seller.status))
          .map((seller) => ({ value: seller.slug, label: seller.displayName })),
      };
    }
    default:
      return { label: 'Preview with', options: [] };
  }
}
