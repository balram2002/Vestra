'use client';

import { useSyncExternalStore } from 'react';

import type { ResolvedTheme, Theme } from '@/lib/theme';

import {
  getResolvedSnapshot,
  getServerResolvedSnapshot,
  getServerThemeSnapshot,
  getThemeSnapshot,
  setTheme as write,
  subscribe,
} from './theme-store';

/**
 * Theme state for the UI.
 *
 * The DOM is already correct before any of this runs — the inline script in
 * `<head>` saw to that. This exists so a control can SHOW which mode is active
 * and change it, not to apply it in the first place.
 *
 * There is no provider and no context, because there is no state to hold: the
 * theme lives in `theme-store.ts`, outside React. Any component that needs it
 * subscribes directly, so a second switcher elsewhere costs nothing and cannot
 * drift from the first.
 *
 * `useSyncExternalStore` also settles the hydration question on its own. The
 * server snapshot is used for the server render and the first client render,
 * then React re-renders with the real value in the same commit as hydration —
 * so no control is ever marked selected on a value the server invented.
 */

export interface ThemeState {
  /** What the person chose, including `system`. */
  theme: Theme;
  /** What is actually painted right now. */
  resolved: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

export function useTheme(): ThemeState {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, getServerThemeSnapshot);
  const resolved = useSyncExternalStore(
    subscribe,
    getResolvedSnapshot,
    getServerResolvedSnapshot,
  );

  return { theme, resolved, setTheme: write };
}
