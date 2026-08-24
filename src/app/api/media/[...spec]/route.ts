import { COLOR_BY_VALUE } from '@/domain/attributes';
import { hashString } from '@/lib/random';
import type { MediaShape } from '@/server/seed/media';

/**
 * Generated product and tile imagery.
 *
 * A deterministic SVG per URL, so a catalogue of ~6,000 variants needs no
 * binary assets and no third-party CDN, and the same spec always renders the
 * same bytes (which is what makes the immutable cache header correct).
 *
 * The hard part is not generating AN image, it is generating one that does not
 * look generated. A flat silhouette on a flat ground reads as a broken
 * placeholder and drags the whole shop down with it, so each render builds up
 * the way a studio photograph does:
 *
 *   1. a graded backdrop with a soft spotlight and a horizon, not a flat fill
 *   2. a contact shadow on the ground, so the garment sits rather than floats
 *   3. the garment in a three-stop gradient — highlight, body, shade — with a
 *      darker rim so the edge reads as fabric rather than as a vector outline
 *   4. a material-specific weave overlay (twill, knit, sheer, leather grain)
 *   5. construction detail: seams, a collar, a placket, folds
 *
 * Swapping in real photography later means changing `seed/media.ts` and this
 * file; every consumer only ever sees a URL string.
 *
 * No route segment config: Cache Components rejects `export const dynamic`.
 * Cacheability comes from the Cache-Control header below, which is what a CDN
 * acts on anyway.
 */

const INK = '#2B2823';

/* ---------------------------------------------------------------- colour */

