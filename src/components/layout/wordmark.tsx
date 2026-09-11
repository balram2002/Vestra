import { cn } from '@/lib/cn';
import { siteConfig } from '@/config/site';

/**
 * The brand lockup.
 *
 * One component, because the brand was previously a hardcoded string in five
 * places — the header, the mobile nav, the auth shell, both console shells —
 * and a rebrand that has to find five of them will miss one.
 *
 * THE TYPE IS THE LOGO. There is deliberately no image: an `<svg>` or `<img>`
 * wordmark needs one file per theme, does not inherit the type scale, and is a
 * blurry raster in a print stylesheet. Type re-colours itself, scales with the
 * page, and is selectable and searchable.
 *
 * The name has two halves and the lockup says so rather than hiding it:
 * "Vestra" is set in the display grotesk at full weight with hard negative
 * tracking; "WAB" is smaller, tracked wide, and takes the accent. That
 * opposition — tight versus loose, dark versus brand — is what makes it read as
 * one product name with a parent behind it instead of an unfortunate compound
 * word.
 *
 * The MARK — `public/brand/vestrawab-mark.svg`, also served as the favicon from
 * `app/icon.svg` — is a separate thing on purpose. At 16px a wordmark is a grey
 * smudge, so the favicon is the initial and a keel, and nothing else.
 */
export function Wordmark({
  className,
  size = 'md',
  showAttribution = false,
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Adds "A product by planWAB" beneath. For auth screens and the footer. */
  showAttribution?: boolean;
}) {
  /*
   * The suffix is roughly HALF the name's size, never smaller.
   *
   * An earlier pass set it at 0.55rem next to a 1.3rem name — 8.8px, below the
   * 11px floor this system holds body text to, and at that size the tracking
   * that is meant to make it read as a separate word instead made it read as
   * noise. Half is the ratio at which the two halves stay legible as one
   * lockup at every step.
   */
  const type = {
    sm: { name: 'text-lg', suffix: 'text-[0.6rem]', gap: 'gap-[0.2em]' },
    md: { name: 'text-xl', suffix: 'text-2xs', gap: 'gap-[0.2em]' },
    lg: { name: 'text-3xl', suffix: 'text-xs', gap: 'gap-[0.22em]' },
    xl: { name: 'text-4xl', suffix: 'text-sm', gap: 'gap-[0.22em]' },
  }[size];

  return (
    <span className={cn('inline-flex flex-col', className)}>
      {/*
        Both halves sit on ONE baseline.

        Top-aligning them puts "WAB" at the top of the display face's much
        taller line box, so it reads as a superscript — a trademark mark rather
        than half the name. A shared baseline is what makes it read as one word
        with a change of voice.
      */}
      <span className={cn('inline-flex items-baseline', type.gap)}>
        <span
          className={cn(
            'font-display text-ink font-bold leading-none tracking-[-0.045em]',
            type.name,
          )}
        >
          Vestra
        </span>
        <span
          className={cn(
            'text-accent-ink font-semibold uppercase leading-none tracking-[0.18em]',
            type.suffix,
          )}
        >
          WAB
        </span>
      </span>

      {showAttribution ? (
        <span className="text-faint mt-1.5 text-2xs leading-none">{siteConfig.attribution}</span>
      ) : null}
    </span>
  );
}

/**
 * The mark, drawn inline.
 *
 * Inline SVG rather than an `<img>` so it can inherit `currentColor` for the
 * letterform and needs no network request in the header, which is on every
 * page. The GROUND stays the brand colour in both themes — a logo that changes
 * colour with the theme is not a logo — while the letter uses white in both,
 * which is correct on iris either way.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      focusable="false"
      className={cn('size-8 shrink-0', className)}
    >
      <rect width="64" height="64" rx="16" fill="var(--color-iris-600)" />
      <path
        d="M14 16.5 L32 47.5 L50 16.5"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="7.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <rect x="23" y="51" width="18" height="3.5" rx="1.75" fill="var(--color-sand-400)" />
    </svg>
  );
}

/**
 * Mark plus wordmark, side by side.
 *
 * For the places that need the brand to carry weight on its own — an auth
 * screen, an email header, a console shell — as opposed to the storefront
 * header, where the wordmark alone is quieter and leaves the row to the
 * navigation.
 */
export function BrandLockup({
  className,
  size = 'md',
  showAttribution = false,
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showAttribution?: boolean;
}) {
  const mark = { sm: 'size-7', md: 'size-9', lg: 'size-11' }[size];

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark className={mark} />
      <Wordmark size={size} showAttribution={showAttribution} />
    </span>
  );
}
