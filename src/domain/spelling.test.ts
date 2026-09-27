import { describe, expect, it } from 'vitest';

import { buildVocabulary, didYouMean, editDistance, tokenize } from './spelling';

const vocabulary = buildVocabulary(['Kurtas', 'Sarees', 'Linen', 'Cotton', 'Block print', 'Mora Label', 'Juttis', 'Maroon', 'Navy']);

describe('editDistance', () => {
  it('counts an adjacent swap as one slip', () => {
    expect(editDistance('sraee', 'saree')).toBe(1);
    expect(editDistance('kurta', 'kurta')).toBe(0);
    expect(editDistance('linen', 'lenin')).toBe(2);
  });
});

describe('tokenize', () => {
  it('lower-cases and drops single letters and numbers', () => {
    expect(tokenize('Block-Print Kurta, size 32 & a')).toEqual(['block', 'print', 'kurta', 'size']);
  });
});

describe('didYouMean', () => {
  it('corrects a misspelt word to one the shop uses, in the singular a shopper types', () => {
    expect(didYouMean('kurtta', vocabulary)).toBe('kurta');
    expect(didYouMean('sraee', vocabulary)).toBe('saree');
  });

  it('does not make a singular out of a double s', () => {
    expect(buildVocabulary(['Dress']).has('dres')).toBe(false);
  });

  it('treats singulars and plurals of known words as known', () => {
    expect(didYouMean('kurta', vocabulary)).toBeNull();
    expect(didYouMean('saree', vocabulary)).toBeNull();
  });

  it('keeps the words that were right and fixes only the wrong one', () => {
    expect(didYouMean('maroon cotonn kurta', vocabulary)).toBe('maroon cotton kurta');
  });

  it('never touches sizes, numbers or short words', () => {
    expect(didYouMean('xl 32', vocabulary)).toBeNull();
  });

  it('leaves a word alone when nothing in the shop is close', () => {
    expect(didYouMean('umbrella', vocabulary)).toBeNull();
  });

  it('allows only one slip on a short word', () => {
    expect(didYouMean('nvy', vocabulary)).toBe('navy');
    expect(didYouMean('nx', vocabulary)).toBeNull();
  });
});
