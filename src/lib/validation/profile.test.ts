import { describe, expect, it } from 'vitest';

import { ageOn, cleanPreferredSizes, preferencesSchema, profileSchema } from './profile';

const today = new Date(Date.UTC(2026, 8, 13));

describe('ageOn', () => {
  it('counts whole years, and not until the birthday itself', () => {
    expect(ageOn('2000-09-13', today)).toBe(26);
    expect(ageOn('2000-09-14', today)).toBe(25);
    expect(ageOn('2000-01-31', today)).toBe(26);
  });

  it('refuses dates that do not exist', () => {
    expect(ageOn('2001-02-29', today)).toBeNull();
    expect(ageOn('2000-02-29', today)).toBe(26);
    expect(ageOn('2001-13-01', today)).toBeNull();
    expect(ageOn('13/09/2001', today)).toBeNull();
  });

  it('is negative for a date in the future', () => {
    expect(ageOn('2026-10-01', today)).toBeLessThan(0);
    expect(ageOn('2026-09-01', today)).toBe(0);
  });
});

describe('profileSchema', () => {
  const base = { fullName: 'Ananya Iyer', phone: '', gender: '', dateOfBirth: '' };
  const year = new Date().getUTCFullYear();
  const message = (input: Record<string, string>) => {
    const result = profileSchema.safeParse(input);
    return result.success ? null : (result.error.issues[0]?.message ?? 'unknown');
  };

  it('needs only a name', () => {
    expect(message(base)).toBeNull();
    expect(message({ fullName: 'Ananya Iyer' })).toBeNull();
    expect(message({ ...base, fullName: 'A' })).toBe('Enter your name');
  });

  it('says why a phone number is refused, rather than "Invalid input"', () => {
    expect(message({ ...base, phone: '12345' })).toMatch(/10-digit Indian mobile/);
    expect(message({ ...base, phone: '9876543210' })).toBeNull();
  });

  it('accepts only the genders it offers', () => {
    expect(message({ ...base, gender: 'UNDISCLOSED' })).toBeNull();
    expect(message({ ...base, gender: 'ROBOT' })).toBe('Choose one of the options');
  });

  it('explains each kind of bad birthday', () => {
    expect(message({ ...base, dateOfBirth: `${year - 30}-02-30` })).toMatch(/real date/);
    expect(message({ ...base, dateOfBirth: `${year + 1}-01-01` })).toMatch(/future/);
    expect(message({ ...base, dateOfBirth: `${year - 5}-01-01` })).toMatch(/13 or older/);
    expect(message({ ...base, dateOfBirth: '1850-01-01' })).toMatch(/year/);
    expect(message({ ...base, dateOfBirth: `${year - 30}-06-15` })).toBeNull();
  });
});

describe('preferred sizes', () => {
  it('keeps real sizes and drops blanks', () => {
    expect(cleanPreferredSizes({ ALPHA: 'M', FOOTWEAR_UK: '', NUMERIC_WAIST: '32' })).toEqual({
      ALPHA: 'M',
      NUMERIC_WAIST: '32',
    });
  });

  it('refuses a size off its scale, or a scale nobody is asked about', () => {
    expect(cleanPreferredSizes({ ALPHA: '32' })).toBeNull();
    expect(cleanPreferredSizes({ VOLUME: '50 ml' })).toBeNull();
    expect(cleanPreferredSizes({ SHOE: '9' })).toBeNull();
  });

  it('stores the cleaned sizes through the schema, and refuses a forged one whole', () => {
    expect(
      preferencesSchema.parse({ marketingOptIn: true, preferredSizes: { ALPHA: 'L', KIDS_AGE: '' } }),
    ).toEqual({ marketingOptIn: true, preferredSizes: { ALPHA: 'L' } });
    expect(
      preferencesSchema.safeParse({ marketingOptIn: false, preferredSizes: { ALPHA: 'M', FOOTWEAR_UK: '99' } })
        .success,
    ).toBe(false);
  });
});
