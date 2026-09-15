'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Input, type InputProps } from '@/components/ui/input';
import { passwordStrength } from '@/domain/password-strength';

export function PasswordInput({ strength = false, ...props }: InputProps & { strength?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState('');
  const result = passwordStrength(value);
  return <div>
    <Input {...props} type={visible ? 'text' : 'password'} className="pr-14 text-base sm:text-sm"
      onChange={(event) => { setValue(event.target.value); props.onChange?.(event); }}
      trailing={<button type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}
        className="grid size-11 place-items-center rounded-md" onClick={() => setVisible(!visible)}>
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>} />
    {strength && value.length > 0 ? <div className="mt-2 space-y-1.5" aria-live="polite">
      <div className="flex gap-1" role="meter" aria-label="Password strength" aria-valuemin={0} aria-valuemax={4} aria-valuenow={result.score} aria-valuetext={result.label}>
        {[1, 2, 3, 4].map((n) => <span key={n} className={`h-1 flex-1 rounded-full ${n <= result.score ? 'bg-accent' : 'bg-line'}`} />)}
      </div>
      <p className="text-muted text-xs">{result.label}. {result.hint}</p>
    </div> : null}
  </div>;
}