function parse(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [
    Number.parseInt(c.slice(0, 2), 16),
    Number.parseInt(c.slice(2, 4), 16),
    Number.parseInt(c.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Blend `a` towards `b`. `amount` 0 = all a, 1 = all b. */
function mix(a: string, b: string, amount: number): string {
  const pa = parse(a);
  const pb = parse(b);
  const t = Math.max(0, Math.min(1, amount));
  return toHex([
    pa[0] + (pb[0] - pa[0]) * t,
    pa[1] + (pb[1] - pa[1]) * t,
    pa[2] + (pb[2] - pa[2]) * t,
  ]);
}

function luminance(hex: string): number {
  const [r, g, b] = parse(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * The backdrop for a given garment colour.
 *
 * Warm neutrals, never a tint of the garment itself: a sage dress on a sage
 * ground disappears, and a grid where every tile is a different pastel reads as
 * chaos. Studios shoot on a small set of papers, so this picks from one.
 */
const PAPERS = ['#EFEAE1', '#E9E4DA', '#F2EDE6', '#E4DED4', '#EDE6DC', '#E7E7E4'];

/* --------------------------------------------------------------- shapes */

interface Silhouette {
  /** Main body outline. */
  body: string;
  /** Construction lines drawn over the body: seams, plackets, folds. */
  seams?: string[];
  /** Secondary filled pieces, e.g. a contrasting collar or sole. */
  pieces?: Array<{ d: string; shade: number }>;
  /** Where the contact shadow sits and how wide it is. */
  ground?: { cy: number; rx: number };
}

/**
 * Silhouettes in a 200 x 260 viewBox.
 *
 * Drawn with a waist, a hem sweep and sleeve taper rather than as symmetric
 * geometry — a garment reads as a garment because of where it narrows.
 */
const SHAPES: Record<MediaShape, Silhouette> = {
  kurta: {
    body: 'M74 46 C82 40 90 38 100 38 C110 38 118 40 126 46 L150 58 C154 60 154 64 152 68 L142 90 C140 94 136 94 133 91 L129 86 L131 214 C131 218 128 220 124 220 L76 220 C72 220 69 218 69 214 L71 86 L67 91 C64 94 60 94 58 90 L48 68 C46 64 46 60 50 58 Z',
    seams: [
      'M100 40 L100 96',
      'M84 46 C92 56 108 56 116 46',
      'M72 150 L128 150',
    ],
    ground: { cy: 224, rx: 44 },
  },
  saree: {
    body: 'M56 46 C80 34 120 34 146 46 L138 96 C148 138 146 186 138 222 C120 228 80 228 62 222 C56 186 54 138 64 96 Z',
    seams: [
      'M72 52 C88 108 92 170 84 222',
      'M120 50 C112 110 116 172 126 220',
      'M60 128 C90 120 116 120 142 128',
    ],
    ground: { cy: 226, rx: 46 },
  },
  lehenga: {
    body: 'M80 42 C88 36 112 36 120 42 L126 76 C128 82 126 86 122 88 L78 88 C74 86 72 82 74 76 Z M76 96 L124 96 L156 216 C158 222 154 226 148 226 L52 226 C46 226 42 222 44 216 Z',
    seams: [
      'M100 96 L100 226',
      'M84 98 L66 224',
      'M116 98 L134 224',
    ],
    ground: { cy: 230, rx: 54 },
  },
  dress: {
    body: 'M76 44 C84 38 92 36 100 36 C108 36 116 38 124 44 L144 56 C148 58 148 62 146 66 L138 84 C136 88 132 88 130 85 L126 80 L124 104 L146 218 C147 223 144 226 139 226 L61 226 C56 226 53 223 54 218 L76 104 L74 80 L70 85 C68 88 64 88 62 84 L54 66 C52 62 52 58 56 56 Z',
    seams: [
      'M100 38 L100 104',
      'M76 104 L124 104',
    ],
    ground: { cy: 230, rx: 48 },
  },
  top: {
    body: 'M72 46 C82 40 90 38 100 38 C110 38 118 40 128 46 L152 60 C156 62 156 66 154 70 L144 92 C142 96 138 96 135 93 L130 87 L130 168 C130 173 127 176 122 176 L78 176 C73 176 70 173 70 168 L70 87 L65 93 C62 96 58 96 56 92 L46 70 C44 66 44 62 48 60 Z',
    seams: ['M86 46 C93 54 107 54 114 46'],
    ground: { cy: 180, rx: 40 },
  },
  shirt: {
    body: 'M74 46 L100 60 L126 46 L152 58 C156 60 156 64 154 68 L144 92 C142 96 138 96 135 93 L131 88 L131 216 C131 221 128 224 123 224 L77 224 C72 224 69 221 69 216 L69 88 L65 93 C62 96 58 96 56 92 L46 68 C44 64 44 60 48 58 Z',
    seams: [
      'M100 60 L100 224',
      'M94 62 L94 224',
      'M106 62 L106 224',
      'M69 150 L131 150',
    ],
    pieces: [
      // Collar
      { d: 'M74 46 L100 60 L126 46 L118 40 L100 50 L82 40 Z', shade: -0.14 },
    ],
    ground: { cy: 228, rx: 44 },
  },
  tshirt: {
    body: 'M70 48 C80 42 88 40 100 40 C112 40 120 42 130 48 L158 66 C162 68 162 72 160 76 L148 98 C146 102 142 102 139 99 L133 92 L133 200 C133 205 130 208 125 208 L75 208 C70 208 67 205 67 200 L67 92 L61 99 C58 102 54 102 52 98 L40 76 C38 72 38 68 42 66 Z',
    seams: ['M84 48 C92 58 108 58 116 48'],
    pieces: [{ d: 'M84 48 C92 58 108 58 116 48 L114 42 C108 50 92 50 86 42 Z', shade: -0.16 }],
    ground: { cy: 212, rx: 44 },
  },
  jeans: {
    body: 'M68 42 L132 42 L136 74 L138 128 C139 168 136 200 133 222 C132 226 129 227 125 227 L110 227 C106 227 104 225 104 221 L100 146 L96 221 C96 225 94 227 90 227 L75 227 C71 227 68 226 67 222 C64 200 61 168 62 128 L64 74 Z',
    seams: [
      'M100 42 L100 140',
      'M68 62 L132 62',
      'M72 74 L74 96',
      'M128 74 L126 96',
    ],
    pieces: [{ d: 'M68 42 L132 42 L133 60 L67 60 Z', shade: -0.1 }],
    ground: { cy: 231, rx: 44 },
  },
  jacket: {
    body: 'M74 44 L100 58 L126 44 L150 56 C154 58 154 62 152 66 L142 90 C140 94 136 94 133 91 L130 86 L130 212 C130 217 127 220 122 220 L78 220 C73 220 70 217 70 212 L70 86 L67 91 C64 94 60 94 58 90 L48 66 C46 62 46 58 50 56 Z',
    seams: ['M100 58 L100 220', 'M88 66 L88 212', 'M112 66 L112 212'],
    pieces: [{ d: 'M74 44 L100 58 L126 44 L120 38 L100 48 L80 38 Z', shade: -0.18 }],
    ground: { cy: 224, rx: 42 },
  },
  shoe: {
    body: 'M42 178 C50 152 66 138 88 140 C104 141 114 150 126 160 C136 168 148 172 158 174 C166 176 168 186 162 190 L50 190 C42 190 38 186 42 178 Z',
    seams: ['M42 178 C70 170 120 172 162 182'],
    pieces: [{ d: 'M40 186 L164 186 C168 186 168 194 162 194 L46 194 C40 194 36 186 40 186 Z', shade: -0.3 }],
    ground: { cy: 198, rx: 62 },
  },
  sneaker: {
    body: 'M38 172 C46 146 62 134 84 136 C100 137 110 146 122 156 C132 164 146 168 156 170 C166 172 168 182 160 186 L48 186 C38 186 34 180 38 172 Z',
    seams: ['M60 142 L72 168', 'M78 138 L88 166', 'M96 142 L104 168'],
    pieces: [
      { d: 'M34 182 L166 182 C172 182 172 194 164 194 L44 194 C34 194 30 182 34 182 Z', shade: 0.55 },
    ],
    ground: { cy: 198, rx: 64 },
  },
  bag: {
    body: 'M58 94 C58 90 61 88 65 88 L135 88 C139 88 142 90 142 94 L150 214 C150 219 147 222 142 222 L58 222 C53 222 50 219 50 214 Z',
    seams: ['M50 128 L150 128'],
    pieces: [
      { d: 'M82 90 C82 60 86 48 100 48 C114 48 118 60 118 90 L112 90 C112 66 109 56 100 56 C91 56 88 66 88 90 Z', shade: -0.24 },
    ],
    ground: { cy: 226, rx: 48 },
  },
  jewellery: {
    body: 'M100 58 A11 11 0 1 1 99.9 58 Z M100 82 C92 96 84 112 84 126 A16 16 0 0 0 116 126 C116 112 108 96 100 82 Z',
    seams: ['M100 90 L100 140'],
    pieces: [{ d: 'M86 124 A14 14 0 0 0 114 124 A14 14 0 0 0 86 124 Z', shade: 0.4 }],
    ground: { cy: 152, rx: 22 },
  },
  bottle: {
    body: 'M90 40 L110 40 L110 68 C128 78 132 92 132 108 L132 208 C132 214 128 218 122 218 L78 218 C72 218 68 214 68 208 L68 108 C68 92 72 78 90 68 Z',
    seams: ['M68 118 L132 118', 'M68 176 L132 176'],
    pieces: [{ d: 'M88 30 L112 30 L112 44 L88 44 Z', shade: -0.3 }],
    ground: { cy: 222, rx: 40 },
  },
  linen: {
    body: 'M42 74 C70 66 130 66 158 74 L158 198 C130 208 70 208 42 198 Z',
    seams: [
      'M42 106 C70 98 130 98 158 106',
      'M42 138 C70 130 130 130 158 138',
      'M42 170 C70 162 130 162 158 170',
    ],
    ground: { cy: 208, rx: 60 },
  },
  generic: {
    body: 'M60 60 C60 56 63 54 67 54 L133 54 C137 54 140 56 140 60 L140 200 C140 204 137 206 133 206 L67 206 C63 206 60 204 60 200 Z',
    ground: { cy: 210, rx: 44 },
  },
};

/* -------------------------------------------------------------- weaves */

/** Material texture. Keyed loosely off the silhouette, varied by seed. */
function weave(id: string, stroke: string, kind: number): string {
  switch (kind % 4) {
    case 0: // twill / denim
      return `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(24)">
        <line x1="0" y1="0" x2="0" y2="6" stroke="${stroke}" stroke-width="1.1" opacity="0.28"/>
      </pattern>`;
    case 1: // knit / jersey
      return `<pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse">
        <path d="M0 3.5 Q1.75 0 3.5 3.5 T7 3.5" fill="none" stroke="${stroke}" stroke-width="0.7" opacity="0.3"/>
      </pattern>`;
    case 2: // fine weave / poplin
      return `<pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse">
        <path d="M0 0 H5 M0 0 V5" stroke="${stroke}" stroke-width="0.55" opacity="0.26"/>
      </pattern>`;
    default: // grain / leather
      return `<pattern id="${id}" width="9" height="9" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.7" fill="${stroke}" opacity="0.22"/>
        <circle cx="6.5" cy="5" r="0.55" fill="${stroke}" opacity="0.18"/>
        <circle cx="3.5" cy="7" r="0.6" fill="${stroke}" opacity="0.2"/>
      </pattern>`;
  }
}

/* ------------------------------------------------------------- product */

function productSvg(shape: MediaShape, colorToken: string, view: number, key: string): string {
  const def = COLOR_BY_VALUE.get(colorToken);
  const garment = def?.hex ?? '#8F2C5B';
  const seed = hashString(`${key}:${colorToken}`);
  const viewSeed = hashString(`${key}:${view}`);

  const paper = PAPERS[seed % PAPERS.length]!;
  const paperTop = mix(paper, '#ffffff', 0.55);
  const paperBottom = mix(paper, INK, 0.1);

  const light = luminance(garment);
  // A near-white garment needs its highlight pulled back or it disappears into
  // the paper; a near-black one needs more lift or it reads as a hole.
  const highlight = mix(garment, '#ffffff', light > 0.8 ? 0.14 : light < 0.15 ? 0.42 : 0.3);
  const shade = mix(garment, INK, light < 0.15 ? 0.3 : 0.42);
  const rim = mix(garment, INK, 0.55);

  const sil = SHAPES[shape] ?? SHAPES.generic;
  const ground = sil.ground ?? { cy: 222, rx: 46 };

  // Framing: the primary shot is the full garment, later views move closer, and
  // one is a fabric macro. This is how a real gallery is sequenced.
  const frames = [
    { zoom: 1.0, y: 0 },
    { zoom: 1.1, y: -6 },
    { zoom: 2.3, y: -34 },
    { zoom: 1.18, y: -10 },
    { zoom: 0.92, y: 6 },
  ];
  const frame = frames[view % frames.length]!;
  const tilt = ((viewSeed % 7) - 3) * 0.35;

  const uid = `g${(seed % 99991).toString(36)}${view}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" width="900" height="1170" role="img">
  <defs>
    <linearGradient id="${uid}p" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${paperTop}"/>
      <stop offset="0.62" stop-color="${paper}"/>
      <stop offset="1" stop-color="${paperBottom}"/>
    </linearGradient>

    <radialGradient id="${uid}s" cx="0.5" cy="0.36" r="0.62">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>

    <linearGradient id="${uid}f" x1="0.18" y1="0" x2="0.86" y2="1">
      <stop offset="0" stop-color="${highlight}"/>
      <stop offset="0.44" stop-color="${garment}"/>
      <stop offset="1" stop-color="${shade}"/>
    </linearGradient>

    <radialGradient id="${uid}c" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${INK}" stop-opacity="0.3"/>
      <stop offset="0.65" stop-color="${INK}" stop-opacity="0.09"/>
      <stop offset="1" stop-color="${INK}" stop-opacity="0"/>
    </radialGradient>

    ${weave(`${uid}w`, shade, seed)}
  </defs>

  <rect width="200" height="260" fill="url(#${uid}p)"/>
  <rect width="200" height="260" fill="url(#${uid}s)"/>

  <g transform="translate(100 ${126 + frame.y}) scale(${frame.zoom.toFixed(3)}) rotate(${tilt.toFixed(2)}) translate(-100 -126)">
    <ellipse cx="100" cy="${ground.cy}" rx="${ground.rx}" ry="7" fill="url(#${uid}c)"/>

    <path d="${sil.body}" fill="url(#${uid}f)" stroke="${rim}" stroke-width="0.9" stroke-linejoin="round"/>
    <path d="${sil.body}" fill="url(#${uid}w)"/>

    ${(sil.pieces ?? [])
      .map(
        (piece) =>
          `<path d="${piece.d}" fill="${
            piece.shade >= 0 ? mix(garment, '#ffffff', piece.shade) : mix(garment, INK, -piece.shade)
          }" stroke="${rim}" stroke-width="0.7" stroke-linejoin="round"/>`,
      )
      .join('')}

    ${(sil.seams ?? [])
      .map(
        (seam) =>
          `<path d="${seam}" fill="none" stroke="${rim}" stroke-width="0.55" stroke-dasharray="2.4 2" opacity="0.5"/>`,
      )
      .join('')}
  </g>
</svg>`;
}

/* ----------------------------------------------------------------- tile */

/**
 * Category tiles, brand marks, avatars and banners.
 *
 * Each kind gets a different composition, and the hue is derived from the KEY
 * rather than passed in, so twelve category tiles are twelve different images
 * instead of twelve identical circles.
 */
function tileSvg(kind: string, colorToken: string, key: string): string {
  const seed = hashString(key);
  const explicit = COLOR_BY_VALUE.get(colorToken)?.hex;

  // A curated spread, indexed by the key: neighbouring tiles never collide.
  const palette = [
    '#6D2650', '#33456E', '#1E4D3B', '#B4552B', '#146B6B',
    '#A97C3F', '#5B2140', '#2B5BC4', '#9C3A2E', '#43264A',
    '#6B6B3A', '#8F2C5B',
  ];
  const base = explicit && colorToken !== 'mulberry' ? explicit : palette[seed % palette.length]!;

  const wide = kind === 'hero' || kind === 'hero-m' || kind === 'banner' || kind === 'grid';
  const w = wide ? 1600 : 640;
  const h = kind === 'hero-m' ? 1200 : wide ? 900 : 640;
  const vbW = 100;
  const vbH = wide ? (kind === 'hero-m' ? 75 : 56) : 100;

  const deep = mix(base, INK, 0.42);
  const lift = mix(base, '#ffffff', 0.3);
  const uid = `t${(seed % 99991).toString(36)}`;

  // Three overlapping soft fields give depth without looking like a gradient
  // preset; their positions are seeded so no two tiles compose alike.
  const blobs = Array.from({ length: 3 }, (_, i) => {
    const s = seed >> (i * 6);
    const cx = 12 + (s % 76);
    const cy = 8 + ((s >> 3) % Math.max(1, vbH - 16));
    const r = 22 + ((s >> 6) % 34);
    const fill = i === 0 ? lift : i === 1 ? deep : mix(base, '#ffffff', 0.12);
    const op = i === 1 ? 0.5 : 0.34;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${op}"/>`;
  }).join('');

  const initials = key
    .split('-')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

  const showInitials = kind === 'brand' || kind === 'avatar';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="${w}" height="${h}" role="img" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="${uid}b" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="${mix(base, '#ffffff', 0.1)}"/>
      <stop offset="1" stop-color="${deep}"/>
    </linearGradient>
    <filter id="${uid}s" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
    <linearGradient id="${uid}v" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.3"/>
    </linearGradient>
  </defs>

  <rect width="${vbW}" height="${vbH}" fill="url(#${uid}b)"/>
  <g filter="url(#${uid}s)">${blobs}</g>
  <rect width="${vbW}" height="${vbH}" fill="url(#${uid}v)"/>
  ${
    showInitials
      ? `<text x="${vbW / 2}" y="${vbH / 2 + (wide ? 4 : 7)}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${wide ? 12 : 26}" font-weight="600" fill="#ffffff" opacity="0.92">${initials}</text>`
      : ''
  }
</svg>`;
}

/* ---------------------------------------------------------------- route */

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
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
