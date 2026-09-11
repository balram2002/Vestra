import { ImageResponse } from 'next/og';

import { siteConfig } from '@/config/site';

/**
 * Open Graph cards.
 *
 * One renderer, used by every `opengraph-image` route. The alternative — a
 * hand-built card per route — is how five slightly different brands end up in
 * one social feed.
 *
 * These are rendered by Satori, not by a browser. It supports a deliberate
 * subset of CSS: flexbox only (no grid, no float), no cascade, no custom
 * properties. So the design tokens cannot be referenced here as `var(...)` and
 * are mirrored below as literals instead — the one place in the codebase where
 * a colour is written twice. `OG_PALETTE` exists so it is written twice in
 * exactly one file rather than once per card.
 *
 * Typeface is Satori's bundled sans rather than the brand's Instrument Serif.
 * Loading the real face would mean either a network fetch at render time or a
 * binary committed to the repository, and neither is worth it for an image whose
 * job is to be legible at thumbnail size in a feed. The identity is carried by
 * colour, scale and layout, all of which survive the substitution.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png';

/**
 * Mirrors `src/styles/tokens.css`. Satori cannot read CSS custom properties.
 *
 * These are the LIGHT theme values, deliberately: a social card has no viewer
 * theme to follow. It is composited into someone else's feed, which may be dark
 * or light, so it commits to one look and carries its own ground rather than
 * borrowing whatever is behind it.
 */
const OG_PALETTE = {
  canvas: '#f8f8f6',
  ink: '#1b1a18',
  muted: '#56544d',
  faint: '#6b6960',
  line: '#e4e3de',
  accent: '#4835a1',
  accentBright: '#5744c1',
} as const;

export interface OgCardOptions {
  /** Small line above the title: a category path, a store's city, a section. */
  eyebrow?: string | null;
  title: string;
  subtitle?: string | null;
  /** Bottom-right detail: a product count, a rating, a price band. */
  footnote?: string | null;
}

/**
 * Longer strings are truncated rather than allowed to reflow.
 *
 * Satori has no overflow handling worth relying on, and a title that wraps to
 * five lines pushes the wordmark off the canvas — which is worse than an
 * ellipsis, because the card stops being recognisably ours.
 */
function clamp(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit - 1).trimEnd()}…`;
}

/** The size the title can afford, given how much of it there is. */
function titleSize(length: number): number {
  if (length <= 24) return 84;
  if (length <= 44) return 68;
  if (length <= 70) return 54;
  return 44;
}

export function ogCard(options: OgCardOptions): ImageResponse {
  const title = clamp(options.title, 90);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: OG_PALETTE.canvas,
          padding: '64px 72px',
          // A single accent edge, so the card is identifiable at thumbnail size
          // even when the text is far too small to read.
          borderLeft: `16px solid ${OG_PALETTE.accent}`,
        }}
      >
        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: OG_PALETTE.accent,
              borderRadius: 10,
              color: OG_PALETTE.canvas,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            VW
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              color: OG_PALETTE.ink,
              letterSpacing: '-0.02em',
            }}
          >
            {siteConfig.name}
          </div>
        </div>

        {/* The message */}
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 960 }}>
          {options.eyebrow ? (
            <div
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: OG_PALETTE.accentBright,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 20,
              }}
            >
              {clamp(options.eyebrow, 48)}
            </div>
          ) : null}

          <div
            style={{
              fontSize: titleSize(title.length),
              fontWeight: 700,
              color: OG_PALETTE.ink,
              lineHeight: 1.08,
              letterSpacing: '-0.03em',
            }}
          >
            {title}
          </div>

          {options.subtitle ? (
            <div
              style={{
                fontSize: 28,
                color: OG_PALETTE.muted,
                lineHeight: 1.4,
                marginTop: 24,
              }}
            >
              {clamp(options.subtitle, 140)}
            </div>
          ) : null}
        </div>

        {/* Baseline */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: `2px solid ${OG_PALETTE.line}`,
            paddingTop: 24,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 22, color: OG_PALETTE.faint }}>{siteConfig.tagline}</div>
            <div style={{ fontSize: 18, color: OG_PALETTE.faint, marginTop: 4 }}>
              {siteConfig.attribution}
            </div>
          </div>
          {options.footnote ? (
            <div style={{ fontSize: 22, fontWeight: 600, color: OG_PALETTE.ink }}>
              {clamp(options.footnote, 40)}
            </div>
          ) : null}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
