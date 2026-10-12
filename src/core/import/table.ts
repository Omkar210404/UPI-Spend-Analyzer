/**
 * Finds the transaction table inside a statement export.
 *
 * A bank CSV is rarely just a table. It usually opens with a block about the
 * account (holder name, address, account number, period) and closes with
 * totals or a disclaimer. Only the header row and what follows it is kept;
 * the block above it is dropped here and never reaches the rest of the app.
 */

export interface RawTable {
  header: string[];
  rows: string[][];
  /** Index of the header row in the file's rows, counted from 0. */
  headerRowIndex: number;
}

/** What kind of column a header name suggests. */
export type HeaderKind =
  'date' | 'narration' | 'debit' | 'credit' | 'amount' | 'marker' | 'balance' | 'reference';

const HEADER_WORDS: readonly { kind: HeaderKind; pattern: RegExp }[] = [
  // Order matters: the first pattern that matches names the column.
  { kind: 'balance', pattern: /\b(balance|bal)\b/ },
  {
    kind: 'debit',
    pattern: /\b(debit|debits|withdrawal|withdrawals|withdrawn|dr|paid out|money out)\b/,
  },
  {
    kind: 'credit',
    pattern: /\b(credit|credits|deposit|deposits|deposited|cr|paid in|money in)\b/,
  },
  {
    kind: 'marker',
    pattern: /\b(dr ?\/ ?cr|cr ?\/ ?dr|debit ?\/ ?credit|type|txn type|transaction type)\b/,
  },
  { kind: 'reference', pattern: /\b(ref|reference|chq|cheque|utr|rrn|txn id|transaction id)\b/ },
  { kind: 'date', pattern: /\b(date|dt)\b/ },
  {
    kind: 'narration',
    pattern: /\b(narration|description|particulars|remarks|details|transaction details|remark)\b/,
  },
  { kind: 'amount', pattern: /\b(amount|amt)\b/ },
];

export function normaliseHeader(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/[._]/g, ' ')
    .replace(/[^a-z0-9/ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The kind of column a header cell names, or null when it names none we know. */
export function headerKind(cell: string): HeaderKind | null {
  const text = normaliseHeader(cell);
  if (text === '' || text.length > 40) return null;
  // "Dr/Cr" and "Type" must be checked before the debit and credit words they contain.
  const marker = HEADER_WORDS.find((entry) => entry.kind === 'marker')!;
  if (marker.pattern.test(text)) return 'marker';
  for (const { kind, pattern } of HEADER_WORDS) {
    if (pattern.test(text)) return kind;
  }
  return null;
}

const SCAN_LIMIT = 60;

/**
 * Picks the header row: the first row, among the first 60, that names a date
 * column and at least two other known columns. If no row does, the row with
 * the most known column names wins, and failing that the first row.
 */
export function detectHeaderRow(rows: readonly (readonly string[])[]): number {
  let bestIndex = 0;
  let bestScore = 0;
  const limit = Math.min(rows.length, SCAN_LIMIT);
  for (let index = 0; index < limit; index += 1) {
    const kinds = new Set<HeaderKind>();
    for (const cell of rows[index]!) {
      const kind = headerKind(cell);
      if (kind) kinds.add(kind);
    }
    if (kinds.has('date') && kinds.size >= 3) return index;
    if (kinds.size > bestScore) {
      bestScore = kinds.size;
      bestIndex = index;
    }
  }
  return bestScore >= 2 ? bestIndex : 0;
}

/** Builds the table from a chosen header row. Every data row gets the header's width. */
export function buildTable(rows: readonly (readonly string[])[], headerRowIndex: number): RawTable {
  const headerRow = rows[headerRowIndex] ?? [];
  const dataRows = rows.slice(headerRowIndex + 1);
  const width = Math.max(headerRow.length, ...dataRows.map((row) => row.length), 0);

  // Trailing columns that are empty in the header and in every row are export padding.
  let usedWidth = width;
  while (
    usedWidth > 0 &&
    (headerRow[usedWidth - 1] ?? '').trim() === '' &&
    dataRows.every((row) => (row[usedWidth - 1] ?? '').trim() === '')
  ) {
    usedWidth -= 1;
  }

  const header: string[] = [];
  for (let column = 0; column < usedWidth; column += 1) {
    const name = (headerRow[column] ?? '').trim();
    header.push(name === '' ? `Column ${column + 1}` : name);
  }
  const body = dataRows.map((row) => {
    const cells: string[] = [];
    for (let column = 0; column < usedWidth; column += 1) cells.push((row[column] ?? '').trim());
    return cells;
  });
  return { header, rows: body, headerRowIndex };
}

/** Identifies a file layout, so a saved mapping can be offered for the same bank's export. */
export function headerSignature(header: readonly string[]): string {
  return header.map(normaliseHeader).join('|');
}

/** Every value in one column. */
export function columnValues(table: RawTable, column: number): string[] {
  return table.rows.map((row) => row[column] ?? '');
}
