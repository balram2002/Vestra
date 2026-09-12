import 'server-only';

import { SELLER_STATUS_META, USER_ROLE_LABEL } from '@/domain/enums';
import type { SessionUser } from '@/domain/types';

import { isSellerRole, isStaffRole } from '../auth/rbac';
import { collections } from '../db/collections';

/**
 * Where a signed-in person can work, besides shopping.
 *
 * One account can shop, run a store and staff the platform at once, and the
 * storefront used to show none of that: an admin who wandered into the shop had
 * no way back to the console but typing the address. This is the one place
 * that works it out, so the header menu, the phone menu and the account page
 * all agree.
 */

export interface Workspace {
  href: string;
  label: string;
  description: string;
  kind: 'admin' | 'seller';
}

export interface Workspaces {
  /** Role names worth showing on a chip: every role but plain shopper. */
  chips: string[];
  workspaces: Workspace[];
}

export async function workspacesFor(user: Pick<SessionUser, 'roles' | 'sellerId'>): Promise<Workspaces> {
  const chips = user.roles.filter((role) => role !== 'CUSTOMER').map((role) => USER_ROLE_LABEL[role]);
  const workspaces: Workspace[] = [];

  if (user.roles.some(isStaffRole)) {
    workspaces.push({
      href: '/admin',
      label: 'Admin console',
      description: 'Orders, sellers, catalogue and settings',
      kind: 'admin',
    });
  }

  if (user.roles.some(isSellerRole) && user.sellerId) {
    const sellers = await collections.sellers();
    const store = await sellers.findOne(
      { _id: user.sellerId },
      { projection: { status: 1, displayName: 1 } },
    );
    const open = store?.status === 'ACTIVE' || store?.status === 'APPROVED';
    const paused = store?.status === 'SUSPENDED' || store?.status === 'ON_HOLD';

    // A store still in review has no console yet; its application does. One that
    // was trading and is now paused is not an application either -- it is their
    // store, and that page carries the reason and what to do about it.
    workspaces.push(
      open
        ? { href: '/seller', label: 'Seller console', description: store?.displayName ?? 'Your store', kind: 'seller' }
        : {
            href: '/seller/onboarding',
            label: paused ? 'Your store' : 'Your seller application',
            description: store ? SELLER_STATUS_META[store.status].label : 'In progress',
            kind: 'seller',
          },
    );
  }

  return { chips, workspaces };
}
