import type { Direction, IsoDate } from '../types';
import { parseAmount, parseMarker, type AmountMarker } from './amounts';
import { detectDateFormat, parseDate, type DateFormatDetection, type DateFormatId } from './dates';
import { scrubNarration } from './scrub';
import type { SensitiveColumn } from './sensitive';
import { columnValues, headerKind, headerSignature, type HeaderKind, type RawTable } from './table';

/**
 * Column mapping: which column of the user's file is the date, the narration
 * and the money, and how to read each one.
 *
 * Only mapped columns are read. Everything else in the file is left behind
 * when `applyMapping` runs, which is how account-number and similar columns
 * are kept out of the app.
 */

/** How the file states the amount and its direction. */
export type AmountMode =
  /** Two columns: one for money out, one for money in. */
  | 'debit-credit'
  /** One amount column, with Dr/Cr in a second column or inside the amount cell. */
  | 'amount-marker'
  /** One amount column where the sign gives the direction. */
  | 'signed';

export interface ColumnMapping {
  date: number;
  narration: number;
  dateFormat: DateFormatId;
  amountMode: AmountMode;
  /** `debit-credit` mode. */
  debit: number | null;
  credit: number | null;
  /** `amount-marker` and `signed` modes. */
  amount: number | null;
  /** `amount-marker` mode: the Dr/Cr column. Null means the marker is inside the amount cell. */
  marker: number | null;
  /** `signed` mode: what a positive number means. */
  positiveIs: Direction;
  balance: number | null;
  reference: number | null;
}

/** A mapping still being filled in: the two required columns may be unset. */
export type MappingDraft = Omit<ColumnMapping, 'date' | 'narration'> & {
  date: number | null;
  narration: number | null;
};

export interface MappingSuggestion {
  draft: MappingDraft;
  dateDetection: DateFormatDetection;
}

function firstOfKind(
  table: RawTable,
  kind: HeaderKind,
  excluded: ReadonlySet<number>,
  prefer?: RegExp,
): number | null {
  const matches: number[] = [];
  table.header.forEach((name, column) => {
    if (!excluded.has(column) && headerKind(name) === kind) matches.push(column);
  });
  if (prefer) {
    const preferred = matches.find((column) => prefer.test(table.header[column]!));
    if (preferred !== undefined) return preferred;
  }
  return matches[0] ?? null;
}

/** For files without usable headers: the first column whose values read as dates. */
function firstDateColumnByContent(table: RawTable, excluded: ReadonlySet<number>): number | null {
  for (let column = 0; column < table.header.length; column += 1) {
    if (excluded.has(column)) continue;
    if (detectDateFormat(columnValues(table, column)).format) return column;
  }
  return null;
}

/** For files without usable headers: the column with the longest text that is not numbers. */
function wordiestColumn(table: RawTable, excluded: ReadonlySet<number>): number | null {
  let best: number | null = null;
  let bestLength = 0;
  for (let column = 0; column < table.header.length; column += 1) {
    if (excluded.has(column)) continue;
    const cells = columnValues(table, column).filter((cell) => cell !== '');
    if (cells.length === 0) continue;
    const letters = cells.filter((cell) => /[A-Za-z]{3,}/.test(cell)).length;
    if (letters < cells.length / 2) continue;
    const average = cells.reduce((sum, cell) => sum + cell.length, 0) / cells.length;
    if (average > bestLength) {
      bestLength = average;
      best = column;
    }
  }
  return best;
}

/**
 * Proposes a mapping from the header names, falling back to the cell contents
 * where the headers say nothing. Columns flagged as sensitive are never
 * suggested. The user confirms or changes every choice.
 */
export function suggestMapping(
  table: RawTable,
  sensitive: readonly SensitiveColumn[] = [],
): MappingSuggestion {
  const excluded = new Set(sensitive.map((entry) => entry.column));

  const date =
    firstOfKind(table, 'date', excluded, /txn|tran|post/i) ??
    firstDateColumnByContent(table, excluded);
  if (date !== null) excluded.add(date);

  const debit = firstOfKind(table, 'debit', excluded);
  const credit = firstOfKind(table, 'credit', excluded);
  const amount = firstOfKind(table, 'amount', excluded);
  const marker = firstOfKind(table, 'marker', excluded);
  const balance = firstOfKind(table, 'balance', excluded);
  const reference = firstOfKind(table, 'reference', excluded);
  for (const column of [debit, credit, amount, marker, balance, reference]) {
    if (column !== null) excluded.add(column);
  }
  const narration = firstOfKind(table, 'narration', excluded) ?? wordiestColumn(table, excluded);

  let amountMode: AmountMode = 'debit-credit';
  if (debit === null || credit === null) {
    if (amount !== null) {
      const parsed = columnValues(table, amount).map(parseAmount);
      const hasInlineMarker = parsed.some((cell) => cell.kind === 'value' && cell.marker !== null);
      amountMode = marker !== null || hasInlineMarker ? 'amount-marker' : 'signed';
    }
  }

  const dateDetection: DateFormatDetection =
    date === null
      ? { format: null, ambiguous: false, reason: 'No date column is chosen yet.' }
      : detectDateFormat(columnValues(table, date));

  return {
    draft: {
      date,
      narration,
      dateFormat: dateDetection.format ?? 'dmy',
      amountMode,
      debit: amountMode === 'debit-credit' ? debit : null,
      credit: amountMode === 'debit-credit' ? credit : null,
      amount: amountMode === 'debit-credit' ? null : amount,
      marker: amountMode === 'amount-marker' ? marker : null,
      positiveIs: 'credit',
      balance,
      reference,
    },
    dateDetection,
  };
}

