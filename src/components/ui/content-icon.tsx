import { createElement } from 'react';

import {
  BadgeCheck,
  Gift,
  Headset,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Tag,
  Truck,
  type LucideIcon,
} from 'lucide-react';

import type { ContentIcon as IconKey } from '@/domain/site-content';

/**
 * Icons an administrator can choose, by meaning.
 *
 * The stored value is `delivery`, never `Truck`: an editor picks what a line
 * MEANS, and the drawing that stands for it stays a design decision. It also
 * keeps the database free of component names that a library rename would
 * invalidate.
 */
const ICONS: Record<IconKey, LucideIcon> = {
  delivery: Truck,
  returns: RotateCcw,
  verified: BadgeCheck,
  secure: ShieldCheck,
  support: Headset,
  gift: Gift,
  sparkle: Sparkles,
  tag: Tag,
};

export function iconFor(key: IconKey): LucideIcon {
  return ICONS[key] ?? Sparkles;
}

/*
 * `createElement` rather than `<Icon />`.
 *
 * Assigning a component to a local and rendering it reads as creating a
 * component during render, which resets state on every pass -- harmless for an
 * SVG, but the rule cannot tell the difference and it is right more often than
 * it is wrong. Looking the drawing up and calling it directly says what this
 * actually is: a table lookup.
 */
export function ContentIcon({ name, className }: { name: IconKey; className?: string }) {
  return createElement(iconFor(name), { className, 'aria-hidden': true });
}

/** The label an editor sees beside each choice. */
export const ICON_LABELS: Record<IconKey, string> = {
  delivery: 'Delivery',
  returns: 'Returns',
  verified: 'Verified',
  secure: 'Secure',
  support: 'Support',
  gift: 'Gift',
  sparkle: 'Highlight',
  tag: 'Offer',
};
