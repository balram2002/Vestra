import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { absoluteUrl, siteUrl } from './site';

/**
 * URL construction.
 *
 * Small enough to look obviously correct, which is how it shipped with a bug
 * that broke every product share on social AND the `image` array in the Product
 * structured data Google reads for rich results: media lives on a remote host,
 * and `absoluteUrl(media.url)` was prefixing the site origin onto a URL that
 * already had one.
 */

const original = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://vestra.example';
});

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = original;
});

describe('siteUrl', () => {
  it('strips a trailing slash so callers can concatenate safely', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://vestra.example/';
    expect(siteUrl()).toBe('https://vestra.example');
  });

  it('strips several trailing slashes', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://vestra.example///';
    expect(siteUrl()).toBe('https://vestra.example');
  });
});

describe('absoluteUrl', () => {
  it('makes a rooted path absolute', () => {
    expect(absoluteUrl('/product/kurta')).toBe('https://vestra.example/product/kurta');
  });

  it('tolerates a path that forgot its leading slash', () => {
    expect(absoluteUrl('product/kurta')).toBe('https://vestra.example/product/kurta');
  });

  it('defaults to the site root', () => {
    expect(absoluteUrl()).toBe('https://vestra.example/');
  });

  it('keeps the query string intact', () => {
    expect(absoluteUrl('/search?q=kurta&sort=new')).toBe(
      'https://vestra.example/search?q=kurta&sort=new',
    );
  });

  /*
   * The regression. Remote media passed straight through this on the way into
   * `og:image` and into Product JSON-LD, and came out as
   * `https://vestra.example/https://images.example/photo.jpg` — which every
   * crawler fetched as a 404.
   */
  it('returns an already-absolute URL untouched', () => {
    const remote = 'https://images.example/photo.jpg?w=900&h=1200';
    expect(absoluteUrl(remote)).toBe(remote);
  });

  it('is idempotent', () => {
    const once = absoluteUrl('/product/kurta');
    expect(absoluteUrl(once)).toBe(once);
  });

  it('leaves other schemes alone rather than mangling them', () => {
    expect(absoluteUrl('http://cdn.example/a.png')).toBe('http://cdn.example/a.png');
    expect(absoluteUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(absoluteUrl('mailto:help@vestra.example')).toBe('mailto:help@vestra.example');
  });

  /*
   * A protocol-relative URL is rooted at the HOST, not at the path — treating
   * `//cdn.example/a.png` as a path would produce a URL pointing at the wrong
   * origin's root.
   */
  it('does not treat a protocol-relative URL as a path', () => {
    expect(absoluteUrl('//cdn.example/a.png')).toBe('//cdn.example/a.png');
  });
});
