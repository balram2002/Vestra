'use client';

import {
  isTheme,
  resolveSystemTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type Theme,
} from '@/lib/theme';

/**
 * The theme, as an external store.
 *
 * It genuinely lives outside React: in a `data-theme` attribute set before
 * React existed, in `localStorage`, and in a media query the operating system
 * owns. `useSyncExternalStore` is the primitive for exactly that shape, and it
 * is why this is a store rather than a `useState` synchronised by an effect —
 * the effect version paints one value and then corrects it.
 *
 * Snapshots are primitives, so React's equality check does the right thing
 * without any memoisation.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Cached so a snapshot never has to touch storage on every render. */
let choice: Theme = 'system';
let resolved: ResolvedTheme = 'light';
let started = false;

function readStored(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : 'system';
  } catch {
    // Storage blocked in a private window. Following the device is the best
    // available default, and it still works — it just is not remembered.
    return 'system';
  }
}

function paint(next: ResolvedTheme): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', next);
  /*
   * `color-scheme` is what makes the browser's own furniture match — form
   * controls, scrollbars, the space behind an overscroll. Without it a dark
   * page keeps light scrollbars and the seams show.
   */
  root.style.colorScheme = next;
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** Adopt what the inline script already decided, rather than deciding again. */
function start(): void {
  if (started) return;
  started = true;

  choice = readStored();
  resolved =
    (document.documentElement.getAttribute('data-theme') as ResolvedTheme | null) ??
    resolveSystemTheme();
}

export function subscribe(listener: Listener): () => void {
  start();
  listeners.add(listener);

  const query = window.matchMedia('(prefers-color-scheme: dark)');

  // Follow the device, but only while `system` is the choice.
  const onSystemChange = () => {
    if (choice !== 'system') return;
    resolved = query.matches ? 'dark' : 'light';
    paint(resolved);
    emit();
  };

  /*
   * Another tab changed the theme. Two windows of the same shop showing
   * different themes is the kind of small wrongness that reads as a bug.
   */
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    choice = readStored();
    resolved = choice === 'system' ? resolveSystemTheme() : choice;
    paint(resolved);
    emit();
  };

  query.addEventListener('change', onSystemChange);
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    query.removeEventListener('change', onSystemChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function getThemeSnapshot(): Theme {
  start();
  return choice;
}

export function getResolvedSnapshot(): ResolvedTheme {
  start();
  return resolved;
}

/**
 * The server has no device to ask and no storage to read.
 *
 * `system` is the honest answer, and the controls render nothing as selected
 * until hydration rather than guessing — see `hydrated` in the provider.
 */
export function getServerThemeSnapshot(): Theme {
  return 'system';
}

export function getServerResolvedSnapshot(): ResolvedTheme {
  return 'light';
}

export function setTheme(next: Theme): void {
  start();
  choice = next;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // See `readStored`. The choice still applies to this page.
  }

  resolved = next === 'system' ? resolveSystemTheme() : next;
  paint(resolved);
  emit();
}
