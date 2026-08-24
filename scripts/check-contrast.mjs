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

/** Which palette step each semantic text token resolves to. */
function resolve(name) {
  const match = css.match(new RegExp(`--${name}:\\s*var\\(--color-(bone-[\\w]+)\\)`));
  return match ? match[1] : null;
}

/** Surfaces text actually sits on, lightest first — the hardest case wins. */
const SURFACES = ['bone-0', 'bone-25', 'bone-50', 'bone-100'];

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

/** Darkest hex on the bone hue that clears `target` on the lightest surface. */
function solveFor(target, surface, hue = [128, 122, 110]) {
  // Walk the hue towards black in 1% steps and take the first passing step, so
  // the result stays on-brand rather than defaulting to grey.
  for (let step = 0; step <= 100; step++) {
    const factor = 1 - step / 100;
    const rgb = hue.map((component) => Math.round(component * factor));
    const hex = `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    if (contrast(hex, PALETTE[surface]) >= target) return { hex, ratio: contrast(hex, PALETTE[surface]) };
  }
  return { hex: '#000000', ratio: 21 };
}

const CHECKS = ['text-primary', 'text-secondary', 'text-tertiary'];

console.log('\n  Token contrast against light surfaces (need 4.5:1)\n');

let failed = 0;

for (const name of CHECKS) {
  const token = resolve(name);
  if (!token || !PALETTE[token]) {
    console.log(`  SKIP  ${name} — could not resolve from tokens.css`);
    continue;
  }
  const hex = PALETTE[token];
  const worst = SURFACES.reduce(
    (acc, surface) => {
      const ratio = contrast(hex, PALETTE[surface]);
      return ratio < acc.ratio ? { surface, ratio } : acc;
    },
    { surface: '', ratio: Infinity },
  );

  const ok = worst.ratio >= 4.5;
  if (!ok) failed += 1;

  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(16)} ${token.padEnd(9)} ${hex}  ` +
      `${worst.ratio.toFixed(2)}:1 on ${worst.surface}`,
  );

  if (!ok) {
    const fix = solveFor(4.5, 'bone-100');
    console.log(`        -> ${fix.hex} would give ${fix.ratio.toFixed(2)}:1`);
  }
}

console.log('');
process.exitCode = failed > 0 ? 1 : 0;
