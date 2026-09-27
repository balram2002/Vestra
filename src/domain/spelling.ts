/**
 * "Did you mean": a spelling suggestion built from the shop's own words.
 *
 * Not a dictionary. The vocabulary is what the catalogue actually contains --
 * category, brand and store names, colours, fabrics, occasions -- so a
 * suggestion can only ever point at something that exists here. "kurtta"
 * becomes "kurta" because there is a Kurtas category, and a correctly spelt
 * word the shop does not stock is left alone rather than "fixed" into
 * something else.
 */

/** Lower-case words of two or more letters. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).filter((word) => word.length >= 2);
}

export function buildVocabulary(phrases: readonly string[]): Set<string> {
  const words = new Set<string>();
  for (const phrase of phrases) {
    for (const word of tokenize(phrase)) {
      if (word.length < 3) continue;
      words.add(word);
      // Categories are named in the plural; shoppers type the singular.
      // "dress" is not the plural of "dres", so a double s stays.
      if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) words.add(word.slice(0, -1));
    }
  }
  return words;
}

/**
 * Optimal string alignment distance: Levenshtein plus adjacent swaps, so
 * "sraee" is one step from "saree", the way it was one slip of the thumb.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Known as written, or as the singular/plural of a known word. */
function known(word: string, vocabulary: ReadonlySet<string>): boolean {
  return (
    vocabulary.has(word) ||
    (word.endsWith('s') && vocabulary.has(word.slice(0, -1))) ||
    (word.endsWith('es') && vocabulary.has(word.slice(0, -2))) ||
    vocabulary.has(`${word}s`)
  );
}

/**
 * The closest known word, or null. Short words get one slip, longer ones two:
 * two edits on a four-letter word can reach almost anything.
 */
function closest(word: string, vocabulary: ReadonlySet<string>): string | null {
  const allowed = word.length <= 4 ? 1 : 2;
  let best: { word: string; distance: number } | null = null;
  for (const candidate of vocabulary) {
    if (Math.abs(candidate.length - word.length) > allowed) continue;
    const distance = editDistance(word, candidate);
    if (distance > allowed) continue;
    const better =
      !best ||
      distance < best.distance ||
      (distance === best.distance && candidate[0] === word[0] && best.word[0] !== word[0]) ||
      (distance === best.distance && (candidate[0] === word[0]) === (best.word[0] === word[0]) && candidate < best.word);
    if (better) best = { word: candidate, distance };
  }
  return best?.word ?? null;
}

/**
 * The query with each unknown word replaced by its closest known word, or
 * null when nothing would change. Words under three letters and numbers are
 * never touched: "xl" and "32" are sizes, not typos.
 */
export function didYouMean(query: string, vocabulary: ReadonlySet<string>): string | null {
  const original = query.trim().toLowerCase();
  if (!original) return null;
  let changed = false;
  const corrected = original.replace(/[a-z]+/g, (word) => {
    if (word.length < 3 || known(word, vocabulary)) return word;
    const replacement = closest(word, vocabulary);
    if (!replacement) return word;
    changed = true;
    return replacement;
  });
  return changed ? corrected : null;
}
