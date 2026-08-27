import 'server-only';

import { absoluteUrl, siteConfig } from '@/config/site';

/**
 * The email shell.
 *
 * Email is not the web. Gmail strips `<style>` blocks in some clients, Outlook
 * renders through Word, and flexbox and grid are unavailable in enough places
 * that using them means designing for a subset of the audience. So this is
 * table-based with inline styles — not nostalgia, the only layout that arrives
 * intact everywhere.
 *
 * The palette is the same one the shop uses, mirrored as literals for the same
 * reason the OG card mirrors it: there is no cascade here to resolve a custom
 * property against.
 *
 * Every template renders BOTH an HTML and a plain-text body from the same
 * content, so the two cannot drift.
 */

const PALETTE = {
  canvas: '#faf8f5',
  raised: '#ffffff',
  ink: '#1a1815',
  muted: '#5e5950',
  faint: '#6f6a60',
  line: '#e8e4dd',
  accent: '#6d2650',
} as const;

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

export interface EmailButton {
  label: string;
  href: string;
}

/** One labelled figure in a summary block — a total, an AWB, a date. */
export interface EmailRow {
  label: string;
  value: string;
}

export interface EmailContent {
  /** The line above the heading: an order number, a ticket reference. */
  eyebrow?: string | null;
  heading: string;
  /** Body paragraphs. Plain strings; no markup. */
  paragraphs: string[];
  rows?: EmailRow[];
  button?: EmailButton | null;
  /** Small print under the button — a deadline, a caveat. */
  footnote?: string | null;
}

export function renderHtml(content: EmailContent): string {
  const rows = (content.rows ?? [])
    .map(
      (row) => `
        <tr>
          <td style="padding:6px 0;color:${PALETTE.muted};font-size:14px;">${escape(row.label)}</td>
          <td style="padding:6px 0;color:${PALETTE.ink};font-size:14px;font-weight:600;text-align:right;">${escape(row.value)}</td>
        </tr>`,
    )
    .join('');

  const paragraphs = content.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 14px;color:${PALETTE.muted};font-size:15px;line-height:1.6;">${escape(text)}</p>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PALETTE.canvas};font-family:${FONT};">
  <!-- Shown in the inbox list under the subject, so it should not be the heading again. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(content.paragraphs[0] ?? '')}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PALETTE.canvas};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${PALETTE.raised};border:1px solid ${PALETTE.line};border-radius:12px;overflow:hidden;">

          <tr>
            <td style="padding:24px 28px;border-bottom:1px solid ${PALETTE.line};">
              <a href="${absoluteUrl('/')}" style="color:${PALETTE.ink};font-size:19px;font-weight:700;text-decoration:none;letter-spacing:-0.02em;">
                ${escape(siteConfig.name)}
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding:28px;">
              ${
                content.eyebrow
                  ? `<p style="margin:0 0 8px;color:${PALETTE.accent};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${escape(content.eyebrow)}</p>`
                  : ''
              }
              <h1 style="margin:0 0 16px;color:${PALETTE.ink};font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.02em;">${escape(content.heading)}</h1>
              ${paragraphs}

              ${
                rows
                  ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;padding:14px 16px;background:${PALETTE.canvas};border-radius:8px;">${rows}</table>`
                  : ''
              }

              ${
                content.button
                  ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0;">
                       <tr><td style="background:${PALETTE.ink};border-radius:8px;">
                         <a href="${escape(content.button.href)}" style="display:inline-block;padding:12px 22px;color:${PALETTE.canvas};font-size:14px;font-weight:600;text-decoration:none;">${escape(content.button.label)}</a>
                       </td></tr>
                     </table>`
                  : ''
              }

              ${
                content.footnote
                  ? `<p style="margin:16px 0 0;color:${PALETTE.faint};font-size:12px;line-height:1.5;">${escape(content.footnote)}</p>`
                  : ''
              }
            </td>
          </tr>

          <tr>
            <td style="padding:20px 28px;border-top:1px solid ${PALETTE.line};">
              <p style="margin:0 0 6px;color:${PALETTE.faint};font-size:12px;line-height:1.5;">
                ${escape(siteConfig.legalName)} · ${escape(siteConfig.supportEmail)}
              </p>
              <p style="margin:0;color:${PALETTE.faint};font-size:12px;line-height:1.5;">
                <a href="${absoluteUrl('/account/notifications')}" style="color:${PALETTE.faint};">Manage which emails you get</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * The plain-text alternative.
 *
 * Built from the same `EmailContent`, so it always says what the HTML says.
 * Written to be read, not to be a stripped-tags fallback: the URL is spelled
 * out, because a text reader cannot click a label.
 */
export function renderText(content: EmailContent): string {
  const lines: string[] = [];

  if (content.eyebrow) lines.push(content.eyebrow.toUpperCase(), '');
  lines.push(content.heading, '');

  for (const paragraph of content.paragraphs) lines.push(paragraph, '');

  for (const row of content.rows ?? []) lines.push(`${row.label}: ${row.value}`);
  if (content.rows?.length) lines.push('');

  if (content.button) lines.push(`${content.button.label}: ${content.button.href}`, '');
  if (content.footnote) lines.push(content.footnote, '');

  lines.push('—', `${siteConfig.legalName} · ${siteConfig.supportEmail}`);
  lines.push(`Manage which emails you get: ${absoluteUrl('/account/notifications')}`);

  return lines.join('\n');
}

/**
 * Escape for HTML.
 *
 * Every interpolation into the template goes through this. Order numbers and
 * product titles are ours, but a support ticket's subject and a store's display
 * name are typed by people, and an email is just as capable of carrying an
 * injected tag as a page is.
 */
function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
