'use client';

import { Search, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * Pick several from a long list: search, tick, and see what is picked as
 * removable chips above the list. Built for "which categories" -- a few
 * hundred options, of which a coupon usually wants two or three.
 */
export function TargetPicker({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(value), [value]);
  const labelOf = (key: string) => options.find((option) => option.value === key)?.label.replace(/^(— )+/, '') ?? key;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((option) => option.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const toggle = (key: string) =>
    onChange(selected.has(key) ? value.filter((item) => item !== key) : [...value, key]);

  return (
    <div className="space-y-2">
      <p id={`${id}-label`} className="text-ink text-sm font-medium">
        {label} <span className="text-faint font-normal">· {value.length} chosen</span>
      </p>

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={`Chosen ${label.toLowerCase()}`}>
          {value.map((key) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => toggle(key)}
                className="bg-accent/10 text-accent-ink hover:bg-accent/20 inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1.5 text-xs font-medium"
                aria-label={`Remove ${labelOf(key)}`}
              >
                {labelOf(key)}
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={cn('border-line rounded-md border', error && 'border-danger-600')}>
        <label className="border-line flex items-center gap-2 border-b px-2.5">
          <Search className="text-faint size-4 shrink-0" aria-hidden />
          <span className="sr-only">Search {label.toLowerCase()}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}`}
            className="text-ink placeholder:text-faint h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <ul role="group" aria-labelledby={`${id}-label`} className="max-h-56 overflow-y-auto py-1">
          {shown.length === 0 ? (
            <li className="text-muted px-3 py-2 text-xs">Nothing matches “{query}”.</li>
          ) : (
            shown.map((option) => (
              <li key={option.value}>
                <label className="hover:bg-sunken flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(option.value)}
                    onChange={() => toggle(option.value)}
                    className="accent-ink size-4"
                  />
                  <span className="text-ink truncate">{option.label}</span>
                </label>
              </li>
            ))
          )}
        </ul>
      </div>
      {error ? (
        <p className="text-danger-600 text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
