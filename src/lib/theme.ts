/**
 * Theme selection.
 *
 * Three choices, and only two outcomes: `system` is not a third look, it is a
 * standing instruction to follow the device. So the resolved value is always
 * `light` or `dark`, and that is what reaches the DOM.
 *
 * Resolving `system` in JavaScript rather than in a CSS media query is a
 * deliberate trade. It means the stylesheet declares the dark palette exactly
 * once, under one selector, instead of repeating every assignment inside
 * `@media (prefers-color-scheme: dark)` — and a palette written twice is a
 * palette that drifts. The cost is that with JavaScript disabled the page
 * stays light, which is a legible page rather than a broken one.
 */

export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

/** What actually gets painted. `system` resolves to one of these. */
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'meridian-theme';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * The script that runs before the first paint.
 *
 * Inlined into `<head>` and deliberately synchronous: anything asynchronous —
 * an effect, a deferred script, a hydration pass — happens after the browser
 * has already painted, and the result is the white flash that makes a dark
 * theme feel broken every single time the page loads.
 *
 * Written as a string because it has to be in the document before React
 * exists. Kept small and total: any failure falls back to light rather than
 * throwing inside `<head>`, where an exception would stop the parser.
 *
 * It also stamps `js` on `<html>`, which is the hook that lets CSS know
 * scripting is available. `ui/reveal` uses it: an element that starts at
 * `opacity: 0` in the markup is invisible to anyone without JavaScript, and
 * invisible FOREVER if the observer never runs. Gating the hidden state on
 * `html.js` means the failure mode is "the content is simply there", which is
 * the correct one.
 */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var choice = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    var resolved = choice === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : choice;
    var root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    root.style.colorScheme = resolved;
    root.classList.add('js');
  } catch (error) {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.add('js');
  }
})();
`.trim();

/** What `system` means right now. Safe to call on the server, where it is light. */
export function resolveSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? resolveSystemTheme() : theme;
}

/** The label shown in the switcher. */
export const THEME_LABEL: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};