export type MappingValidation =
  { ok: true; mapping: ColumnMapping } | { ok: false; errors: string[] };

/** Checks a draft is complete and consistent for this table. */
export function validateMapping(draft: MappingDraft, table: RawTable): MappingValidation {
  const errors: string[] = [];
  const width = table.header.length;
  const inRange = (column: number | null): boolean =>
    column === null || (Number.isInteger(column) && column >= 0 && column < width);

  if (draft.date === null) errors.push('Choose the date column.');
  if (draft.narration === null) errors.push('Choose the narration column.');

  if (draft.amountMode === 'debit-credit') {
    if (draft.debit === null) errors.push('Choose the debit (money out) column.');
    if (draft.credit === null) errors.push('Choose the credit (money in) column.');
  } else if (draft.amount === null) {
    errors.push('Choose the amount column.');
  }

  const used: [string, number | null][] = [
    ['date', draft.date],
    ['narration', draft.narration],
    ['balance', draft.balance],
    ['reference', draft.reference],
  ];
  if (draft.amountMode === 'debit-credit') {
    used.push(['debit', draft.debit], ['credit', draft.credit]);
  } else {
    used.push(['amount', draft.amount]);
    if (draft.amountMode === 'amount-marker') used.push(['Dr/Cr', draft.marker]);
  }

  if (used.some(([, column]) => !inRange(column))) {
    errors.push('A chosen column does not exist in this file.');
  }
  const seen = new Map<number, string>();
  for (const [field, column] of used) {
    if (column === null) continue;
    const other = seen.get(column);
    if (other) {
      errors.push(`"${table.header[column] ?? column}" is chosen for both ${other} and ${field}.`);
    } else {
      seen.set(column, field);
    }
  }

  if (errors.length > 0 || draft.date === null || draft.narration === null) {
    return { ok: false, errors };
  }
  return { ok: true, mapping: { ...draft, date: draft.date, narration: draft.narration } };
}

/** One statement row with its mapped columns read. */
export interface ImportedRow {
  /** Row number in the table, counted from 1 below the header. */
  rowNumber: number;
  date: IsoDate;
  narration: string;
  amountPaise: number;
  direction: Direction;
  balancePaise: number | null;
  reference: string | null;
}

export type SkipReason =
  'no-date' | 'bad-date' | 'no-amount' | 'bad-amount' | 'both-debit-and-credit' | 'no-marker';

export const SKIP_REASON_TEXT: Readonly<Record<SkipReason, string>> = {
  'no-date': 'No date in this row',
  'bad-date': 'The date could not be read',
  'no-amount': 'No amount in this row',
  'bad-amount': 'The amount could not be read',
  'both-debit-and-credit': 'Both a debit and a credit are filled in',
  'no-marker': 'Nothing says whether this is a debit or a credit',
};

export interface SkippedRow {
  rowNumber: number;
  reason: SkipReason;
  /** The mapped cells of the row, for the user to recognise it. Unmapped cells are never included. */
  preview: string;
}

export interface MappingResult {
  rows: ImportedRow[];
  skipped: SkippedRow[];
}

export interface ApplyOptions {
  /**
   * Join a row that has narration text but no date and no amount onto the
   * row above it. PDF statements wrap long narrations onto such rows.
   */
  mergeContinuations?: boolean;
}

function directionOf(marker: AmountMarker): Direction {
  return marker === 'DR' ? 'debit' : 'credit';
}

function opposite(direction: Direction): Direction {
  return direction === 'debit' ? 'credit' : 'debit';
}

type AmountOutcome =
  { ok: true; amountPaise: number; direction: Direction } | { ok: false; reason: SkipReason };

