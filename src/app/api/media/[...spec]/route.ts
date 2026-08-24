import { COLOR_BY_VALUE } from '@/domain/attributes';
import { hashString } from '@/lib/random';
import type { MediaShape } from '@/server/seed/media';

/**
 * Generated product and tile imagery.
 *
 * Renders a deterministic SVG from the spec encoded in the path, so a demo
 * catalogue of ~6,000 variants needs no binary assets and no third-party CDN.
 * The same URL always produces the same bytes, which is what makes the
 * immutable cache header in `next.config.ts` correct.
 *
 * Two URL shapes:
 *   /api/media/p/<shape>/<colour>/<view>/<key>.svg   product photography
 *   /api/media/t/<kind>/<colour>/<key>.svg           tiles, logos, banners
 *
 * The output is intentionally restrained -- a garment silhouette on a tinted
 * ground -- rather than a grey box with a filename on it. The point is that
 * grids, galleries and colour swatches can be judged for real: a shopper
 * comparing two colourways sees two different images.
 *
 * No route segment config: Cache Components rejects `export const dynamic`.
 * Cacheability comes from the immutable `Cache-Control` header below, which is
 * what a CDN acts on anyway.
 */

const BONE = '#F4F1EC';
const INK = '#2B2823';

/** Garment silhouettes, drawn in a 200x260 viewBox. */
const SHAPES: Record<MediaShape, string> = {
  kurta:
    'M70 40 L100 52 L130 40 L152 54 L140 84 L128 78 L128 224 L72 224 L72 78 L60 84 L48 54 Z',
  saree:
    'M52 44 C92 32 124 36 152 46 L142 96 C150 140 146 190 138 226 L64 226 C58 186 56 138 62 96 Z',
  lehenga:
    'M78 38 L100 48 L122 38 L134 92 L152 226 L48 226 L66 92 Z',
  dress:
    'M74 42 L100 54 L126 42 L142 62 L132 92 L146 226 L54 226 L68 92 L58 62 Z',
  top: 'M70 44 L100 56 L130 44 L152 60 L142 88 L130 82 L130 168 L70 168 L70 82 L58 88 L48 60 Z',
  shirt:
    'M72 40 L100 58 L128 40 L152 56 L142 88 L132 82 L132 226 L68 226 L68 82 L58 88 L48 56 Z M100 58 L100 226',
  tshirt:
    'M68 46 L100 58 L132 46 L156 66 L144 94 L132 86 L132 200 L68 200 L68 86 L56 94 L44 66 Z',
  jeans:
    'M68 40 L132 40 L138 118 L134 226 L106 226 L100 140 L94 226 L66 226 L62 118 Z',
  jacket:
    'M72 40 L100 54 L128 40 L150 56 L140 90 L130 84 L130 214 L70 214 L70 84 L60 90 L50 56 Z M100 54 L100 214',
  shoe: 'M44 176 C58 150 76 142 96 146 C118 150 132 164 156 170 C166 172 168 186 158 192 L54 192 C44 192 40 184 44 176 Z',
  sneaker:
    'M40 168 C56 142 78 136 98 142 C116 148 128 162 152 168 C164 171 166 184 156 190 L50 190 C38 190 34 178 40 168 Z M40 178 L156 178',
  bag: 'M60 92 L140 92 L150 220 L50 220 Z M80 92 C80 62 84 52 100 52 C116 52 120 62 120 92',
  jewellery:
    'M100 62 A10 10 0 1 1 100 82 A10 10 0 1 1 100 62 Z M100 84 L84 132 A18 18 0 0 0 116 132 Z',
  bottle:
    'M92 44 L108 44 L108 66 C126 74 130 88 130 104 L130 210 A8 8 0 0 1 122 218 L78 218 A8 8 0 0 1 70 210 L70 104 C70 88 74 74 92 66 Z',
  linen:
    'M44 76 L156 76 L156 200 L44 200 Z M44 108 L156 108 M44 140 L156 140 M44 172 L156 172',
  generic: 'M56 60 L144 60 L144 208 L56 208 Z',
};

/**
 * A deterministic tint for a spec, so two products in the same colourway do not
 * render identically. Small hue drift only -- the colour must still read as the
 * colour the shopper picked.
 */
function groundFor(hex: string, key: string): string {
  const drift = (hashString(key) % 14) - 7;
  return mix(hex, BONE, 0.86 + drift / 200);
}

