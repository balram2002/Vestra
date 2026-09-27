import { describe, expect, it } from 'vitest';

import { anchorFor, contentFieldsOf, outlineOf, readingMinutes, sameContent, seoReport } from './content-pages';

describe('headings and outline', () => {
  it('turns a heading into a stable anchor', () => {
    expect(anchorFor('Returns & refunds: how long?')).toBe('returns-refunds-how-long');
  });

  it('lists only second-level headings, in order', () => {
    const body = '# Title\n\n## Who can return\ntext\n### Detail\n## How refunds work\n';
    expect(outlineOf(body)).toEqual([
      { text: 'Who can return', anchor: 'who-can-return' },
      { text: 'How refunds work', anchor: 'how-refunds-work' },
    ]);
  });
});

describe('reading time', () => {
  it('is at least a minute, at about 220 words a minute', () => {
    expect(readingMinutes('short')).toBe(1);
    expect(readingMinutes(Array.from({ length: 660 }, () => 'word').join(' '))).toBe(3);
  });
});

describe('search report', () => {
  it('falls back to the page title, and flags a missing description', () => {
    const report = seoReport({ title: 'About us', metaTitle: '', metaDescription: '', noindex: false });
    expect(report.title).toBe('About us | VestraWAB');
    expect(report.warnings).toContain('No search description: search engines will pick a sentence from the page.');
  });

  it('warns on a title that will be cut off, and on a hidden page', () => {
    const report = seoReport({ title: 'x', metaTitle: 'y'.repeat(70), metaDescription: 'z'.repeat(130), noindex: true });
    expect(report.warnings.join(' ')).toMatch(/70 characters/);
    expect(report.warnings.join(' ')).toMatch(/will not appear in results/);
  });

  it('is quiet when everything is in range', () => {
    expect(seoReport({ title: 'About', metaTitle: '', metaDescription: 'd'.repeat(130), noindex: false }).warnings).toEqual([]);
  });
});

describe('fields of a stored page', () => {
  it('reads a page saved before templates existed as Plain, with the default search title blank', () => {
    const fields = contentFieldsOf({ title: 'Terms', body: 'text', metaTitle: 'Terms | VestraWAB', metaDescription: null });
    expect(fields).toEqual({
      title: 'Terms',
      body: 'text',
      metaTitle: '',
      metaDescription: '',
      template: 'PLAIN',
      summary: '',
      heroImageUrl: '',
      noindex: false,
    });
    expect(sameContent(fields, { ...fields })).toBe(true);
  });
});
