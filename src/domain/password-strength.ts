import { ACCOUNTS } from '@/config/business';

/**
 * How guessable a password is, as a person choosing one needs to hear it.
 *
 * Pure and dependency-free, so the meter under the field and the rule on the
 * server read the same answer: a password the meter calls "too common" is one
 * the server refuses, never one it quietly accepts.
 *
 * WHAT IT MEASURES, AND WHAT IT DOES NOT
 *
 * Length and variety give a rough ceiling -- the size of the space someone
 * would have to search. Everything else takes points AWAY, because the way
 * passwords are actually cracked is not by searching that space: it is by
 * trying the famous ones first, then keyboard runs, then the person's own name.
 * "Password1!" has four kinds of character and is one of the first guesses on
 * every list.
 *
 * It is a guide, not a guarantee, and the copy never pretends otherwise. The
 * one hard rule it feeds is the blocklist: the rest is advice.
 */

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  score: StrengthScore;
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  /** The single most useful next step, or null when there is nothing to add. */
  hint: string | null;
  /** Long enough, and not on the list. What the server requires, and all it requires. */
  acceptable: boolean;
}

const LABELS: Record<StrengthScore, PasswordStrength['label']> = {
  0: 'Too short',
  1: 'Weak',
  2: 'Fair',
  3: 'Good',
  4: 'Strong',
};

/**
 * The first guesses on every cracking list, plus the shop's own name.
 *
 * Short on purpose: this is not trying to be a breach corpus, only to refuse
 * the handful of passwords that fall to the first second of any attack. Each
 * entry is matched after stripping trailing digits and symbols, so "password1"
 * and "Password123!" are the same guess.
 */
const COMMON = new Set([
  'password',
  'passw0rd',
  'qwerty',
  'qwertyuiop',
  'asdfgh',
  'letmein',
  'welcome',
  'iloveyou',
  'admin',
  'administrator',
  'monkey',
  'dragon',
  'football',
  'cricket',
  'baseball',
  'sunshine',
  'princess',
  'shadow',
  'superman',
  'batman',
  'master',
  'login',
  'abc',
  'abcdef',
  'india',
  'vestra',
  'vestrawab',
  'changeme',
  'secret',
  'default',
]);

const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

/** The part of a password a person thinks of as "the word". */
function core(password: string): string {
  return password.toLowerCase().replace(/[\d\W_]+$/u, '').replace(/^[\d\W_]+/u, '');
}

export function isCommonPassword(password: string): boolean {
  const lower = password.toLowerCase();
  if (/^(\d)\1+$/.test(lower) || /^\d+$/.test(lower) && isRun(lower)) return true;
  if (isRun(lower)) return true;
  const word = core(password);
  return COMMON.has(lower) || (word.length > 0 && COMMON.has(word));
}

/** The whole password is one keyboard or alphabet run, forwards or back. */
function isRun(lower: string): boolean {
  if (lower.length < 4) return false;
  return SEQUENCES.some((sequence) => {
    const reversed = [...sequence].reverse().join('');
    return sequence.includes(lower) || reversed.includes(lower);
  });
}

/** Four or more characters of a run anywhere inside it: "abcd", "4321", "qwer". */
function containsRun(lower: string): boolean {
  for (const sequence of SEQUENCES) {
    const reversed = [...sequence].reverse().join('');
    for (let start = 0; start + 4 <= sequence.length; start += 1) {
      if (lower.includes(sequence.slice(start, start + 4)) || lower.includes(reversed.slice(start, start + 4))) {
        return true;
      }
    }
  }
  return false;
}

/** Pieces of who the person is: a name, the start of an email address. */
function personalWords(context: { email?: string; name?: string }): string[] {
  const words = [
    ...(context.name ?? '').toLowerCase().split(/\s+/),
    ...(context.email ?? '').toLowerCase().split('@')[0]!.split(/[._+-]+/),
  ];
  return [...new Set(words.filter((word) => word.length >= 3))];
}

export function passwordStrength(
  password: string,
  context: { email?: string; name?: string } = {},
): PasswordStrength {
  const min = ACCOUNTS.passwordMinLength;
  const lower = password.toLowerCase();

  if (password.length < min) {
    const short = min - password.length;
    return {
      score: 0,
      label: LABELS[0],
      hint:
        password.length === 0
          ? `Use at least ${min} characters.`
          : `${short} more ${short === 1 ? 'character' : 'characters'} to go.`,
      acceptable: false,
    };
  }

  if (isCommonPassword(password)) {
    return {
      score: 0,
      label: LABELS[0],
      hint: 'That is one of the first passwords anyone would guess. Choose something less common.',
      acceptable: false,
    };
  }

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  const pool = [
    /[a-z]/.test(password) ? 26 : 0,
    /[A-Z]/.test(password) ? 26 : 0,
    /\d/.test(password) ? 10 : 0,
    /[^A-Za-z0-9]/.test(password) ? 33 : 0,
  ].reduce((sum, size) => sum + size, 0);

  // Repeats count once: "aaaaaaaaaa" is not ten characters of search space.
  const distinct = new Set(lower).size;
  const effectiveLength = Math.min(password.length, distinct * 2);
  const bits = effectiveLength * Math.log2(Math.max(pool, 2));

  let score: StrengthScore = bits < 36 ? 1 : bits < 50 ? 2 : bits < 70 ? 3 : 4;
  // Short is never Strong, however varied: "Blue-whale-42" is two dictionary
  // words and a number, and the arithmetic above cannot see that.
  if (password.length < 14) score = Math.min(score, 3) as StrengthScore;
  // A long passphrase is strong even in lower case alone.
  if (password.length >= 16 && distinct >= 8) score = Math.max(score, 3) as StrengthScore;
  if (password.length >= 20 && classes >= 2 && distinct >= 10) score = 4;

  const personal = personalWords(context).some((word) => lower.includes(word));
  const run = containsRun(lower);
  const repeated = /(.)\1{2,}/.test(lower);

  if (personal) score = Math.min(score, 1) as StrengthScore;
  if (run || repeated) score = Math.min(score, 2) as StrengthScore;

  const hint = personal
    ? 'Leave your name and email out of it: they are the first things tried.'
    : run
      ? 'Runs like "abcd" or "1234" are easy to guess. Break them up.'
      : repeated
        ? 'Repeated characters add length but little strength.'
        : score >= 4
          ? null
          : password.length < 12
            ? 'A few more characters, or another word, makes the biggest difference.'
            : classes < 3
              ? 'Mix in a number or a symbol to make it stronger.'
              : 'Another word would make it stronger still.';

  return { score, label: LABELS[score], hint, acceptable: true };
}
