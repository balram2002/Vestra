import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * ImageKit URL building.
 *
 * Worth testing precisely because it cannot be exercised against a live
 * account here: if these strings are wrong, every image in the shop 404s and
 * nothing else in the suite would notice. The module reads its configuration at
 * import time, so each block re-imports it under the environment it needs.
 */

const ENDPOINT = 'https://ik.imagekit.io/vestra';

async function load(configured: boolean) {
  vi.resetModules();
  if (configured) {
    process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT = ENDPOINT;
    process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY = 'public_test';
  } else {
    delete process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
    delete process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
  }
  return import('./imagekit-url');
}

const original = {
  endpoint: process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT,
  key: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY,
};

afterEach(() => {
  if (original.endpoint === undefined) delete process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
  else process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT = original.endpoint;
  if (original.key === undefined) delete process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
  else process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY = original.key;
});

describe('with ImageKit configured', () => {
  it('inserts the transformation into one of our own URLs', async () => {
    const { ikUrl } = await load(true);
    expect(ikUrl(`${ENDPOINT}/vestra/listing/a.jpg`, { width: 800, quality: 80 })).toBe(
      `${ENDPOINT}/tr:w-800,q-80,f-auto/vestra/listing/a.jpg`,
    );
  });

  /*
   * Remote photography is delivered THROUGH ImageKit rather than hot-linked,
   * which is what makes "all images are served by ImageKit" true of the seeded
   * catalogue too, not only of what sellers upload.
   */
  it('routes a remote image through the web-proxy origin', async () => {
    const { ikUrl } = await load(true);
    const remote = 'https://images.unsplash.com/photo-1?w=900';
    expect(ikUrl(remote, { width: 400 })).toBe(`${ENDPOINT}/tr:w-400,f-auto/${remote}`);
  });

  /*
   * Stacking would silently resize twice — a 400px derivative of an already
   * 200px derivative — and the second transformation would win.
   */
  it('leaves a URL that already carries a transformation alone', async () => {
    const { ikUrl } = await load(true);
    const already = `${ENDPOINT}/tr:w-200/vestra/a.jpg`;
    expect(ikUrl(already, { width: 900 })).toBe(already);
  });

  it('cannot proxy a path this app serves itself', async () => {
    const { ikUrl } = await load(true);
    // ImageKit cannot fetch a path relative to whoever is asking.
    expect(ikUrl('/api/media/upload/x.jpg', { width: 400 })).toBe('/api/media/upload/x.jpg');
  });

  it('always asks for automatic format', async () => {
    const { ikUrl } = await load(true);
    expect(ikUrl(`${ENDPOINT}/a.jpg`)).toContain('f-auto');
  });

  it('honours an explicit format and crop', async () => {
    const { ikUrl } = await load(true);
    expect(ikUrl(`${ENDPOINT}/a.jpg`, { width: 100, height: 200, crop: 'force', format: 'webp' })).toBe(
      `${ENDPOINT}/tr:w-100,h-200,c-force,f-webp/a.jpg`,
    );
  });

  it('rounds fractional dimensions', async () => {
    const { ikUrl } = await load(true);
    expect(ikUrl(`${ENDPOINT}/a.jpg`, { width: 100.6 })).toContain('w-101');
  });

  it('builds a small blurred placeholder for a remote source', async () => {
    const { ikPlaceholder } = await load(true);
    const placeholder = ikPlaceholder('https://images.unsplash.com/photo-1');
    expect(placeholder).toContain('w-24');
    expect(placeholder).toContain('bl-12');
  });
});

describe('with ImageKit not configured', () => {
  /*
   * The fallback is a supported state, not a broken one: a clone of this
   * repository runs with no accounts to create.
   */
  it('returns every source untouched', async () => {
    const { ikUrl, deliveryReady } = await load(false);
    expect(deliveryReady()).toBe(false);
    expect(ikUrl('https://images.unsplash.com/photo-1', { width: 400 })).toBe(
      'https://images.unsplash.com/photo-1',
    );
    expect(ikUrl('/api/media/upload/x.jpg')).toBe('/api/media/upload/x.jpg');
  });

  it('offers no placeholder', async () => {
    const { ikPlaceholder } = await load(false);
    expect(ikPlaceholder('https://images.unsplash.com/photo-1')).toBeNull();
  });
});
