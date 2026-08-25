import type { Metadata } from 'next';
import { Suspense } from 'react';

import { QueueBadge } from '@/components/console/queue-badge';
import { ConsoleShell } from '@/components/layout/console-shell';
import { USER_ROLE_LABEL } from '@/domain/enums';
import { requireAnyRole } from '@/server/auth/session';
import { STAFF_ROLES } from '@/server/auth/rbac';
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
      title="Vestra"
      subtitle="Admin console"
      groups={[
        {
          label: 'Overview',
          items: [
            { href: '/admin', label: 'Dashboard' },
            { href: '/admin/analytics', label: 'Analytics' },
          ],
        },
        {
          label: 'Commerce',
          items: [
            { href: '/admin/orders', label: 'Orders' },
            {
              href: '/admin/returns',
              label: 'Returns',
              badge: (
                <Suspense fallback={null}>
                  <ReturnsBadge />
                </Suspense>
              ),
            },
            { href: '/admin/payments', label: 'Payments' },
            { href: '/admin/settlements', label: 'Settlements' },
            {
              href: '/admin/support',
              label: 'Support',
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
              badge: (
                <Suspense fallback={null}>
                  <ReviewQueueBadge />
                </Suspense>
              ),
            },
            { href: '/admin/categories', label: 'Categories' },
          ],
        },
        {
          label: 'People',
          items: [
            {
              href: '/admin/sellers',
              label: 'Sellers',
              badge: (
                <Suspense fallback={null}>
                  <SellerApprovalBadge />
                </Suspense>
              ),
            },
            { href: '/admin/users', label: 'Users' },
          ],
        },
        {
          label: 'Marketing',
          items: [
            { href: '/admin/coupons', label: 'Coupons' },
            { href: '/admin/promotions', label: 'Promotions' },
            { href: '/admin/cms', label: 'Homepage' },
          ],
        },
        {
          label: 'Governance',
          items: [
            { href: '/admin/audit-logs', label: 'Audit log' },
            { href: '/admin/settings', label: 'Settings' },
          ],
        },
      ]}
      accessory={
        <Suspense fallback={null}>
          <WhoAmI />
        </Suspense>
      }
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

async function WhoAmI() {
  const user = await requireAnyRole(STAFF_ROLES);
  return (
    <span className="text-muted text-xs">
      {user.fullName} <span className="text-faint">· {USER_ROLE_LABEL[user.activeRole]}</span>
    </span>
  );
}
