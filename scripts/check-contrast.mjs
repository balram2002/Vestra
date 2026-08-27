/**
 * WCAG contrast checker for the design tokens.
 *
 *     node scripts/check-contrast.mjs
 *
 * The accessibility audit found 1,030 contrast failures across every route,
 * all traceable to two token values rather than to 1,030 separate mistakes.
 * This computes the ratios directly so the fix is chosen by arithmetic instead
 * of by eye, and so a future palette change can be checked before it ships.
 *
 * Body text needs 4.5:1. Text at 18.66px bold or 24px+ needs 3:1, but nothing
 * in this system relies on that exemption, so everything is held to 4.5.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * The palette is PARSED from tokens.css rather than restated here. A checker
 * that keeps its own copy of the values it checks will pass long after the real
 * tokens have drifted away from it — which is exactly what happened the first
 * time this ran.
 */
const TOKENS = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'styles', 'tokens.css');
const css = readFileSync(TOKENS, 'utf8');

const PALETTE = Object.fromEntries(
  [...css.matchAll(/--color-(bone-[\w]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]),
);

/** Surfaces light-mode text actually sits on — the hardest case wins. */
const SURFACES = ['bone-0', 'bone-25', 'bone-50', 'bone-100'];

/**
 * The slice of the stylesheet that defines one theme.
 *
 * Until dark mode was actually reachable, this checker only ever measured the
 * light palette — so the dark tokens had shipped with contrast nobody had
 * calculated. Splitting on the dark selector is enough because the file
 * declares light first and dark once.
 */
function themeBlock(theme) {
  const start = css.indexOf("[data-theme='dark']");
  if (start === -1) return theme === 'light' ? css : '';
  return theme === 'light' ? css.slice(0, start) : css.slice(start);
}

/**
 * What a semantic token resolves to in a theme.
 *
 * Handles both forms the tokens use: a reference to a palette step, and a
 * literal hex — the dark block uses literals for the surfaces it tunes by hand.
 */
function resolve(name, theme = 'light') {
  const block = themeBlock(theme);

  const viaPalette = block.match(new RegExp(`--${name}:\\s*var\\(--color-(bone-[\\w]+)\\)`));
  if (viaPalette) return { token: viaPalette[1], hex: PALETTE[viaPalette[1]] };

  const literal = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (literal) return { token: 'literal', hex: literal[1] };

  return null;
}

/** The surfaces text sits on in a theme, as name/hex pairs. */
function surfacesFor(theme) {
  if (theme === 'light') {
    return SURFACES.map((name) => ({ name, hex: PALETTE[name] }));
  }

  return ['surface-canvas', 'surface-raised', 'surface-sunken']
    .map((name) => ({ name, hex: resolve(name, 'dark')?.hex ?? null }))
    .filter((surface) => Boolean(surface.hex));
}

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const clean = hex.replace('#', '');
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

const CHECKS = ['text-primary', 'text-secondary', 'text-tertiary'];

let failed = 0;

for (const theme of ['light', 'dark']) {
  console.log(`
  Token contrast in ${theme} (need 4.5:1)
`);

  const surfaces = surfacesFor(theme);

  for (const name of CHECKS) {
    const resolved = resolve(name, theme);
    if (!resolved?.hex) {
      console.log(`  SKIP  ${name} — could not resolve from tokens.css`);
      continue;
    }

    const worst = surfaces.reduce(
      (acc, surface) => {
        const ratio = contrast(resolved.hex, surface.hex);
        return ratio < acc.ratio ? { surface: surface.name, ratio } : acc;
      },
      { surface: '', ratio: Infinity },
    );

    const ok = worst.ratio >= 4.5;
    if (!ok) failed += 1;

    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(16)} ${resolved.hex}  ` +
        `${worst.ratio.toFixed(2)}:1 on ${worst.surface}`,
    );
  }
}

console.log('');
process.exitCode = failed > 0 ? 1 : 0;