function readAmount(row: readonly string[], mapping: ColumnMapping): AmountOutcome {
  const cell = (column: number | null): string => (column === null ? '' : (row[column] ?? ''));

  if (mapping.amountMode === 'debit-credit') {
    const debit = parseAmount(cell(mapping.debit));
    const credit = parseAmount(cell(mapping.credit));
    if (debit.kind === 'invalid' || credit.kind === 'invalid') {
      return { ok: false, reason: 'bad-amount' };
    }
    const debitPaise = debit.kind === 'value' ? debit.paise : 0;
    const creditPaise = credit.kind === 'value' ? credit.paise : 0;
    if (debitPaise > 0 && creditPaise > 0) return { ok: false, reason: 'both-debit-and-credit' };
    if (debitPaise > 0) return { ok: true, amountPaise: debitPaise, direction: 'debit' };
    if (creditPaise > 0) return { ok: true, amountPaise: creditPaise, direction: 'credit' };
    return { ok: false, reason: 'no-amount' };
  }

  const amount = parseAmount(cell(mapping.amount));
  if (amount.kind === 'invalid') return { ok: false, reason: 'bad-amount' };
  if (amount.kind === 'empty' || amount.paise === 0) return { ok: false, reason: 'no-amount' };

  if (mapping.amountMode === 'amount-marker') {
    const fromColumn = mapping.marker === null ? null : parseMarker(cell(mapping.marker));
    const marker = fromColumn ?? amount.marker;
    if (!marker) return { ok: false, reason: 'no-marker' };
    return { ok: true, amountPaise: amount.paise, direction: directionOf(marker) };
  }

  // Signed: an explicit Dr/Cr in the cell still wins over the sign.
  if (amount.marker) {
    return { ok: true, amountPaise: amount.paise, direction: directionOf(amount.marker) };
  }
  const direction = amount.negative ? opposite(mapping.positiveIs) : mapping.positiveIs;
  return { ok: true, amountPaise: amount.paise, direction };
}

function readBalance(cell: string): number | null {
  const balance = parseAmount(cell);
  if (balance.kind !== 'value') return null;
  const overdrawn = balance.negative || balance.marker === 'DR';
  return overdrawn ? -balance.paise : balance.paise;
}

/**
 * Reads every row of the table through the mapping.
 * Rows that cannot be read are returned in `skipped` with the reason; nothing is dropped silently.
 */
export function applyMapping(
  table: RawTable,
  mapping: ColumnMapping,
  options: ApplyOptions = {},
): MappingResult {
  const rows: ImportedRow[] = [];
  const skipped: SkippedRow[] = [];

  const amountColumns =
    mapping.amountMode === 'debit-credit'
      ? [mapping.debit, mapping.credit]
      : [mapping.amount, mapping.amountMode === 'amount-marker' ? mapping.marker : null];
  const previewColumns = [mapping.date, mapping.narration, ...amountColumns].filter(
    (column): column is number => column !== null,
  );

  table.rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const dateCell = (row[mapping.date] ?? '').trim();
    // Card and account fragments are cut out of the narration before anything keeps it.
    const narration = scrubNarration(row[mapping.narration] ?? '');
    const preview = previewColumns
      .map((column) => (column === mapping.narration ? narration : (row[column] ?? '')))
      .filter((cell) => cell !== '')
      .join(' | ')
      .slice(0, 160);
    const skip = (reason: SkipReason): void => {
      skipped.push({ rowNumber, reason, preview });
    };

    if (dateCell === '') {
      const hasAmount = amountColumns.some(
        (column) => column !== null && (row[column] ?? '') !== '',
      );
      const previous = rows[rows.length - 1];
      if (options.mergeContinuations && narration !== '' && !hasAmount && previous) {
        previous.narration = `${previous.narration} ${narration}`.trim();
        return;
      }
      if (preview !== '') skip('no-date');
      return;
    }

    const date = parseDate(dateCell, mapping.dateFormat);
    if (!date) {
      skip('bad-date');
      return;
    }

    const amount = readAmount(row, mapping);
    if (!amount.ok) {
      skip(amount.reason);
      return;
    }

    const referenceCell = mapping.reference === null ? '' : (row[mapping.reference] ?? '').trim();
    rows.push({
      rowNumber,
      date,
      narration,
      amountPaise: amount.amountPaise,
      direction: amount.direction,
      balancePaise: mapping.balance === null ? null : readBalance(row[mapping.balance] ?? ''),
      reference: referenceCell === '' || /^[-0]+$/.test(referenceCell) ? null : referenceCell,
    });
  });

  return { rows, skipped };
}

/** A saved mapping for one file layout. Holds column positions and formats only, never row data. */
export interface MappingProfile {
  id: string;
  name: string;
  /** Header signature of the layout this mapping was made for. */
  signature: string;
  mapping: ColumnMapping;
}

export function createProfile(
  id: string,
  name: string,
  table: RawTable,
  mapping: ColumnMapping,
): MappingProfile {
  return { id, name: name.trim(), signature: headerSignature(table.header), mapping };
}

/** The saved profile for this exact header layout, if there is one that still fits. */
export function findProfile(
  profiles: readonly MappingProfile[],
  table: RawTable,
): MappingProfile | null {
  const signature = headerSignature(table.header);
  return (
    profiles.find(
      (profile) => profile.signature === signature && validateMapping(profile.mapping, table).ok,
    ) ?? null
  );
}
