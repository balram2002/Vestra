'use client';

import { cn } from '@/lib/cn';

import { Field, controlClasses, controlTone, useField } from './field';

/**
 * A one-time code field.
 *
 * ONE INPUT, NOT SIX BOXES. Six boxes break the three things that make codes
 * painless: pasting a whole code, the "from Mail" suggestion a phone offers
 * above its keyboard (`autocomplete="one-time-code"`), and password managers.
 * Each of those fills ONE field. The digits are spaced out instead, so it still
 * reads as a code.
 *
 * Anything that is not a digit is dropped as it arrives, which is also why
 * there is no `maxLength`: a pasted "123 456" is seven characters, and cutting
 * it at six would lose the last digit before the space could be removed.
 *
 * `onComplete` fires when the last digit lands, so nobody has to find a button
 * on a phone whose keyboard is covering it.
 */

interface CodeInputProps {
  label: string;
  value: string;
  onValueChange: (digits: string) => void;
  onComplete?: (digits: string) => void;
  length?: number;
  hint?: string;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  name?: string;
}

function CodeControl({
  value,
  onValueChange,
  onComplete,
  length,
  disabled,
  autoFocus,
  name,
}: Omit<CodeInputProps, 'label' | 'hint' | 'error'> & { length: number }) {
  const field = useField();

  return (
    <input
      id={field.id}
      name={name}
      aria-invalid={field.invalid || undefined}
      aria-describedby={field.describedBy}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      enterKeyHint="done"
      spellCheck={false}
      autoFocus={autoFocus}
      disabled={disabled}
      placeholder={'•'.repeat(length)}
      value={value}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, '').slice(0, length);
        onValueChange(digits);
        if (digits.length === length && digits !== value) onComplete?.(digits);
      }}
      className={cn(
        controlClasses,
        controlTone(field.invalid),
        // The trailing letter-space would push the digits off centre; the
        // matching left padding puts them back.
        'h-14 pl-[0.55em] text-center font-mono text-2xl tabular-nums tracking-[0.55em]',
        'placeholder:tracking-[0.55em]',
      )}
    />
  );
}

export function CodeInput({ label, hint, error, length = 6, ...props }: CodeInputProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      <CodeControl length={length} {...props} />
    </Field>
  );
}
