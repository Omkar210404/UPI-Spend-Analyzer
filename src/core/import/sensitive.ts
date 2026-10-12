import { columnValues, headerKind, normaliseHeader, type HeaderKind, type RawTable } from './table';

/**
 * Spots columns that hold identifiers the app has no business keeping:
 * account numbers, card numbers, PAN, Aadhaar, customer ids, contact details.
 *
 * The app only ever keeps the columns the user maps, so these would be
 * dropped anyway. Flagging them lets the mapping screen say so out loud, keep
 * them out of the suggested mapping, and warn if one is picked by hand.
 *
 * Detection is by header name first. The content checks are deliberately
 * narrow: a plain "twelve digits" rule would catch UPI reference numbers,
 * which are twelve digits and are exactly what the user wants to keep.
 */

export type SensitiveKind =
  'account-number' | 'card-number' | 'pan' | 'aadhaar' | 'customer-id' | 'contact' | 'holder-name';

export interface SensitiveColumn {
  column: number;
  kind: SensitiveKind;
  /** Plain-language reason shown to the user. */
  reason: string;
}

const HEADER_RULES: readonly { kind: SensitiveKind; pattern: RegExp; reason: string }[] = [
  // First match wins, so the holder's name is checked before the looser account rule.
  {
    kind: 'holder-name',
    pattern: /\b(account holder|holder name|customer name|account name)\b/,
    reason: "The header says this is the account holder's name.",
  },
  {
    kind: 'account-number',
    pattern: /\b(account|acct|a\/c|ac) ?(no|number|num|nbr|id)?\b|\biban\b/,
    reason: 'The header says this is an account number.',
  },
  {
    kind: 'card-number',
    pattern: /\b(card) ?(no|number|num)?\b/,
    reason: 'The header says this is a card number.',
  },
  { kind: 'pan', pattern: /\bpan\b/, reason: 'The header says this is a PAN.' },
  {
    kind: 'aadhaar',
    pattern: /\b(aadhaar|aadhar|adhaar|uidai|uid)\b/,
    reason: 'The header says this is an Aadhaar number.',
  },
  {
    kind: 'customer-id',
    pattern: /\b(customer|cust|client) ?(id|no|number)\b|\b(cif|crn)\b/,
    reason: 'The header says this is a customer id.',
  },
  {
    kind: 'contact',
    pattern: /\b(mobile|phone|email|e mail|address)\b/,
    reason: 'The header says this holds contact details.',
  },
];

/** Columns that are plainly money or dates are not identifiers, whatever else the header says. */
const NEVER_SENSITIVE: readonly (HeaderKind | null)[] = [
  'balance',
  'date',
  'debit',
  'credit',
  'amount',
];

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAAR_GROUPED = /^\d{4}[ -]\d{4}[ -]\d{4}$/;
const CARD_LIKE = /^[\d -]{13,23}$/;
const LONG_ID = /^[\dXx*]{9,18}$/;

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = digits.charCodeAt(index) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function isCardNumber(cell: string): boolean {
  if (!CARD_LIKE.test(cell)) return false;
  const digits = cell.replace(/[ -]/g, '');
  return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits);
}

function share(cells: readonly string[], test: (cell: string) => boolean): number {
  return cells.length === 0 ? 0 : cells.filter(test).length / cells.length;
}

function contentKind(cells: readonly string[]): { kind: SensitiveKind; reason: string } | null {
  if (cells.length < 2) return null;
  if (share(cells, (cell) => PAN.test(cell.toUpperCase())) >= 0.5) {
    return { kind: 'pan', reason: 'The values are shaped like PANs.' };
  }
  if (share(cells, (cell) => AADHAAR_GROUPED.test(cell)) >= 0.5) {
    return { kind: 'aadhaar', reason: 'The values are grouped like Aadhaar numbers.' };
  }
  if (share(cells, isCardNumber) >= 0.5) {
    return { kind: 'card-number', reason: 'The values pass the check used for card numbers.' };
  }
  const first = cells[0]!;
  if (LONG_ID.test(first) && cells.every((cell) => cell === first)) {
    return {
      kind: 'account-number',
      reason: 'The same long number repeats on every row, like an account number.',
    };
  }
  return null;
}

/** Every column that looks sensitive, with the reason. */
export function detectSensitiveColumns(table: RawTable): SensitiveColumn[] {
  const found: SensitiveColumn[] = [];
  table.header.forEach((name, column) => {
    // "Account balance" is a balance, not an account number.
    if (NEVER_SENSITIVE.includes(headerKind(name))) return;
    const header = normaliseHeader(name);
    const rule = HEADER_RULES.find((entry) => entry.pattern.test(header));
    if (rule) {
      found.push({ column, kind: rule.kind, reason: rule.reason });
      return;
    }
    const cells = columnValues(table, column).filter((cell) => cell !== '');
    const content = contentKind(cells);
    if (content) found.push({ column, ...content });
  });
  return found;
}
