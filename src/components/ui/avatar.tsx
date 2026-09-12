import Image from 'next/image';

import { cn } from '@/lib/cn';

/**
 * Avatar.
 *
 * For a seller store, a support agent, a customer in the admin console. Falls
 * back to initials on a tinted ground rather than to a generic silhouette,
 * because a page of identical grey person-glyphs conveys nothing and a page of
 * distinct two-letter tiles is scannable.
 *
 * The tint is DERIVED FROM THE NAME, not random and not stored. That gives a
 * seller the same colour on every screen and after every reload, with no field
 * to migrate and nothing to keep in sync — and it is why the hash has to be
 * stable rather than using `Math.random` or an index in the current list.
 *
 * The palette is deliberately drawn from the chart ramp: those eight are
 * already chosen to be far apart in hue AND lightness, which is exactly what an
 * identicon needs, and reusing them means one fewer set of colours in the
 * system.
 */

const TINTS = [
  'bg-chart-1/12 text-chart-1',
  'bg-chart-2/12 text-chart-2',
  'bg-chart-3/12 text-chart-3',
  'bg-chart-4/12 text-chart-4',
  'bg-chart-5/12 text-chart-5',
  'bg-chart-6/12 text-chart-6',
  'bg-chart-7/12 text-chart-7',
  'bg-chart-8/12 text-chart-8',
] as const;

/** A small, stable, order-independent string hash. Not cryptographic; not meant to be. */
function tintFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return TINTS[Math.abs(hash) % TINTS.length];
}

/**
 * Up to two letters.
 *
 * Takes the first letter of the first and last word, so "Mora Studio" is MS and
 * "Kanha" is K. Deliberately not the first two characters: "MO" for Mora tells
 * you less than "MS" does, and every brand starting with the same two letters
 * would collide.
 */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const SIZE = {
  xs: { box: 'size-6', text: 'text-[0.55rem]', px: 24 },
  sm: { box: 'size-8', text: 'text-2xs', px: 32 },
  md: { box: 'size-10', text: 'text-xs', px: 40 },
  lg: { box: 'size-14', text: 'text-md', px: 56 },
  xl: { box: 'size-20', text: 'text-xl', px: 80 },
} as const;

export function Avatar({
  name,
  src,
  size = 'md',
  square = false,
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZE;
  /** Rounded-square instead of a circle. For a store or a brand, not a person. */
  square?: boolean;
  className?: string;
}) {
  const scale = SIZE[size];

  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden',
        'border-line border font-semibold',
        square ? 'rounded-md' : 'rounded-full',
        scale.box,
        tintFor(name),
        className,
      )}
      /*
       * The whole thing is decorative: the name it stands for is always written
       * next to it in every place this is used. An avatar that announces the
       * name a second time makes every seller row read its own title twice.
       */
      aria-hidden
    >
      {/*
        The initials are always there, under the photo. A photo still loading,
        or one that never will, then leaves a named tile rather than an empty
        grey disc that looks like a broken header.
      */}
      <span className={scale.text}>{initials(name)}</span>
      {src ? (
        <Image
          src={src}
          alt=""
          width={scale.px}
          height={scale.px}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
    </span>
  );
}

/**
 * Overlapping avatars with a remainder count.
 *
 * For "sold by 3 sellers" on an order, or reviewers on a product. The negative
 * margin is applied to every child but the first via a sibling selector rather
 than to the container, so a group of one is not indented by a gap that has
 * nothing to overlap.
 */
export function AvatarStack({
  names,
  max = 3,
  size = 'sm',
  className,
}: {
  names: string[];
  max?: number;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;

  return (
    <span className={cn('flex items-center [&>*+*]:-ml-2', className)}>
      {shown.map((name) => (
        <Avatar
          key={name}
          name={name}
          size={size}
          className="ring-raised ring-2 ring-offset-0"
        />
      ))}
      {rest > 0 ? (
        <span
          className={cn(
            'bg-sunken text-muted ring-raised grid place-items-center rounded-full ring-2',
            SIZE[size].box,
            SIZE[size].text,
            'font-semibold',
          )}
          aria-hidden
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
