import 'server-only';

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Transporter } from 'nodemailer';

import { email, emailReady } from '@/config/email';

/**
 * Where email actually goes.
 *
 * One interface, two drivers, chosen by whether SMTP is configured. Everything
 * above this — templates, the notification pipeline, the verification flow —
 * is written once and does not know which is in use.
 *
 * Sending NEVER throws. An order that succeeded must not be reported as failed
 * because a mail server was briefly unreachable; the caller gets `ok: false`
 * and the failure is logged loudly. That is the same rule the notification
 * pipeline already applies to every other channel.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  /** Always sent alongside the HTML. See `send` below for why. */
  text: string;
  replyTo?: string;
}

export interface EmailTransport {
  readonly name: string;
  send(message: OutgoingEmail): Promise<{ ok: boolean; error?: string }>;
}

/* ------------------------------------------------------------------ console */

/**
 * Development transport.
 *
 * Prints a one-line summary and writes the rendered HTML to disk, because a
 * template that is only ever described in a log line is a template nobody has
 * looked at. Deliberately says it is not delivering: a stub that reported
 * success indistinguishably from a real send is how "email works on my machine"
 * happens.
 */
function consoleTransport(): EmailTransport {
  return {
    name: 'console',
    async send(message) {
      console.info(
        `[vestrawab:email] NOT DELIVERED (no SMTP configured) -> ${message.to}: ${message.subject}`,
      );

      try {
        const dir = path.join(process.cwd(), email.outbox);
        await mkdir(dir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const slug = message.subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
        await writeFile(path.join(dir, `${stamp}-${slug}.html`), message.html, 'utf8');
      } catch (error) {
        // Writing the outbox is a convenience; failing to is not worth an error
        // path in the caller.
        console.error('[vestrawab:email] could not write the outbox', error);
      }

      return { ok: true };
    },
  };
}

/* --------------------------------------------------------------------- smtp */

function smtpTransport(): EmailTransport {
  /*
   * The nodemailer transporter is created once and reused, because it holds a
   * connection pool. Building one per message would open a fresh TCP and TLS
   * handshake for every email, which providers rate-limit.
   */
  let transporter: Transporter | null = null;

  const get = async () => {
    if (!transporter) {
      const nodemailer = await import('nodemailer');
      transporter = nodemailer.createTransport({
        host: email.host,
        port: email.port,
        secure: email.secure,
        auth: email.user ? { user: email.user, pass: email.password } : undefined,
        pool: true,
        maxConnections: 3,
        // A stuck mail server must not hold a request open indefinitely.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
    }
    return transporter;
  };

  return {
    name: 'smtp',
    async send(message) {
      try {
        const mailer = await get();
        await mailer.sendMail({
          from: email.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
          replyTo: message.replyTo || email.replyTo || undefined,
        });
        return { ok: true };
      } catch (error) {
        console.error('[vestrawab:email] send failed', message.subject, error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'The mail server rejected that message.',
        };
      }
    },
  };
}

/* ----------------------------------------------------------------- selection */

let transport: EmailTransport | null = null;

export function emailTransport(): EmailTransport {
  transport ??= emailReady() ? smtpTransport() : consoleTransport();
  return transport;
}

/**
 * Send one message.
 *
 * The plain-text alternative is not optional. A multipart message without one
 * scores worse with every spam filter, and it is the version that reaches
 * anyone reading mail in a terminal, on a watch, or with images blocked — which
 * for a shipping notification is a real audience, not a hypothetical one.
 */
export async function sendEmail(message: OutgoingEmail): Promise<{ ok: boolean; error?: string }> {
  if (!message.to || !message.to.includes('@')) {
    return { ok: false, error: 'No address to send to.' };
  }
  return emailTransport().send(message);
}
