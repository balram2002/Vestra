import { Tabs } from '@/components/ui/tabs';


/**
 * Account section navigation.
 *
 * Shared across every account screen so the section always looks like one
 * place rather than five unrelated pages that happen to share a URL prefix.
 */
const LINKS = [
  { href: '/account', label: 'Overview' },
  { href: '/account/profile', label: 'Profile' },
  { href: '/orders', label: 'Orders' },
  { href: '/account/returns', label: 'Returns' },
  { href: '/account/reviews', label: 'Reviews' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/notifications', label: 'Notifications' },
  { href: '/account/support', label: 'Help' },
];

export function AccountNav({ current }: { current: string }) {
  return (
    <Tabs
      label="Your account"
      items={LINKS.map((link) => ({ value: link.href, label: link.label }))}
      current={current}
      href={(value) => value}
      className="mb-1"
    />
  );
}
