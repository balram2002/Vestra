'use client';

import { MailWarning } from 'lucide-react';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

import { resendVerificationEmail } from '@/server/actions/auth';

/**
 * The prompt to confirm an address.
 *
 * Says what confirming is FOR rather than just that it is outstanding. "Email
 * not verified" is a status; "we cannot send you delivery updates until you
 * confirm" is a reason, and only one of those gets acted on.
 *
 * Deliberately a notice rather than a block: an unconfirmed address is not a
 * reason to stop someone shopping.
 */
export function VerifyEmailNotice({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const resend = () => {
    startTransition(async () => {
      const result = await resendVerificationEmail();
      if (result.ok) {
        setSent(true);
        toast.success(`Sent to ${email}. It may take a minute to arrive.`);
      } else {
        toast.error(result.error ?? 'We could not send that just now.');
      }
    });
  };

  return (
    <div className="border-warning-100 bg-warning-50 mt-4 flex flex-wrap items-start gap-3 rounded-lg border p-4">
      <MailWarning className="text-warning-700 mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-warning-700 text-sm font-semibold">Confirm your email address</p>
        <p className="text-warning-700/80 mt-0.5 text-sm">
          We send order confirmations, delivery updates and refund receipts to {email}. Confirming
          it also proves the account is yours if you ever need to recover it.
        </p>
      </div>
      <Button
        type="button"
        onClick={resend}
        disabled={pending || sent}
        variant="secondary"
        size="sm"
        className="shrink-0"
      >
        {pending ? 'Sending…' : sent ? 'Sent' : 'Send me the link'}
      </Button>
    </div>
  );
}
