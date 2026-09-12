import { describe, expect, it } from 'vitest';

import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('keeps a path on this site, with its query and hash', () => {
    expect(safeNext('/orders')).toBe('/orders');
    expect(safeNext('/sell-with-us/apply')).toBe('/sell-with-us/apply');
    expect(safeNext('/search?q=linen%20shirt&sort=new#results')).toBe(
      '/search?q=linen%20shirt&sort=new#results',
    );
  });

  it('has nothing to offer when there is no next', () => {
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext(null)).toBeNull();
    expect(safeNext('')).toBeNull();
  });

  it('refuses anywhere off this site', () => {
    expect(safeNext('https://evil.example')).toBeNull();
    expect(safeNext('//evil.example')).toBeNull();
    expect(safeNext('/\\evil.example')).toBeNull();
    expect(safeNext('/\t/evil.example')).toBeNull();
    expect(safeNext('/\n/evil.example')).toBeNull();
    expect(safeNext('javascript:alert(1)')).toBeNull();
    expect(safeNext('orders')).toBeNull();
  });

  it('never sends someone back to sign in', () => {
    expect(safeNext('/login')).toBeNull();
    expect(safeNext('/login?next=/admin')).toBeNull();
    expect(safeNext('/register')).toBeNull();
    expect(safeNext('/login-help')).toBe('/login-help');
  });
});
