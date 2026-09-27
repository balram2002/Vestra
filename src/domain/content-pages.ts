/**
 * Content pages -- policies, help articles, about, sell with us -- as
 * Marketing edits them.
 *
 * THREE TEMPLATES, chosen per page:
 *
 *   PLAIN      the page as it always was: title, date, text
 *   EDITORIAL  a hero image, a standfirst, a narrow reading column and a
 *              reading time -- for About and Sell with us
 *   HELP       a sticky contents list built from the page's own headings and
 *              a "still stuck?" card -- for help articles
 *
 * EDITS ARE DRAFTS. A published page changes only when its draft is
 * published, and the last ten published versions can be put back. Whether the
 * page is visible at all is a separate, immediate switch.
 *
 * Shared with the browser: the editor previews with the same helpers.
 */

export const CONTENT_TEMPLATES = ['PLAIN', 'EDITORIAL', 'HELP'] as const;
export type ContentTemplate = (typeof CONTENT_TEMPLATES)[number];

export const CONTENT_TEMPLATE_META: Record<ContentTemplate, { number: number; name: string; description: string }> = {
  PLAIN: {
    number: 1,
    name: 'Plain',
    description: 'Title, date and text. The page as it has always looked — right for policies.',
  },
  EDITORIAL: {
    number: 2,
    name: 'Editorial',
    description: 'A hero image, a standfirst and a narrow reading column with a reading time. For About and Sell with us.',
  },
  HELP: {
    number: 3,
    name: 'Help article',
    description: 'A contents list built from the headings, beside the text, and a card that routes anyone still stuck to support.',
  },
};

/** Everything about a page that a draft can change. */
export interface ContentFields {
  title: string;
  body: string;
  metaTitle: string;
  metaDescription: string;
  template: ContentTemplate;
  summary: string;
  heroImageUrl: string;
  noindex: boolean;
}

export interface ContentRevision {
  id: string;
  at: string;
  byName: string;
  note: string | null;
  content: ContentFields;
}

/** A heading's anchor: lower-case words joined by hyphens. */
export function anchorFor(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

/** The second-level headings, in order: the help template's contents list. */
export function outlineOf(markdown: string): Array<{ text: string; anchor: string }> {
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .map((text) => ({ text, anchor: anchorFor(text) }));
}

/** Minutes to read at 220 words a minute, never less than one. */
export function readingMinutes(markdown: string): number {
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/**
 * What a search result would show, and what is wrong with it.
 *
 * The lengths are where Google usually truncates on a phone -- guidance, not
 * law, so these are warnings, never refusals.
 */
export function seoReport(fields: Pick<ContentFields, 'title' | 'metaTitle' | 'metaDescription' | 'noindex'>): {
  title: string;
  description: string;
  warnings: string[];
} {
  const title = fields.metaTitle.trim() || `${fields.title.trim()} | VestraWAB`;
  const description = fields.metaDescription.trim();
  const warnings: string[] = [];
  if (fields.noindex) warnings.push('Hidden from search engines: this page will not appear in results.');
  if (title.length > 60) warnings.push(`The search title is ${title.length} characters; about 60 show before it is cut off.`);
  if (!description) warnings.push('No search description: search engines will pick a sentence from the page.');
  else if (description.length < 70) warnings.push('The search description is short; 120–155 characters uses the space well.');
  else if (description.length > 160) warnings.push(`The search description is ${description.length} characters; about 155 show.`);
  return { title, description, warnings };
}

/** The editable fields of a stored page, with defaults for pages saved before templates existed. */
export function contentFieldsOf(page: {
  title: string;
  body: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  template?: ContentTemplate;
  summary?: string | null;
  heroImageUrl?: string | null;
  noindex?: boolean;
}): ContentFields {
  return {
    title: page.title,
    body: page.body,
    metaTitle: page.metaTitle && page.metaTitle !== `${page.title} | VestraWAB` ? page.metaTitle : '',
    metaDescription: page.metaDescription ?? '',
    template: page.template ?? 'PLAIN',
    summary: page.summary ?? '',
    heroImageUrl: page.heroImageUrl ?? '',
    noindex: page.noindex ?? false,
  };
}

export function sameContent(a: ContentFields, b: ContentFields): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
