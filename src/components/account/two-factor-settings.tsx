'use client';

import { Shield, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { CodeInput } from '@/components/ui/code-input';
import { cn } from '@/lib/cn';
import {
  confirmTwoFactorChange,
  requestTwoFactorChange,
  resendTwoFactorChangeCode,
} from '@/server/actions/two-factor';

/**
 * Two-step verification, on the profile.
 *
 * Switching it EITHER way asks for a code from the inbox. Turning it on proves
 * the address works before every sign-in starts to depend on it; turning it
 * off must not be possible from a session somebody left open on a shared
 * computer. The code step opens inline, under the switch it belongs to, rather
 * than in a dialog that a phone keyboard would half cover.
 */
export function TwoFactorSettings({ enabled, email }: { enabled: boolean; email: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<'idle' | 'code'>('idle');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [effectiveEnabled, setEffectiveEnabled] = useState(enabled);

  const enable = !effectiveEnabled;

  const request = () =>
    startTransition(async () => {
      setError(null);
      const result = await requestTwoFactorChange({ enable });
      if (!result.ok) {
        setError(result.error ?? 'A code could not be sent.');
        return;
      }
      setSentTo(result.sentTo ?? email);
      setCode('');
      setStage('code');
    });

  const confirm = (value: string) => {
    if (pending || value.length !== 6) return;
    startTransition(async () => {
      setError(null);
      const result = await confirmTwoFactorChange({ enable, code: value });
      if (!result.ok) {
        setCode('');
        setError(result.error ?? 'That did not work.');
        if (result.restart) setStage('idle');
        return;
      }
      toast.success(enable ? 'Two-step verification is on' : 'Two-step verification is off');
      setEffectiveEnabled(enable);
      setStage('idle');
      setCode('');
      router.refresh();
    });
  };

  const resend = () =>
    startTransition(async () => {
      setError(null);
      const result = await resendTwoFactorChangeCode({ enable });
      if (!result.ok) {
        setError(result.error ?? 'A new code could not be sent.');
        return;
      }
      setCode('');
      toast.success(`A new code is on its way to ${result.sentTo}`);
    });

  const cancel = () => {
    setStage('idle');
    setCode('');
    setError(null);
  };

  return (
    <div data-two-factor={effectiveEnabled ? 'on' : 'off'} className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-ink flex flex-wrap items-center gap-2 text-sm font-medium">
            {effectiveEnabled ? (
              <ShieldCheck className="text-success-600 size-4 shrink-0" aria-hidden />
            ) : (
              <Shield className="text-faint size-4 shrink-0" aria-hidden />
            )}
            Two-step verification
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-3xs font-semibold',
                effectiveEnabled ? 'bg-success-50 text-success-700' : 'bg-sunken text-muted',
              )}
            >
              {effectiveEnabled ? 'On' : 'Off'}
            </span>
          </p>
          <p className="text-muted mt-1 text-xs">
            {effectiveEnabled
              ? `Signing in with your password also needs a code we email to ${email}.`
              : `Add a code, emailed to ${email}, to every sign-in. A stolen password alone would no longer be enough.`}
          </p>
        </div>

        {stage === 'idle' ? (
          <Button
            type="button"
            size="sm"
            variant={effectiveEnabled ? 'secondary' : 'primary'}
            loading={pending}
            onClick={request}
          >
            {effectiveEnabled ? 'Turn off' : 'Turn on'}
          </Button>
        ) : null}
      </div>

      {stage === 'code' ? (
        <div className="border-line bg-sunken/50 space-y-3 rounded-lg border p-4">
          <p className="text-ink text-sm">
            We sent a code to <span className="font-medium">{sentTo}</span>. Enter it to{' '}
            {enable ? 'turn two-step verification on' : 'turn two-step verification off'}.
          </p>
          <CodeInput
            label="Code from the email"
            value={code}
            onValueChange={(digits) => {
              setCode(digits);
              if (error) setError(null);
            }}
            onComplete={confirm}
            error={error ?? undefined}
            disabled={pending}
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={enable ? 'primary' : 'danger'}
              loading={pending}
              disabled={code.length !== 6}
              onClick={() => confirm(code)}
            >
              {enable ? 'Confirm and turn on' : 'Confirm and turn off'}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={resend}>
              Send a new code
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : error ? (
        <p role="alert" className="text-danger-700 text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
