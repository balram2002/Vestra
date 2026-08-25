import { describe, expect, it } from 'vitest';

import { assertPatternTable, barcodeGeometry, encodeCode128B, isEncodable } from './barcode';

/**
 * The Code 128 symbol table is 107 hand-entered patterns. A single transposed
 * digit produces a barcode that looks perfectly convincing on screen and fails
 * at the scanner — which is discovered in a warehouse, not here. These tests
 * check the structural invariants the standard guarantees, so a typo cannot
 * reach a printed label.
 */
describe('Code 128 pattern table', () => {
  it('holds 107 symbols, each spanning the correct number of modules', () => {
    expect(() => assertPatternTable()).not.toThrow();
  });
});

describe('encodeCode128B', () => {
  it('rejects characters outside code set B', () => {
    expect(isEncodable('AWB-12345')).toBe(true);
    // Tab is below the printable range.
    expect(isEncodable('AWB\t123')).toBe(false);
    expect(encodeCode128B('AWB\t123')).toBeNull();
    expect(encodeCode128B('')).toBeNull();
  });

  it('brackets the payload with a start symbol, checksum and stop', () => {
    const widths = encodeCode128B('A')!;
    // start + 1 data + checksum = 3 symbols of 6 elements, plus a 7-element stop.
    expect(widths).toHaveLength(3 * 6 + 7);
  });

  it('produces a symbol count that grows by one per character', () => {
    const one = encodeCode128B('1')!.length;
    const two = encodeCode128B('12')!.length;
    expect(two - one).toBe(6);
  });

  /**
   * The checksum is what a scanner validates. Recomputing it here from the
   * specification (start value + each symbol weighted by position, mod 103)
   * and comparing against the emitted pattern proves the encoder agrees with
   * the standard rather than merely being self-consistent.
   */
  it('emits the checksum symbol the specification requires', () => {
    const value = 'SH2026000042';
    const widths = encodeCode128B(value)!;

    const START_B = 104;
    let expected = START_B;
    [...value].forEach((char, index) => {
      expected += (char.charCodeAt(0) - 32) * (index + 1);
    });
    expected %= 103;

    // The checksum is the second-to-last symbol: 6 elements before the
    // 7-element stop pattern.
    const checksumElements = widths.slice(-13, -7);
    const checksumModules = checksumElements.reduce((sum, width) => sum + width, 0);

    expect(checksumElements).toHaveLength(6);
    expect(checksumModules).toBe(11);
    // Re-encode a single character whose value equals the checksum and compare
    // its data symbol, which must use the identical pattern.
    const probe = encodeCode128B(String.fromCharCode(expected + 32))!;
    expect(checksumElements).toEqual(probe.slice(6, 12));
  });

  it('starts and ends on a bar', () => {
    const geometry = barcodeGeometry('VESTRA123')!;
    expect(geometry.bars[0].x).toBe(0);
    // Code 128 always terminates with a bar, so the last painted rectangle
    // must reach the end of the symbol.
    const last = geometry.bars[geometry.bars.length - 1];
    expect(last.x + last.width).toBe(geometry.totalModules);
  });

  it('paints only the even-indexed elements', () => {
    const widths = encodeCode128B('AB')!;
    const geometry = barcodeGeometry('AB')!;
    expect(geometry.bars).toHaveLength(Math.ceil(widths.length / 2));
    expect(geometry.totalModules).toBe(widths.reduce((sum, width) => sum + width, 0));
  });
});
