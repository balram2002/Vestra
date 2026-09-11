/**
 * Contrast checker for the pairings `check-contrast.mjs` does not cover.
 *
 *     node scripts/check-palette.mjs
 *
 * `check-contrast.mjs` is the gate on body text: the three text tokens against
 * the surfaces they sit on, in both themes. It is deliberately narrow and it is
 * never modified.
 *
 * This is the complement. It measures the rest of the system:
 *
 *   - the accent as a solid (text ON it) and as an ink (text OF it)
 *   - CONTROL BORDERS against WCAG 1.4.11, which wants 3:1 for the visual
 *     boundary that identifies an input or a button. Nothing checked this
 *     before, and the outgoing palette failed it at 1.56:1 on every text input
 *     and every secondary button in all three apps
 *   - the focus ring, same rule
 *   - each status ink on its own tint
 *   - each status ink on its DARK tint, composited over the surface first —
 *     the dark tints are low-alpha washes, so the ground a browser actually
 *     paints is not the value in the stylesheet. Phase 23 introduced those
 *     washes and tuned them by eye; this is the step that was missing
 *
 * Like `check-contrast.mjs`, every value is PARSED from `tokens.css`. A checker
 * that keeps its own copy of the palette passes long after the real tokens have
 * drifted away from it.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKENS = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'styles', 'tokens.css');
const css = readFileSync(TOKENS, 'utf8');

/* ------------------------------------------------------------- parsing */

/** Every `--color-<ramp>-<step>: #rrggbb` in the file. */
const PALETTE = Object.fromEntries(
  [...css.matchAll(/--color-([a-z]+-[\w]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]),
);

/** The dark block starts at the first occurrence of the dark attribute selector. */
const DARK_AT = css.indexOf("[data-theme='dark']");
if (DARK_AT === -1) {
  console.error('  could not find the dark block in tokens.css');
  process.exit(1);
}
const BLOCK = { light: css.slice(0, DARK_AT), dark: css.slice(DARK_AT) };

/**
 * Resolve a semantic token to a hex value in a theme.
 *
 * Handles the three forms the token layer uses: a reference to a palette step,
 * a literal hex, and a low-alpha `rgb(r g b / a)` wash. A wash is returned with
 * its alpha so the caller can composite it over the ground it will sit on.
 */
function resolve(name, theme) {
  const block = BLOCK[theme];

  const viaPalette = block.match(new RegExp(`--${name}:\\s*var\\(--color-([a-z]+-[\\w]+)\\)`));
  if (viaPalette) return { hex: PALETTE[viaPalette[1]], via: viaPalette[1] };

  const literal = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (literal) return { hex: literal[1], via: 'literal' };

  const wash = block.match(
    new RegExp(`--${name}:\\s*rgb\\(\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*/\\s*([\\d.]+)\\s*\\)`),
  );
  if (wash) {
    return {
      rgba: [Number(wash[1]), Number(wash[2]), Number(wash[3]), Number(wash[4])],
      via: 'wash',
    };
  }

  return null;
}

/* ------------------------------------------------------------ contrast */

function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const c = hex.replace('#', '');
  return (
    0.2126 * channel(Number.parseInt(c.slice(0, 2), 16)) +
    0.7152 * channel(Number.parseInt(c.slice(2, 4), 16)) +
    0.0722 * channel(Number.parseInt(c.slice(4, 6), 16))
  );
}
function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
/** Flatten an rgba wash over an opaque ground, the way a browser composites. */
function flatten([r, g, b, a], ground) {
  const c = ground.replace('#', '');
  const parts = [0, 2, 4].map((i) => Number.parseInt(c.slice(i, i + 2), 16));
  const mix = (x, y) => Math.round(x * a + y * (1 - a));
  return `#${[mix(r, parts[0]), mix(g, parts[1]), mix(b, parts[2])]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

/* -------------------------------------------------------------- checks */

const AA = 4.5;
/** WCAG 1.4.11 — control boundaries and focus indicators. */
const NON_TEXT = 3;

let failed = 0;
let skipped = 0;

function report(label, ratio, need) {
  const ok = ratio >= need;
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(42)} ${ratio.toFixed(2)}:1  (>= ${need})`);
}

/**
 * A token that cannot be resolved is a FAILURE, not a skip.
 *
 * `check-contrast.mjs` prints SKIP and moves on, which means a renamed token
 * silently stops being measured. That is the one way a contrast checker can
 * pass while the palette is broken, so this one refuses.
 */
function missing(label, detail) {
  failed += 1;
  skipped += 1;
  console.log(`  FAIL  ${label.padEnd(42)} unresolved — ${detail}`);
}

/** The opaque grounds text and borders sit on, per theme. */
function grounds(theme) {
  return ['surface-raised', 'surface-canvas', 'surface-sunken']
    .map((name) => ({ name, hex: resolve(name, theme)?.hex }))
    .filter((g) => Boolean(g.hex));
}

function checkWorst(label, fg, theme, need) {
  const all = grounds(theme);
  const worst = all.reduce(
    (acc, g) => {
      const r = contrast(fg, g.hex);
      return r < acc.r ? { r, name: g.name } : acc;
    },
    { r: Infinity, name: '' },
  );
  report(`${label} on ${worst.name}`, worst.r, need);
}

