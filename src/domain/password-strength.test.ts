import { describe, expect, it } from 'vitest';

import { isCommonPassword, passwordStrength } from './password-strength';

describe('passwordStrength', () => {
  it('counts down to the minimum length', () => {
    expect(passwordStrength('')).toMatchObject({ score: 0, acceptable: false, hint: 'Use at least 8 characters.' });
    expect(passwordStrength('abc12')).toMatchObject({ score: 0, label: 'Too short', hint: '3 more characters to go.' });
    expect(passwordStrength('abc1234')).toMatchObject({ hint: '1 more character to go.' });
  });

  it('refuses the first guesses on every list, however they are decorated', () => {
    for (const guess of ['password', 'Password1', 'Password123!', 'qwertyuiop', '12345678', '11111111', 'vestra2026', 'abcdefgh']) {
      expect(isCommonPassword(guess), guess).toBe(true);
      expect(passwordStrength(guess), guess).toMatchObject({ score: 0, acceptable: false });
    }
  });

  it('does not refuse an ordinary password that merely contains a common word', () => {
    expect(isCommonPassword('tangerine-password-lamp')).toBe(false);
    expect(passwordStrength('tangerine-password-lamp').acceptable).toBe(true);
  });

  it('rates a short mixed password below a long passphrase', () => {
    const short = passwordStrength('Kx7!pq2m');
    const phrase = passwordStrength('copper kettle river autumn');
    expect(short.acceptable).toBe(true);
    expect(phrase.score).toBe(4);
    expect(phrase.score).toBeGreaterThan(short.score);
    expect(phrase.hint).toBeNull();
  });

  it('caps a password built from the person’s own name or email', () => {
    const result = passwordStrength('AnanyaIyer#2026', { name: 'Ananya Iyer', email: 'ananya.iyer@example.com' });
    expect(result.acceptable).toBe(true);
    expect(result.score).toBe(1);
    expect(result.hint).toMatch(/name and email/);
  });

  it('caps runs and repeats, and says which', () => {
    expect(passwordStrength('Zebra!1234xy')).toMatchObject({ score: 2, hint: expect.stringMatching(/Runs like/) });
    expect(passwordStrength('Moonaaaa!!9Q')).toMatchObject({ hint: expect.stringMatching(/Repeated/) });
  });

  it('never scores a repeated character as length', () => {
    expect(passwordStrength('aAaAaAaAaAaAaAaAaAaA').score).toBeLessThanOrEqual(2);
  });

  it('always offers a next step until the password is strong', () => {
    for (const password of ['bluewhale', 'bluewhale42', 'Blue-whale-42']) {
      const result = passwordStrength(password);
      expect(result.score, password).toBeLessThan(4);
      expect(result.hint, password).toBeTruthy();
    }
  });
});
