/**
 * Email configuration.
 *
 * SMTP, because it is the one transport every provider speaks — SES, Mailgun,
 * Postmark, Resend, Google Workspace — so choosing a provider is a change to
 * this file's values rather than to any code.
 *
 * With no host configured, mail is written to the console and to disk instead
 * of being sent. That is a development convenience, not a silent failure: the
 * console transport says loudly that it is not delivering, and the rendered
 * HTML is saved so the template can actually be looked at.
 */

export const email = {
  host: process.env.SMTP_HOST ?? '',
  port: Number(process.env.SMTP_PORT ?? 587),
  user: process.env.SMTP_USER ?? '',
  password: process.env.SMTP_PASSWORD ?? '',
  /**
   * Implicit TLS on connect (port 465). Port 587 upgrades with STARTTLS
   * instead, which nodemailer negotiates on its own.
   */
  secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
  from: process.env.EMAIL_FROM ?? 'Vestra <no-reply@vestra.example>',
  replyTo: process.env.EMAIL_REPLY_TO ?? '',
  /** Where the console transport writes rendered mail during development. */
  outbox: process.env.EMAIL_OUTBOX ?? '.data/outbox',
} as const;

export function emailReady(): boolean {
  return Boolean(email.host && email.from);
}

/**
 * How long a verification or reset link stays valid.
 *
 * A verification link is a convenience and can be re-sent freely, so it is
 * generous. A reset link is a credential in an inbox, so it is short: long
 * enough to walk to a laptop, short enough that a forwarded or archived mail
 * stops being useful quickly.
 */
export const TOKEN_TTL = {
  emailVerification: 60 * 60 * 24, // 24 hours
  passwordReset: 60 * 30, // 30 minutes
} as const;
