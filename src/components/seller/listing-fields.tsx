'use client';

import { X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useId, useState } from 'react';

/**
 * Form primitives for the listing editor.
 *
 * Small on purpose. They exist so that every field in a very long form gets
 * the same label association, the same hint placement and the same spacing —
 * which is the difference between a form that reads as one thing and one that
 * reads as a pile of inputs.
 */

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card as="section">
      <header className="mb-4">
        <h2 className="text-ink text-md font-semibold">{title}</h2>
        {description ? <p className="text-muted mt-0.5 text-sm">{description}</p> : null}
      </header>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

/**
 * A labelled field.
 *
 * The label wraps the control rather than using `htmlFor`, so it associates
 * correctly whatever is passed as `children` — including the tag input and the
 * button groups, which have no single focusable element to point an id at.
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-ink block text-xs font-medium">{label}</span>
      {/*
        The hint and the error are marked `aria-hidden` because this is a
        WRAPPING label: everything inside it becomes part of the control's
        accessible name, so a two-line hint would be read out as the field's
        name. They stay visible to sighted users; the name stays just the label.
      */}
      {hint ? (
        <span aria-hidden className="text-faint mt-0.5 block text-2xs">
          {hint}
        </span>
      ) : null}
      <span className="mt-1.5 block">{children}</span>
      {error ? (
        <span role="alert" className="text-danger-600 mt-1 block text-2xs">
          {error}
        </span>
      ) : null}
    </label>
  );
}

/**
 * A list of short strings, entered one at a time.
 *
 * Enter commits; Backspace on an empty field removes the last one, which is
 * the behaviour anyone who has used a tag field expects and the thing that
 * makes it faster than a textarea of comma-separated values.
 */
export function TagInput({
  values,
  onChange,
  max = 10,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  max?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const id = useId();

  const commit = () => {
    const value = draft.trim();
    if (!value) return;
    if (values.length >= max) return;
    if (values.includes(value)) {
      setDraft('');
      return;
    }
    onChange([...values, value]);
    setDraft('');
  };

  return (
    <span className="block">
      {values.length > 0 ? (
        <span className="mb-1.5 flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span
              key={value}
              className="border-line-strong text-ink inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-2xs"
            >
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter((entry) => entry !== value))}
                aria-label={`Remove ${value}`}
                className="text-faint hover:text-danger-600"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </span>
      ) : null}

      <input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Backspace' && !draft && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={commit}
        disabled={values.length >= max}
        placeholder={values.length >= max ? `Maximum ${max}` : placeholder}
        className="border-line-strong bg-canvas text-ink placeholder:text-faint h-9 w-full rounded-sm border px-2.5 text-sm disabled:cursor-not-allowed"
      />
    </span>
  );
}
