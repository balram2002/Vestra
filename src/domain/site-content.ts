/**
 * Editable site furniture.
 *
 * The words and switches that used to be arrays halfway down a component: the
 * announcement strip, the three promises on the homepage, the footer's columns,
 * and which actions the header offers at all.
 *
 * TWO RULES MAKE THIS SAFE.
 *
 * 1. THE DEFAULTS LIVE IN CODE. Everything below is exactly what the shop ships
 *    with, so a clean database renders the designed page rather than an empty
 *    frame -- and an administrator who deletes everything gets the shop back by
 *    restoring, not by a migration.
 *
 * 2. STORED CONTENT IS A PATCH, NOT A REPLACEMENT. A block that has never been
 *    edited reads from here, so adding a new one ships with its copy already in
 *    place instead of appearing blank on every existing installation.
 *
 * This module is shared with the browser: the admin editor needs the same
 * shapes and the same defaults to offer "reset to the original".
 */

/** Icons an editor can choose from, by meaning rather than by library name. */
export const CONTENT_ICONS = [
  'delivery',
  'returns',
  'verified',
  'secure',
  'support',
  'gift',
  'sparkle',
  'tag',
] as const;

export type ContentIcon = (typeof CONTENT_ICONS)[number];

export interface AnnouncementItem {
  id: string;
  text: string;
  /** Optional destination. A promise that is not a link is fine. */
  href: string | null;
  isActive: boolean;
}

export interface ValueProp {
  id: string;
  icon: ContentIcon;
  title: string;
  body: string;
  isActive: boolean;
}

export interface FooterLink {
  id: string;
  label: string;
  href: string;
}

export interface FooterColumn {
  id: string;
  title: string;
  links: FooterLink[];
}

export interface FooterBadge {
  id: string;
  icon: ContentIcon;
  label: string;
}

/**
 * Which actions the header offers.
 *
 * A shop that has not launched live shopping should not show a Reels tab, and
 * one that does not take wishlists should not show a heart. Turning one off
 * removes it from the header, the phone drawer and the bottom bar together --
 * a half-hidden action is worse than either state.
 */
export interface HeaderActions {
  search: boolean;
  reels: boolean;
  wishlist: boolean;
  bag: boolean;
}

export interface SiteContent {
  announcements: AnnouncementItem[];
  headerActions: HeaderActions;
  valueProps: ValueProp[];
  valuePropsTitle: string | null;
  footerColumns: FooterColumn[];
  footerBadges: FooterBadge[];
  footerNote: string | null;
}

export const DEFAULT_SITE_CONTENT: SiteContent = {
  announcements: [
    { id: 'delivery', text: 'Free delivery above ₹1,199', href: null, isActive: true },
    { id: 'returns', text: '14-day returns & exchanges', href: null, isActive: true },
    { id: 'reviewed', text: 'Every seller reviewed by our team', href: null, isActive: true },
    {
      id: 'payments',
      text: 'Secure payments · UPI, cards, netbanking',
      href: null,
      isActive: true,
    },
  ],

  headerActions: { search: true, reels: true, wishlist: true, bag: true },

  valuePropsTitle: null,
  valueProps: [
    {
      id: 'delivery',
      icon: 'delivery',
      title: 'Free delivery above ₹1,199',
      body: 'Standard delivery in 3–6 days, 2–4 across metros. Every estimate is calculated from your pincode, never guessed.',
      isActive: true,
    },
    {
      id: 'returns',
      icon: 'returns',
      title: '14-day returns and exchanges',
      body: 'Unworn, tags intact. Reverse pickup is free whenever the fault is ours, and refunds land within 5 working days.',
      isActive: true,
    },
    {
      id: 'reviewed',
      icon: 'verified',
      title: 'Every seller reviewed',
      body: 'Our team approves every store before it can sell, and each store page shows its real record: ratings, dispatch time and returns.',
      isActive: true,
    },
  ],

  footerBadges: [
    { id: 'secure', icon: 'secure', label: 'Secure checkout' },
    { id: 'returns', icon: 'returns', label: '14-day returns' },
    { id: 'reviewed', icon: 'verified', label: 'Every seller reviewed' },
  ],

  footerColumns: [
    {
      id: 'help',
      title: 'Help',
      links: [
        { id: 'contact', label: 'Contact us', href: '/help/contact' },
        { id: 'shipping', label: 'Shipping & delivery', href: '/help/shipping' },
        { id: 'returns', label: 'Returns & exchanges', href: '/help/returns' },
        { id: 'refunds', label: 'Refunds', href: '/help/refunds' },
        { id: 'sizes', label: 'Size guide', href: '/help/size-guide' },
        { id: 'track', label: 'Track your order', href: '/orders' },
      ],
    },
    {
      id: 'company',
      title: 'Company',
      links: [
        { id: 'about', label: 'About VestraWAB', href: '/about' },
        { id: 'sell', label: 'Sell on VestraWAB', href: '/sell-with-us' },
        { id: 'stores', label: 'Our sellers', href: '/stores' },
        { id: 'brands', label: 'All brands', href: '/brands' },
      ],
    },
    {
      id: 'legal',
      title: 'Legal',
      links: [
        { id: 'terms', label: 'Terms of use', href: '/legal/terms' },
        { id: 'privacy', label: 'Privacy policy', href: '/legal/privacy' },
        { id: 'returns-policy', label: 'Return policy', href: '/legal/returns-policy' },
        { id: 'grievance', label: 'Grievance redressal', href: '/legal/grievance' },
      ],
    },
  ],

  footerNote: null,
};

/**
 * Stored content over the defaults, one block at a time.
 *
 * Shallow on purpose. A block is edited as a whole -- the editor sends the full
 * list of announcements, not a diff -- so merging deeper would mean an
 * administrator could never delete the last item in a list.
 */
export function withDefaults(stored: Partial<SiteContent> | null | undefined): SiteContent {
  if (!stored) return DEFAULT_SITE_CONTENT;

  return {
    announcements: stored.announcements ?? DEFAULT_SITE_CONTENT.announcements,
    headerActions: { ...DEFAULT_SITE_CONTENT.headerActions, ...stored.headerActions },
    valueProps: stored.valueProps ?? DEFAULT_SITE_CONTENT.valueProps,
    valuePropsTitle: stored.valuePropsTitle ?? DEFAULT_SITE_CONTENT.valuePropsTitle,
    footerColumns: stored.footerColumns ?? DEFAULT_SITE_CONTENT.footerColumns,
    footerBadges: stored.footerBadges ?? DEFAULT_SITE_CONTENT.footerBadges,
    footerNote: stored.footerNote ?? DEFAULT_SITE_CONTENT.footerNote,
  };
}
