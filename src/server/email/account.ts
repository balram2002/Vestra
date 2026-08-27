import 'server-only';

import { TOKEN_TTL } from '@/config/email';
import { absoluteUrl, siteConfig } from '@/config/site';

import { renderHtml, renderText, type EmailContent } from './layout';
import { sendEmail } from './transport';

/**
 * The account emails.
 *
 * These do not go through `notify()`, and that is deliberate: the notification
 * pipeline resolves a user, honours their per-category preferences and writes
 * an in-app record. None of that applies here.
 *
 *   - A verification mail proves the address works. Routing it through a
 *     preference check on an address nobody has confirmed is circular.
 *   - A reset mail must reach someone who by definition cannot sign in, so an
 *     in-app record would be unreadable, and a preference toggle must never be
 *     able to lock a person out of their own recovery.
 *
 * So these are sent directly, and are the two messages in the app that ignore
 * notification preferences entirely.
 */

async function send(to: string, subject: string, content: EmailContent) {
  return sendEmail({
    to,
    subject,
    html: renderHtml(content),
    text: renderText(content),
  });
}

export async function sendVerificationEmail(input: {
  to: string;
  name: string;
  token: string;
}): Promise<{ ok: boolean }> {
  const hours = Math.round(TOKEN_TTL.emailVerification / 3600);

  const result = await send(input.to, `Confirm your email address`, {
    eyebrow: 'Your account',
    heading: 'Confirm your email address',
    paragraphs: [
      `Hello ${input.name.split(' ')[0]},`,
      `Confirming your address is what lets us send you order confirmations, delivery updates and refund receipts — and it is what proves the account is yours if you ever need to recover it.`,
    ],
    button: {
      label: 'Confirm my email',
      // Absolute: a relative link in an email has nothing to resolve against.
      href: absoluteUrl(`/verify-email?token=${encodeURIComponent(input.token)}`),
    },
    footnote: `This link works for ${hours} hours. If you did not create a ${siteConfig.name} account, you can ignore this message and nothing will happen.`,
  });

  return { ok: result.ok };
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  token: string;
}): Promise<{ ok: boolean }> {
  const minutes = Math.round(TOKEN_TTL.passwordReset / 60);

  const result = await send(input.to, 'Reset your password', {
    eyebrow: 'Your account',
    heading: 'Reset your password',
    paragraphs: [
      `Hello ${input.name.split(' ')[0]},`,
      'Use the button below to choose a new password. Your current password stays active until you do.',
    ],
    button: {
      label: 'Choose a new password',
      href: absoluteUrl(`/reset-password?token=${encodeURIComponent(input.token)}`),
    },
    /*
     * The reassurance matters as much as the link. Most people who receive an
     * unexpected reset mail want to know whether they have been compromised,
     * and the honest answer — someone typed your address into a form — is
     * calmer than silence.
     */
    footnote: `This link works for ${minutes} minutes and can be used once. If you did not ask for it, someone entered your address by mistake; your password has not changed and no action is needed.`,
  });

  return { ok: result.ok };
}

/**
 * Sent after a password actually changes.
 *
 * Not a courtesy: this is the only thing that tells someone their account was
 * taken over, and it is why it goes out even though the person who made the
 * change already knows.
 */
export async function sendPasswordChangedEmail(input: {
  to: string;
  name: string;
}): Promise<{ ok: boolean }> {
  const result = await send(input.to, 'Your password was changed', {
    eyebrow: 'Your account',
    heading: 'Your password was changed',
    paragraphs: [
      `Hello ${input.name.split(' ')[0]},`,
      'The password on your account has just been changed. If that was you, there is nothing to do.',
    ],
    button: { label: 'Review your account', href: absoluteUrl('/account') },
    footnote: `If it was not you, reset your password immediately and contact us at ${siteConfig.supportEmail}.`,
  });

  return { ok: result.ok };
}
