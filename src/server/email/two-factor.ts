import 'server-only';

import { absoluteUrl, siteConfig } from '@/config/site';
import type { AuthChallenge } from '@/domain/types';

import { CODE_TTL_SECONDS, formatCode } from '../auth/one-time-code';
import { renderHtml, renderText, type EmailContent } from './layout';
import { sendEmail } from './transport';

/**
 * The two-step verification emails.
 *
 * Like the other account emails these go out directly, never through
 * notification preferences: a setting must not be able to stop the code that
 * lets somebody into their own account.
 *
 * THE CODE IS IN THE SUBJECT. On a phone that is the difference between reading
 * it off the notification and switching apps to find it, and it is what every
 * large service does. The code alone is not a credential -- it works only
 * after the password, on the page that asked for it, for ten minutes.
 *
 * Each message says what to do if it was not expected, because an unexpected
 * sign-in code is the one signal that a password has leaked.
 */

type CodePurpose = AuthChallenge['purpose'];

const COPY: Record<
  CodePurpose,
  { subject: (code: string) => string; heading: string; lead: string; ifNotYou: string }
> = {
  SIGN_IN: {
    subject: (code) => `${code} is your ${siteConfig.name} sign-in code`,
    heading: 'Your sign-in code',
    lead: 'Your password was just entered to sign in. Type this code on the page that asked for it to finish.',
    ifNotYou:
      'If that was not you, someone knows your password: change it now. Without this code they still cannot get in.',
  },
  ENABLE_TWO_FACTOR: {
    subject: (code) => `${code} turns on two-step verification`,
    heading: 'Turn on two-step verification',
    lead: 'Enter this code on your profile page to switch on two-step verification.',
    ifNotYou:
      'If you did not ask for this, someone is signed in to your account: change your password.',
  },
  DISABLE_TWO_FACTOR: {
    subject: (code) => `${code} turns off two-step verification`,
    heading: 'Turn off two-step verification',
    lead: 'Enter this code on your profile page to switch off two-step verification.',
    ifNotYou:
      'If you did not ask for this, someone is signed in to your account and trying to weaken it: change your password now.',
  },
};

async function send(to: string, subject: string, content: EmailContent) {
  return sendEmail({ to, subject, html: renderHtml(content), text: renderText(content) });
}

export async function sendOneTimeCodeEmail(input: {
  to: string;
  name: string;
  code: string;
  purpose: CodePurpose;
}): Promise<{ ok: boolean }> {
  const copy = COPY[input.purpose];
  const minutes = Math.round(CODE_TTL_SECONDS / 60);

  const result = await send(input.to, copy.subject(input.code), {
    eyebrow: 'Your account',
    heading: copy.heading,
    paragraphs: [`Hello ${input.name.split(' ')[0]},`, copy.lead],
    rows: [{ label: 'Your code', value: formatCode(input.code) }],
    footnote: `The code works once, for ${minutes} minutes. Nobody from ${siteConfig.name} will ever ask you for it. ${copy.ifNotYou}`,
  });

  return { ok: result.ok };
}

/**
 * Sent whenever two-step verification is switched on or off.
 *
 * Switching it OFF is the more important message: it is the step an attacker
 * who is already inside takes first, and this mail is how the owner finds out.
 */
export async function sendTwoFactorChangedEmail(input: {
  to: string;
  name: string;
  enabled: boolean;
}): Promise<{ ok: boolean }> {
  const heading = input.enabled
    ? 'Two-step verification is on'
    : 'Two-step verification is off';

  const result = await send(input.to, heading, {
    eyebrow: 'Your account',
    heading,
    paragraphs: [
      `Hello ${input.name.split(' ')[0]},`,
      input.enabled
        ? 'From now on, signing in with your password also needs a code we email to this address.'
        : 'Signing in now needs only your password. You can switch two-step verification back on from your profile at any time.',
    ],
    button: { label: 'Review your account', href: absoluteUrl('/account/profile#security') },
    footnote: input.enabled
      ? null
      : `If you did not do this, reset your password straight away and contact us at ${siteConfig.supportEmail ?? absoluteUrl('/help/contact')}.`,
  });

  return { ok: result.ok };
}
