import { describe, expect, it } from 'vitest';

import { amountInWords, rupeesInWords } from './amount-in-words';
import { toPaise } from './money';

/**
 * The words on a tax invoice are the version a tax officer reads when the
 * figures are disputed, so "close enough" is not a standard that applies. The
 * cases below are the ones that break naive implementations: the teens, the
 * exact powers of ten, and Indian grouping — which is not thousand/million.
 */
describe('rupeesInWords', () => {
  it('handles zero and single digits', () => {
    expect(rupeesInWords(0)).toBe('zero');
    expect(rupeesInWords(7)).toBe('seven');
  });

  it('handles the irregular teens', () => {
    expect(rupeesInWords(11)).toBe('eleven');
    expect(rupeesInWords(15)).toBe('fifteen');
    expect(rupeesInWords(19)).toBe('nineteen');
  });

  it('handles round tens without a trailing unit', () => {
    expect(rupeesInWords(20)).toBe('twenty');
    expect(rupeesInWords(90)).toBe('ninety');
    expect(rupeesInWords(45)).toBe('forty five');
  });

  it('says "and" only between hundreds and the remainder', () => {
    expect(rupeesInWords(100)).toBe('one hundred');
    expect(rupeesInWords(101)).toBe('one hundred and one');
    expect(rupeesInWords(999)).toBe('nine hundred and ninety nine');
  });

  /** The point of the whole module: lakh and crore, not million and billion. */
  it('groups in lakh and crore', () => {
    expect(rupeesInWords(1_000)).toBe('one thousand');
    expect(rupeesInWords(100_000)).toBe('one lakh');
    expect(rupeesInWords(1_000_000)).toBe('ten lakh');
    expect(rupeesInWords(10_000_000)).toBe('one crore');
    expect(rupeesInWords(12_500_000)).toBe('one crore twenty five lakh');
  });

  it('skips empty groups rather than saying "zero thousand"', () => {
    expect(rupeesInWords(10_00_005)).toBe('ten lakh and five');
    expect(rupeesInWords(1_00_00_001)).toBe('one crore and one');
  });
});

describe('amountInWords', () => {
  it('renders the full invoice legend', () => {
    expect(amountInWords(toPaise(4998))).toBe(
      'Rupees four thousand nine hundred and ninety eight only',
    );
  });

  it('includes paise when there are any', () => {
    expect(amountInWords(toPaise(4998.5))).toBe(
      'Rupees four thousand nine hundred and ninety eight and fifty paise only',
    );
  });

  it('handles a credit note going the other way', () => {
    expect(amountInWords(toPaise(-250))).toBe('Minus Rupees two hundred and fifty only');
  });

  it('handles zero', () => {
    expect(amountInWords(0)).toBe('Rupees zero only');
  });
});
