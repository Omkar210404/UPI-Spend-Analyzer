/**
 * Reads an amount cell from a statement into integer paise.
 *
 * Handles the ways Indian statements write money: lakh grouping
 * (`1,23,456.78`), a currency prefix (`₹`, `Rs.`, `INR`), a debit or credit
 * marker glued to the number (`500.00 Dr`), brackets or a minus sign for
 * negatives, and the placeholders banks use for "nothing here".
 *
 * The digits are converted with string arithmetic, so no value ever passes
 * through a floating-point number.
 */

export type AmountMarker = 'DR' | 'CR';

export type AmountResult =
  /** The cell holds no amount: blank, `-`, `NA` and similar. */
  | { kind: 'empty' }
  | {
      kind: 'value';
      /** Size of the amount, always zero or positive. */
      paise: number;
      /** True when written with a minus sign or in brackets. */
      negative: boolean;
      /** A Dr/Cr marker found in the same cell, if any. */
      marker: AmountMarker | null;
    }
  | { kind: 'invalid'; reason: string };

const EMPTY_VALUES = new Set(['', '-', '--', '---', 'na', 'n/a', 'nil', 'null', '.']);

// Not `\b`: in `500.00Cr` and `Rs500` the letters touch the digits.
const MARKER_AT_END = /\(?(?<![a-z])(dr|cr|debit|credit)\.?\)?\s*$/i;
const MARKER_AT_START = /^\(?(dr|cr|debit|credit)(?![a-z])\.?\)?\s*/i;
const CURRENCY = /₹|(?<![a-z])(inr|rs|rupees)\.?(?![a-z])/gi;

function toMarker(word: string): AmountMarker {
  return word.toLowerCase().startsWith('d') ? 'DR' : 'CR';
}

export function parseAmount(raw: string): AmountResult {
  let text = raw.replace(/[\u00a0\u2009\u202f]/g, ' ').trim();
  if (EMPTY_VALUES.has(text.toLowerCase())) return { kind: 'empty' };

  let marker: AmountMarker | null = null;
  const end = MARKER_AT_END.exec(text);
  if (end) {
    marker = toMarker(end[1]!);
    text = text.slice(0, end.index).trim();
  } else {
    const start = MARKER_AT_START.exec(text);
    if (start) {
      marker = toMarker(start[1]!);
      text = text.slice(start[0].length).trim();
    }
  }

  text = text.replace(CURRENCY, '').trim();

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  if (/^[-−]/.test(text)) {
    negative = !negative;
    text = text.slice(1).trim();
  } else if (/[-−]$/.test(text)) {
    negative = !negative;
    text = text.slice(0, -1).trim();
  } else if (text.startsWith('+')) {
    text = text.slice(1).trim();
  }

  if (text === '') return { kind: 'empty' };

  // Commas are grouping only, and must sit between digits: `1,23,456` yes, `,5` or `5,,0` no.
  if (/(^,)|(,$)|(,,)|(,\.)|(\.\d*,)/.test(text)) {
    return { kind: 'invalid', reason: 'Commas are in unexpected places.' };
  }
  const digits = text.replace(/,/g, '').replace(/\s+/g, '');

  const match = /^(\d*)(?:\.(\d*))?$/.exec(digits);
  if (!match || (match[1] === '' && (match[2] ?? '') === '')) {
    return { kind: 'invalid', reason: 'This is not a number.' };
  }
  const rupees = match[1] === '' ? '0' : match[1]!;
  const fraction = match[2] ?? '';
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    return { kind: 'invalid', reason: 'More than two decimal places.' };
  }
  if (rupees.length > 13) {
    return { kind: 'invalid', reason: 'The number is too large to be an amount.' };
  }

  const paise = Number(rupees) * 100 + Number(fraction.slice(0, 2).padEnd(2, '0'));
  return { kind: 'value', paise, negative, marker };
}

/** Reads a standalone Dr/Cr marker cell. Returns null when it is neither. */
export function parseMarker(raw: string): AmountMarker | null {
  const text = raw.trim().toLowerCase().replace(/[.()]/g, '');
  if (['dr', 'd', 'debit', 'withdrawal', 'wdl', 'paid', 'sent'].includes(text)) return 'DR';
  if (['cr', 'c', 'credit', 'deposit', 'dep', 'received'].includes(text)) return 'CR';
  return null;
}
