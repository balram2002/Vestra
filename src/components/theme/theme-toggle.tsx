'use client';

import { Monitor, Moon, Sun } from 'lucide-react';

import { cn } from '@/lib/cn';
import { THEME_LABEL, THEMES, type Theme } from '@/lib/theme';

import { useTheme } from './theme-provider';

const ICON: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/**
 * The theme switcher.
 *
 * A three-way segmented control rather than a two-state toggle, because
 * `system` is a real choice and the commonest one — a toggle forces someone
 * whose phone dims at sunset to pick a side and stop following it.
 *
 * It is a `radiogroup`, which is what it actually is: three mutually exclusive
 * options, one selected. A row of buttons would announce as three unrelated
 * actions and give no way to hear which is active.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        'border-line bg-sunken inline-flex items-center gap-0.5 rounded-full border p-0.5',
        className,
      )}
    >
      {THEMES.map((option) => {
        const Icon = ICON[option];
        const active = theme === option;

        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={THEME_LABEL[option]}
            title={THEME_LABEL[option]}
            onClick={() => setTheme(option)}
            className={cn(
              'grid size-7 place-items-center rounded-full transition-colors',
              'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
              active ? 'bg-raised text-ink shadow-sm' : 'text-faint hover:text-ink',
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

/**
 * A single button that steps light → dark → system.
 *
 * For places with no room for three segments, such as the mobile header. The
 * accessible name says what pressing it will DO, because an icon alone cannot:
 * a moon could equally mean "you are in dark mode" or "switch to dark mode".
 */
export function ThemeToggleCompact({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  const next: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };
  const Icon = ICON[theme];

  return (
    <button
      type="button"
      onClick={() => setTheme(next[theme])}
      aria-label={`Theme: ${THEME_LABEL[theme]}. Switch to ${THEME_LABEL[next[theme]].toLowerCase()}.`}
      title={`Theme: ${THEME_LABEL[theme]}`}
      className={cn(
        'text-muted hover:bg-sunken hover:text-ink grid size-10 place-items-center rounded-full transition-colors',
        'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
        className,
      )}
    >
      <Icon className="size-[1.15rem]" aria-hidden />
    </button>
  );
}
