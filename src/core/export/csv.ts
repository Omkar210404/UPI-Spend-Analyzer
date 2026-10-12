import { categoryLabel } from '../categorise/categories';
import type { CategorisedTxn } from '../categorise/categoriser';
import { paiseToDecimal } from '../format/inr';

export const EXPORT_HEADER = [
  'Date',
  'Merchant',
  'Category',
  'Category set by',
  'Debit',
  'Credit',
  'Balance',
  'Channel',
  'UPI handle',
  'Reference',
  'Note',
  'Narration',
] as const;

const CATEGORY_SOURCE: Readonly<Record<CategorisedTxn['reason']['kind'], string>> = {
  'txn-override': 'Your choice (this transaction)',
  'merchant-override': 'Your choice (this merchant)',
  credit: 'Default for money in',
  atm: 'ATM narration',
  rule: 'Keyword rule',
  'person-marker': 'P2A marker',
  none: 'No rule matched',
};

/**
 * Quotes a cell for CSV. A cell that a spreadsheet would run as a formula
 * (starting with `=`, `+`, `-` or `@`) gets a leading apostrophe, so a crafted
 * narration cannot execute when the export is opened.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The categorised transactions as CSV text, one row each, oldest first. */
export function toCsv(txns: readonly CategorisedTxn[]): string {
  const lines = [EXPORT_HEADER.join(',')];
  for (const txn of txns) {
    const source =
      txn.reason.kind === 'rule'
        ? `${CATEGORY_SOURCE.rule}: ${txn.reason.keyword}`
        : CATEGORY_SOURCE[txn.reason.kind];
    const cells = [
      txn.date,
      txn.merchantName,
      categoryLabel(txn.category),
      source,
      txn.direction === 'debit' ? paiseToDecimal(txn.amountPaise) : '',
      txn.direction === 'credit' ? paiseToDecimal(txn.amountPaise) : '',
      txn.balancePaise === null ? '' : paiseToDecimal(txn.balancePaise),
      txn.parsed.channel,
      txn.parsed.vpa ?? '',
      txn.reference ?? '',
      txn.parsed.note ?? '',
      txn.narration,
    ];
    // Amount cells are numbers we wrote ourselves; only text cells need the formula guard.
    lines.push(
      cells.map((cell, index) => (index >= 4 && index <= 6 ? cell : csvCell(cell))).join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}
