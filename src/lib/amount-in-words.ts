import { PAISE_PER_RUPEE, type Paise } from './money';

/**
 * Rupees in words, Indian numbering.
 *
 * A GST tax invoice has to state the total in words — it is what a tax officer
 * reads when the figures are disputed, and it is the reason invoices are hard
 * to alter convincingly. The grouping is lakh/crore, not thousand/million, so
 * 1,25,00,000 is "one crore twenty five lakh" and never "twelve million".
 */

const ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];

const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 0-99. Teens are irregular, so they come straight from the table. */
function underHundred(value: number): string {
  if (value < 20) return ONES[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return ones ? `${TENS[tens]} ${ONES[ones]}` : TENS[tens];
}

function underThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (!hundreds) return underHundred(rest);
  const head = `${ONES[hundreds]} hundred`;
  return rest ? `${head} and ${underHundred(rest)}` : head;
}

/** Whole rupees to words. Handles up to 99,99,99,999 (just under 100 crore). */
export function rupeesInWords(rupees: number): string {
  const value = Math.floor(Math.abs(rupees));
  if (value === 0) return 'zero';

  const crore = Math.floor(value / 10_000_000);
  const lakh = Math.floor((value % 10_000_000) / 100_000);
  const thousand = Math.floor((value % 100_000) / 1_000);
  const rest = value % 1_000;

  const parts: string[] = [];
  if (crore) parts.push(`${underThousand(crore)} crore`);
  if (lakh) parts.push(`${underHundred(lakh)} lakh`);
  if (thousand) parts.push(`${underHundred(thousand)} thousand`);

  if (!rest) return parts.join(' ');

  const tail = underThousand(rest);
  // Convention on Indian invoices puts "and" before a final group below a
  // hundred: "one crore and one", never "one crore one". A trailing group of
  // 100 or more already carries its own "and" from `underThousand`.
  if (parts.length > 0 && rest < 100) return `${parts.join(' ')} and ${tail}`;
  return [...parts, tail].join(' ');
}

/**
 * The full legend an invoice prints, paise included.
 * "Rupees four thousand nine hundred and ninety eight and fifty paise only"
 */
export function amountInWords(paise: Paise): string {
  const negative = paise < 0;
  const absolute = Math.abs(Math.round(paise));
  const rupees = Math.floor(absolute / PAISE_PER_RUPEE);
  const remainder = absolute % PAISE_PER_RUPEE;

  const head = `Rupees ${rupeesInWords(rupees)}`;
  const tail = remainder > 0 ? ` and ${underHundred(remainder)} paise` : '';
  const sentence = `${head}${tail} only`;

  const cased = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  return negative ? `Minus ${cased}` : cased;
}
