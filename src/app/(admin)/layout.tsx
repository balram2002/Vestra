import {
  BarChart3,
  BadgePercent,
  CreditCard,
  FileText,
  FolderTree,
  LayoutDashboard,
  LayoutTemplate,
  LifeBuoy,
  MessageSquareQuote,
  Package,
  Receipt,
  RotateCcw,
  ScrollText,
  Settings,
  ShoppingCart,
  Store,
  Tags,
  Ticket,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { QueueBadge } from '@/components/console/queue-badge';
import { ConsoleShell } from '@/components/layout/console-shell';
import { ConsoleUserMenu } from '@/components/layout/console-user-menu';
import { BrandMark } from '@/components/layout/wordmark';
import { USER_ROLE_LABEL } from '@/domain/enums';
import { requireAnyRole } from '@/server/auth/session';
import { isSellerRole, STAFF_ROLES } from '@/server/auth/rbac';
import { collections } from '@/server/db/collections';

export const metadata: Metadata = {
  title: { template: '%s · Admin', default: 'Admin' },
  robots: { index: false, follow: false },
};

/**
 * Admin console shell.
 *
 * Like the seller shell: the nav is static and prerenders, and every per-user
 * read is a Suspense island. Each page enforces its OWN permission with
 * `requirePermission`, which matters more here than in the seller console
 * because the roles differ so much — a Finance user and a Catalogue manager
 * both land here and should not see the same screens.
 *
 * The nav deliberately shows every section to every staff role. Hiding a link
 * a user cannot open produces a confusing, differently-shaped app per role;
 * letting them click through to a clear "you do not have access" is kinder and
 * is what the `forbidden.tsx` boundary is for.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConsoleShell
      homeHref="/admin"
      brand={<BrandMark className="size-8" />}
      title="VestraWAB"
      subtitle="Admin console"
      user={
        <Suspense fallback={<UserSkeleton />}>
          <AdminUser />
        </Suspense>
      }
      groups={[
        {
          label: 'Overview',
          items: [
            { href: '/admin', label: 'Dashboard', icon: <LayoutDashboard aria-hidden /> },
            { href: '/admin/analytics', label: 'Analytics', icon: <BarChart3 aria-hidden /> },
          ],
        },
        {
          label: 'Commerce',
          items: [
            { href: '/admin/orders', label: 'Orders', icon: <ShoppingCart aria-hidden /> },
            {
              href: '/admin/returns',
              label: 'Returns',
              icon: <RotateCcw aria-hidden />,
              badge: (
                <Suspense fallback={null}>
                  <ReturnsBadge />
                </Suspense>
              ),
            },
            { href: '/admin/payments', label: 'Payments', icon: <CreditCard aria-hidden /> },
            { href: '/admin/settlements', label: 'Settlements', icon: <Receipt aria-hidden /> },
            {
              href: '/admin/support',
              label: 'Support',
              icon: <LifeBuoy aria-hidden />,
              badge: (
                <Suspense fallback={null}>
                  <SupportBadge />
                </Suspense>
              ),
            },
          ],
        },
        {
          label: 'Catalogue',
          items: [
            {
              href: '/admin/products',
              label: 'Products',
              icon: <Package aria-hidden />,
              badge: (
                <Suspense fallback={null}>
                  <ReviewQueueBadge />
                </Suspense>
              ),
            },
            { href: '/admin/reviews', label: 'Reviews', icon: <MessageSquareQuote aria-hidden /> },
            { href: '/admin/categories', label: 'Categories', icon: <FolderTree aria-hidden /> },
            { href: '/admin/brands', label: 'Brands', icon: <Tags aria-hidden /> },
          ],
        },
        {
          label: 'People',
          items: [
            {
              href: '/admin/sellers',
              label: 'Sellers',
              icon: <Store aria-hidden />,
              badge: (
                <Suspense fallback={null}>
                  <SellerApprovalBadge />
                </Suspense>
              ),
            },
            { href: '/admin/users', label: 'Users', icon: <Users aria-hidden /> },
          ],
        },
        {
          label: 'Marketing',
          items: [
            { href: '/admin/coupons', label: 'Coupons', icon: <Ticket aria-hidden /> },
            { href: '/admin/promotions', label: 'Promotions', icon: <BadgePercent aria-hidden /> },
            { href: '/admin/cms', label: 'Homepage', icon: <LayoutTemplate aria-hidden /> },
            { href: '/admin/pages', label: 'Pages', icon: <FileText aria-hidden /> },
          ],
        },
        {
          label: 'Governance',
          items: [
            { href: '/admin/audit-logs', label: 'Audit log', icon: <ScrollText aria-hidden /> },
            { href: '/admin/settings', label: 'Settings', icon: <Settings aria-hidden /> },
          ],
        },
      ]}
    >
      {children}
    </ConsoleShell>
  );
}

async function SupportBadge() {
  await requireAnyRole(STAFF_ROLES);
  const tickets = await collections.supportTickets();
  const count = await tickets.countDocuments({ status: 'OPEN' });
  return <QueueBadge count={count} />;
}

async function ReturnsBadge() {
  await requireAnyRole(STAFF_ROLES);
  const returns = await collections.returns();
  const count = await returns.countDocuments({ status: 'RETURN_REQUESTED' });
  return <QueueBadge count={count} />;
}

async function ReviewQueueBadge() {
  await requireAnyRole(STAFF_ROLES);
  const products = await collections.products();
  const count = await products.countDocuments({
    status: { $in: ['SUBMITTED', 'PENDING_REVIEW'] },
  });
  return <QueueBadge count={count} />;
}

async function SellerApprovalBadge() {
  await requireAnyRole(STAFF_ROLES);
  const sellers = await collections.sellers();
  const count = await sellers.countDocuments({
    status: { $in: ['ONBOARDING', 'KYC_SUBMITTED', 'KYC_PENDING'] },
  });
  return <QueueBadge count={count} />;
}

/**
 * The signed-in staff member, for the rail's user menu.
 *
 * Its own Suspense island: the rail prerenders and the identity streams in, so
 * reading the session never holds up the console shell.
 */
async function AdminUser() {
  const user = await requireAnyRole(STAFF_ROLES);
  return (
    <ConsoleUserMenu
      name={user.fullName}
      role={USER_ROLE_LABEL[user.activeRole]}
      email={user.email}
      avatarUrl={user.avatarUrl}
      otherConsoles={
        user.roles.some(isSellerRole) && user.sellerId
          ? [{ href: '/seller', label: 'Seller console' }]
          : undefined
      }
    />
  );
}

/** The user card's geometry, so nothing shifts when the identity lands. */
function UserSkeleton() {
  return (
    <div className="flex items-center gap-2.5 p-1.5" aria-hidden>
      <span className="skeleton size-8 shrink-0 rounded-full" />
      <span className="flex-1 space-y-1.5">
        <span className="skeleton block h-3 w-3/4 rounded" />
        <span className="skeleton block h-2.5 w-1/2 rounded" />
      </span>
    </div>
  );
}