/** Blend `a` towards `b` by `amount` (0 = all a, 1 = all b). */
function mix(a: string, b: string, amount: number): string {
  const pa = parse(a);
  const pb = parse(b);
  const t = Math.min(1, Math.max(0, amount));
  const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function parse(hex: string): number[] {
  const clean = hex.replace('#', '');
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

/** Perceived luminance, for deciding whether overlaid text should be light. */
function isDark(hex: string): boolean {
  const [r, g, b] = parse(hex) as [number, number, number];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55;
}

function productSvg(shape: MediaShape, colorToken: string, view: number, key: string): string {
  const def = COLOR_BY_VALUE.get(colorToken);
  const garment = def?.hex ?? '#8F2C5B';
  const ground = groundFor(garment, key);
  const path = SHAPES[shape] ?? SHAPES.generic;
  const seed = hashString(`${key}:${view}`);

  // Later views are framed tighter, the way a gallery moves from full shot to
  // detail. View 2 is the fabric close-up.
  const zoom = [1, 1.04, 1.9, 1.12, 0.94][view % 5] ?? 1;
  const offsetY = view % 5 === 2 ? -30 : 0;
  const rotate = ((seed % 5) - 2) * 0.4;

  const shadow = mix(garment, '#000000', 0.28);
  const highlight = mix(garment, '#ffffff', 0.24);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" width="900" height="1170" role="img">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${highlight}"/>
      <stop offset="0.55" stop-color="${garment}"/>
      <stop offset="1" stop-color="${shadow}"/>
    </linearGradient>
    <pattern id="weave" width="4" height="4" patternUnits="userSpaceOnUse">
      <path d="M0 0 L4 4 M4 0 L0 4" stroke="${mix(garment, '#000000', 0.1)}" stroke-width="0.4" opacity="0.35"/>
    </pattern>
  </defs>
  <rect width="200" height="260" fill="${ground}"/>
  <g transform="translate(100 ${130 + offsetY}) scale(${zoom.toFixed(3)}) rotate(${rotate.toFixed(2)}) translate(-100 -130)">
    <path d="${path}" fill="url(#g)" stroke="${shadow}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="${path}" fill="url(#weave)" opacity="0.5"/>
  </g>
</svg>`;
}

function tileSvg(kind: string, colorToken: string, key: string): string {
  const def = COLOR_BY_VALUE.get(colorToken);
  const base = def?.hex ?? '#8F2C5B';
  const ground = mix(base, BONE, kind.startsWith('hero') ? 0.55 : 0.7);
  const accent = mix(base, INK, 0.25);
  const seed = hashString(key);
  const dark = isDark(ground);

  // Hero and banner tiles are wide; category and avatar tiles are square.
  const wide = kind.startsWith('hero') || kind === 'banner' || kind === 'grid';
  const w = wide ? 1600 : 600;
  const h = wide ? (kind === 'hero-m' ? 900 : 700) : 600;

  // Initials give brand logos and avatars something legible to show.
  const initials = key
    .split('-')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  const arcs = Array.from({ length: 5 }, (_, i) => {
    const r = 30 + ((seed >> (i * 3)) % 26) + i * 14;
    const cx = 20 + ((seed >> (i * 5)) % 60);
    const cy = 30 + ((seed >> (i * 7)) % 50);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${accent}" stroke-width="0.7" opacity="0.22"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 ${wide ? 44 : 100}" width="${w}" height="${h}" role="img" preserveAspectRatio="xMidYMid slice">
  <rect width="100" height="100" fill="${ground}"/>
  <g>${arcs}</g>
  ${
    kind === 'brand' || kind === 'avatar'
      ? `<text x="50" y="${wide ? 26 : 56}" text-anchor="middle" font-family="Georgia, serif" font-size="22" font-weight="600" fill="${dark ? BONE : accent}">${initials}</text>`
      : ''
  }
</svg>`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ spec: string[] }> },
) {
  const { spec } = await params;

  let body: string;

  if (spec[0] === 'p' && spec.length >= 5) {
    const [, shape, color, view, file] = spec as [string, string, string, string, string];
    body = productSvg(
      (shape as MediaShape) in SHAPES ? (shape as MediaShape) : 'generic',
      color,
      Number.parseInt(view, 10) || 0,
      file.replace(/\.svg$/, ''),
    );
  } else if (spec[0] === 't' && spec.length >= 4) {
    const [, kind, color, file] = spec as [string, string, string, string];
    body = tileSvg(kind, color, file.replace(/\.svg$/, ''));
  } else {
    return new Response('Not found', { status: 404 });
  }

  return new Response(body, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // Matches the immutable rule in next.config.ts: a spec never changes.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
