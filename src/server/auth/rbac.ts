import type { Permission, UserRole } from '@/domain/types';

/**
 * Role-based access control.
 *
 * The grant table below is the single authority on what a role may do. Two
 * rules keep it honest:
 *
 *  1. THE SERVER ASSERTS, THE UI ONLY HIDES. Every data-access function calls
 *     `assertPermission`. Hiding a button is a courtesy to the user, never a
 *     security control -- a hidden button is still a reachable Server Action.
 *
 *  2. OWN-SCOPED PERMISSIONS ARE SEPARATE GRANTS. `order:read` (any order) and
 *     `order:read:own` (only mine) are different permissions rather than one
 *     permission plus a runtime flag, so a seller can never be widened into
 *     platform-wide read access by a missed conditional.
 *
 * This module is deliberately dependency-free so `proxy.ts` can import it at
 * the network boundary without dragging in the database layer.
 */

const CUSTOMER: Permission[] = [
  'catalog:read',
  'order:read:own',
  'order:cancel',
  'return:read',
  'support:read',
  'support:write',
];

const SELLER: Permission[] = [
  'catalog:read',
  'catalog:write',
  'order:read:own',
  'order:write',
  'order:cancel',
  'shipment:read',
  'shipment:write',
  'inventory:read',
  'inventory:write',
  'return:read',
  'return:approve',
  'settlement:read',
  'analytics:read:own',
  'support:read',
  'support:write',
  'export:data',
];

/**
 * Staff a seller invites. Same day-to-day fulfilment work, minus anything that
 * touches money or the store's own configuration.
 */
const SELLER_STAFF: Permission[] = [
  'catalog:read',
  'catalog:write',
  'order:read:own',
  'order:write',
  'shipment:read',
  'shipment:write',
  'inventory:read',
  'inventory:write',
  'return:read',
  'support:read',
  'support:write',
];

const SUPPORT: Permission[] = [
  'catalog:read',
  'order:read',
  'order:cancel',
  'shipment:read',
  'return:read',
  'return:approve',
  'user:read',
  'seller:read',
  'support:read',
  'support:write',
  'review:moderate',
];

const OPERATIONS: Permission[] = [
  'catalog:read',
  'order:read',
  'order:write',
  'order:cancel',
  'shipment:read',
  'shipment:write',
  'inventory:read',
  'inventory:write',
  'return:read',
  'return:approve',
  'user:read',
  'seller:read',
  'analytics:read',
  'support:read',
  'export:data',
];

const FINANCE: Permission[] = [
  'order:read',
  'order:refund',
  'refund:approve',
  'finance:read',
  'finance:payout',
  'settlement:read',
  'analytics:read',
  'seller:read',
  'user:read',
  'audit:read',
  'export:data',
];

const CATALOG_MANAGER: Permission[] = [
  'catalog:read',
  'catalog:write',
  'catalog:approve',
  'catalog:delete',
  'inventory:read',
  'seller:read',
  'review:moderate',
  'analytics:read',
  'export:data',
];

const MARKETING_MANAGER: Permission[] = [
  'catalog:read',
  'coupon:read',
  'coupon:write',
  'promotion:write',
  'cms:write',
  'analytics:read',
  'user:read',
  'export:data',
];

/**
 * Admin is everything operational. It deliberately stops short of role
 * editing and platform settings, which stay with SUPER_ADMIN so that
 * privilege escalation needs a second pair of hands.
 */
const ADMIN: Permission[] = Array.from(
  new Set<Permission>([
    ...OPERATIONS,
    ...FINANCE,
    ...CATALOG_MANAGER,
    ...MARKETING_MANAGER,
    ...SUPPORT,
    'user:write',
    'user:suspend',
    'seller:write',
    'seller:approve',
    'seller:suspend',
  ]),
);

const SUPER_ADMIN: Permission[] = Array.from(
  new Set<Permission>([...ADMIN, 'role:write', 'settings:write', 'audit:read']),
);

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  CUSTOMER,
  SELLER,
  SELLER_STAFF,
  SUPPORT,
  OPERATIONS,
  FINANCE,
  CATALOG_MANAGER,
  MARKETING_MANAGER,
  ADMIN,
  SUPER_ADMIN,
};

/** Roles whose home is the admin console. */
export const STAFF_ROLES: UserRole[] = [
  'SUPPORT',
  'OPERATIONS',
  'FINANCE',
  'CATALOG_MANAGER',
  'MARKETING_MANAGER',
  'ADMIN',
  'SUPER_ADMIN',
];

export const SELLER_ROLES: UserRole[] = ['SELLER', 'SELLER_STAFF'];

export function isStaffRole(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}

export function isSellerRole(role: UserRole): boolean {
  return SELLER_ROLES.includes(role);
}

export function permissionsFor(roles: UserRole[]): Permission[] {
  const granted = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) granted.add(permission);
  }
  return Array.from(granted);
}

export function hasPermission(
  permissions: readonly Permission[],
  required: Permission,
): boolean {
  return permissions.includes(required);
}

export function hasAnyPermission(
  permissions: readonly Permission[],
  required: readonly Permission[],
): boolean {
  return required.some((permission) => permissions.includes(permission));
}

/**
 * Where a signed-in user should land. Multi-role staff get the most capable
 * console their roles allow, which is also what they expect after login.
 */
export function landingPathFor(roles: UserRole[]): string {
  if (roles.some(isStaffRole)) return '/admin';
  if (roles.some(isSellerRole)) return '/seller';
  return '/';
}

/**
 * The role a session should act as by default when a user holds several.
 * Ordered most- to least-privileged so the choice is deterministic.
 */
const ROLE_PRECEDENCE: UserRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'FINANCE',
  'OPERATIONS',
  'CATALOG_MANAGER',
  'MARKETING_MANAGER',
  'SUPPORT',
  'SELLER',
  'SELLER_STAFF',
  'CUSTOMER',
];

export function primaryRole(roles: UserRole[]): UserRole {
  for (const role of ROLE_PRECEDENCE) {
    if (roles.includes(role)) return role;
  }
  return 'CUSTOMER';
}

/** Which console a path belongs to. Used by `proxy.ts` to pick a guard. */
export function consoleForPath(pathname: string): 'admin' | 'seller' | 'account' | 'public' {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
  if (pathname === '/seller' || pathname.startsWith('/seller/')) return 'seller';
  if (
    pathname === '/account' ||
    pathname.startsWith('/account/') ||
    pathname === '/orders' ||
    pathname.startsWith('/orders/') ||
    pathname === '/checkout' ||
    pathname.startsWith('/checkout/')
  ) {
    return 'account';
  }
  return 'public';
}
