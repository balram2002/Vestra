import { describe, expect, it } from 'vitest';

import {
  MAX_CODE_ATTEMPTS,
  attemptsLeft,
  checkCode,
  formatCode,
  generateCode,
  hashCode,
  maskEmail,
  normaliseCode,
  type ChallengeState,
} from './one-time-code';

const KEY = 'a-test-secret-that-is-long-enough';
const NOW = Date.parse('2026-09-13T10:00:00.000Z');

function challenge(code: string, overrides: Partial<ChallengeState> = {}): ChallengeState {
  const id = overrides.id ?? 'chl_test';
  return {
    id,
    codeHash: hashCode(code, id, KEY),
    attempts: 0,
    expiresAt: new Date(NOW + 10 * 60 * 1000).toISOString(),
    consumedAt: null,
    ...overrides,
  };
}

describe('generateCode', () => {
  it('is six digits, and leading zeros are real codes', () => {
    const codes = Array.from({ length: 500 }, () => generateCode());
    expect(codes.every((code) => /^\d{6}$/.test(code))).toBe(true);
    expect(codes.some((code) => code.startsWith('0'))).toBe(true);
  });

  it('does not repeat itself', () => {
    expect(new Set(Array.from({ length: 200 }, () => generateCode())).size).toBeGreaterThan(190);
  });
});

describe('hashCode', () => {
  it('binds a code to its challenge and to the secret', () => {
    const base = hashCode('123456', 'chl_a', KEY);
    expect(hashCode('123456', 'chl_a', KEY)).toBe(base);
    expect(hashCode('123456', 'chl_b', KEY)).not.toBe(base);
    expect(hashCode('123456', 'chl_a', `${KEY}-rotated`)).not.toBe(base);
    expect(base).not.toContain('123456');
  });
});

describe('checkCode', () => {
  it('accepts the code, however it was spaced', () => {
    const stored = challenge('042917');
    expect(checkCode(stored, '042917', NOW, KEY)).toBe('ok');
    expect(checkCode(stored, '042 917', NOW, KEY)).toBe('ok');
    expect(checkCode(stored, '042-917', NOW, KEY)).toBe('ok');
  });

  it('refuses a wrong code', () => {
    expect(checkCode(challenge('042917'), '042918', NOW, KEY)).toBe('wrong');
  });

  it('calls a typo malformed rather than wrong, so it costs no attempt', () => {
    expect(checkCode(challenge('042917'), '04291', NOW, KEY)).toBe('malformed');
    expect(checkCode(challenge('042917'), '04291a', NOW, KEY)).toBe('malformed');
    expect(normaliseCode(' 04 29-17 ')).toBe('042917');
  });

  it('refuses the right code once it has expired, been used, or been guessed at too often', () => {
    expect(
      checkCode(challenge('111111', { expiresAt: new Date(NOW - 1).toISOString() }), '111111', NOW, KEY),
    ).toBe('expired');
    expect(
      checkCode(challenge('111111', { consumedAt: new Date(NOW).toISOString() }), '111111', NOW, KEY),
    ).toBe('used');
    expect(checkCode(challenge('111111', { attempts: MAX_CODE_ATTEMPTS }), '111111', NOW, KEY)).toBe(
      'locked',
    );
  });

  it('never accepts a code sent for a different challenge', () => {
    const other = challenge('555555', { id: 'chl_other' });
    expect(checkCode({ ...challenge('000000'), codeHash: other.codeHash }, '555555', NOW, KEY)).toBe(
      'wrong',
    );
  });

  it('counts down the attempts left', () => {
    expect(attemptsLeft(0)).toBe(MAX_CODE_ATTEMPTS);
    expect(attemptsLeft(MAX_CODE_ATTEMPTS - 1)).toBe(1);
    expect(attemptsLeft(MAX_CODE_ATTEMPTS + 3)).toBe(0);
  });
});

describe('presentation', () => {
  it('masks an address to something recognisable', () => {
    expect(maskEmail('ananya.iyer@example.com')).toBe('an•••••••••@example.com');
    expect(maskEmail('jo@example.com')).toBe('j•••@example.com');
    expect(maskEmail('not-an-email')).toBe('not-an-email');
  });

  it('prints a code in two halves', () => {
    expect(formatCode('042917')).toBe('042 917');
  });
});
