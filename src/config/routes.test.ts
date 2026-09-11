import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { routes } from './site';

/**
 * Every route builder points at a page that exists.
 *
 * Builders are how components avoid hand-assembling paths, which only helps if
 * the paths are right. Half of them once pointed at pages that had moved or
 * never existed (`/account/orders`, `/sign-in`, `/help`), and nothing noticed,
 * because a wrong link is not a type error. This walks the app directory,
 * turns every page into a pattern, and checks each builder's output against
 * them.
 */

const APP = path.join(process.cwd(), 'src', 'app');

function pagePatterns(dir: string, segments: string[] = []): RegExp[] {
  const found: RegExp[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Private folders and parallel slots add no URL segment of their own.
      if (entry.startsWith('_') || entry.startsWith('@')) continue;
      // Route groups such as `(storefront)` organise files without changing the URL.
      const next = /^\(.*\)$/.test(entry) ? segments : [...segments, entry];
      found.push(...pagePatterns(full, next));
    } else if (entry === 'page.tsx') {
      const source = segments
        .map((segment) =>
          /^\[.*\]$/.test(segment) ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        )
        .join('/');
      found.push(new RegExp(`^/${source}$`));
    }
  }
  return found;
}

type Builder = (...args: string[]) => string;

function builders(node: object, prefix = ''): Array<[string, Builder]> {
  return Object.entries(node).flatMap(([key, value]): Array<[string, Builder]> =>
    typeof value === 'function'
      ? [[`${prefix}${key}`, value as Builder]]
      : builders(value as object, `${prefix}${key}.`),
  );
}

const patterns = pagePatterns(APP);

describe('route builders', () => {
  it('finds the pages to check against', () => {
    expect(patterns.length).toBeGreaterThan(40);
  });

  for (const [name, build] of builders(routes)) {
    it(`${name} points at a page that exists`, () => {
      const pathname = build('sample-id', 'sample-two').split('?')[0];
      expect(
        patterns.some((pattern) => pattern.test(pathname)),
        `${name} builds ${pathname}, which is not a page`,
      ).toBe(true);
    });
  }
});