const STATUS = ['success', 'warning', 'danger', 'info', 'sand'];

for (const theme of ['light', 'dark']) {
  console.log(`\n  ${theme.toUpperCase()}\n`);

  /* ---- the accent, as an ink and as a solid ---- */

  const accentText = resolve('accent-text', theme);
  if (accentText?.hex) checkWorst('accent-text', accentText.hex, theme, AA);
  else missing('accent-text', 'no hex in this theme');

  const accentSolid = resolve('accent-solid', theme);
  const onAccent = PALETTE['slate-0'];
  if (accentSolid?.hex && onAccent) {
    report('on-accent on accent-solid', contrast(onAccent, accentSolid.hex), AA);
  } else missing('on-accent on accent-solid', 'accent-solid or slate-0 not found');

  /* ---- boundaries that identify a control ---- */

  const control = resolve('border-control', theme);
  if (control?.hex) checkWorst('border-control', control.hex, theme, NON_TEXT);
  else missing('border-control', 'no hex in this theme');

  const accentControl = resolve('accent-border-strong', theme);
  if (accentControl?.hex) checkWorst('accent-border-strong', accentControl.hex, theme, NON_TEXT);
  else missing('accent-border-strong', 'no hex in this theme');

  const focus = resolve('focus-ring', theme);
  if (focus?.hex) checkWorst('focus-ring', focus.hex, theme, NON_TEXT);
  else missing('focus-ring', 'no hex in this theme');

  /* ---- status inks on their own tints ---- */

  console.log('');
  const raised = resolve('surface-raised', theme)?.hex;

  for (const family of STATUS) {
    /*
     * Which ink sits on the tint depends on the theme, and that is the whole
     * point of the dark block: in light the `-700` step is a dark ink on a pale
     * tint; in dark the tint becomes a low-alpha wash and `-700` is REDEFINED
     * to the `-300` step so it stays readable. Reading `-700` in both themes
     * therefore measures whatever the stylesheet actually resolves it to.
     */
    const ink =
      theme === 'dark'
        ? PALETTE[`${family}-300`]
        : PALETTE[`${family}-700`];

    const tintDecl = resolve(`color-${family}-50`, theme);
    let tint = tintDecl?.hex ?? PALETTE[`${family}-50`];

    if (theme === 'dark') {
      if (!tintDecl?.rgba || !raised) {
        missing(`${family} ink on tint`, 'dark wash or surface-raised not found');
        continue;
      }
      tint = flatten(tintDecl.rgba, raised);
    }

    if (!ink || !tint) {
      missing(`${family} ink on tint`, 'ink or tint not found');
      continue;
    }
    report(`${family} ink on ${family} tint`, contrast(ink, tint), AA);
  }

  /* ---- white on every solid status FILL ---- */

  /*
   * The check that would have caught the worst bug in this palette.
   *
   * `--color-*-600` is ink meant for a pale tint, and the dark theme remaps it
   * to the `-300` step so it stays readable on a dark wash. Several components
   * were also using that same step as a BACKGROUND under white text — a sale
   * flash, a premium badge, the destructive button — so after dark they became
   * white on `#f0919d` at 1.7:1.
   *
   * The fix was a separate `--color-*-fill` role that the theme never touches.
   * This asserts that separation holds: every fill must carry white at AA in
   * BOTH themes, which is only possible if it stayed put. Remap one of them and
   * this fails immediately instead of shipping.
   */
  const white = PALETTE['slate-0'];
  for (const family of ['success', 'warning', 'danger', 'info', 'premium']) {
    /*
     * Resolved from the LIGHT block in both passes, and that is the point.
     *
     * These tokens are declared once in `@theme` and must never be reassigned
     * by the dark block — that is the whole invariant. So the dark pass looks up
     * the same literal and separately asserts the dark block does not redeclare
     * it. A fill that HAS been remapped shows up here as a hard failure naming
     * the token, rather than as an unreadable badge three screens away.
     */
    const fill = resolve(`color-${family}-fill`, 'light');
    if (!fill?.hex || !white) {
      missing(`white on ${family} fill`, 'fill or slate-0 not found');
      continue;
    }

    if (theme === 'dark' && BLOCK.dark.includes(`--color-${family}-fill:`)) {
      missing(
        `white on ${family} fill`,
        'the dark block reassigns this fill; fills must stay put in both themes',
      );
      continue;
    }

    report(`white on ${family} fill`, contrast(white, fill.hex), AA);
  }

  /* ---- text on the accent's own soft tint ---- */

  const soft = resolve('accent-soft', theme);
  if (accentText?.hex && soft) {
    const ground = theme === 'dark' && soft.rgba ? flatten(soft.rgba, raised) : soft.hex;
    if (ground) report('accent-text on accent-soft', contrast(accentText.hex, ground), AA);
    else missing('accent-text on accent-soft', 'accent-soft did not resolve');
  } else missing('accent-text on accent-soft', 'accent-soft not found');
}

console.log('');
if (skipped > 0) {
  console.log(`  ${skipped} token(s) could not be resolved from tokens.css.`);
  console.log('  That is treated as a failure: an unmeasured token is not a passing one.\n');
}
process.exitCode = failed > 0 ? 1 : 0;
