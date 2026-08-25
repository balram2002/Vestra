/**
 * Code 128 barcode encoding.
 *
 * Shipping labels need a barcode a handheld scanner can actually read. Drawing
 * plausible-looking stripes would be worse than printing nothing: the parcel
 * reaches the hub, the scan fails, and the label has to be redone by hand.
 *
 * Code 128 subset B is used because AWBs and our own shipment numbers are
 * alphanumeric. Subset C would pack digit pairs more tightly, but the width
 * saving is irrelevant on a 4×6 label and the mixed-mode switching is a source
 * of bugs.
 *
 * In production the courier's own label PDF is used — Eshopbox returns a
 * `shippingLabelUrl` and that is what gets printed. This renderer backs the
 * simulated courier, and the reprint path when a provider label is unavailable.
 */

/**
 * The 107 Code 128 symbols, each as element widths in modules:
 * bar, space, bar, space, bar, space. Every symbol is 11 modules wide except
 * the stop pattern, which is 13. `assertPatternTable` checks that invariant.
 */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

/** Structural check used by the test suite to catch a transcription error. */
export function assertPatternTable(): void {
  if (PATTERNS.length !== 107) {
    throw new Error(`Code128 table must hold 107 symbols, found ${PATTERNS.length}`);
  }
  PATTERNS.forEach((pattern, index) => {
    const modules = [...pattern].reduce((sum, digit) => sum + Number(digit), 0);
    const expected = index === STOP ? 13 : 11;
    if (modules !== expected) {
      throw new Error(`Code128 symbol ${index} spans ${modules} modules, expected ${expected}`);
    }
    if (pattern.length !== (index === STOP ? 7 : 6)) {
      throw new Error(`Code128 symbol ${index} has ${pattern.length} elements`);
    }
  });
}

/** Code set B covers ASCII 32-126; anything else cannot be encoded. */
export function isEncodable(value: string): boolean {
  return [...value].every((char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code <= 126;
  });
}

/**
 * Encode to alternating bar/space widths, starting with a bar.
 * Returns null when the input contains characters code set B cannot represent,
 * so a caller can fall back to plain text rather than print a broken symbol.
 */
export function encodeCode128B(value: string): number[] | null {
  if (!value || !isEncodable(value)) return null;

  const symbols = [START_B];
  for (const char of value) symbols.push(char.charCodeAt(0) - 32);

  // Checksum: start value plus each symbol weighted by its position, mod 103.
  let checksum = START_B;
  for (let i = 1; i < symbols.length; i++) checksum += symbols[i] * i;
  symbols.push(checksum % 103);

  symbols.push(STOP);

  const widths: number[] = [];
  for (const symbol of symbols) {
    for (const digit of PATTERNS[symbol]) widths.push(Number(digit));
  }
  return widths;
}

export interface BarcodeGeometry {
  /** Rectangles to paint, in module units. */
  bars: Array<{ x: number; width: number }>;
  /** Total width in modules, for the SVG viewBox. */
  totalModules: number;
}

/**
 * Turn a value into bar geometry. Widths alternate bar/space starting with a
 * bar, so only even indices are painted.
 */
export function barcodeGeometry(value: string): BarcodeGeometry | null {
  const widths = encodeCode128B(value);
  if (!widths) return null;

  const bars: Array<{ x: number; width: number }> = [];
  let x = 0;
  widths.forEach((width, index) => {
    if (index % 2 === 0) bars.push({ x, width });
    x += width;
  });

  return { bars, totalModules: x };
}
