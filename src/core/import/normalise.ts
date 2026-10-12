import { merchantIdentity } from '../narration/merchant';
import { parseNarration } from '../narration/registry';
import type { NarrationPattern } from '../narration/types';
import type { Txn } from '../types';
import type { ImportedRow } from './mapping';

/** 32-bit FNV-1a over the UTF-16 code units of a string. */
function fnv1a(text: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * A short, stable fingerprint of one statement row.
 *
 * Transactions are never stored, so a per-transaction category override is
 * kept under this fingerprint instead. Importing the same statement again
 * produces the same fingerprints, and the overrides line up again. It is a
 * plain non-cryptographic hash: enough to tell rows apart, not a secret.
 */
export function fingerprint(
  row: Pick<ImportedRow, 'date' | 'amountPaise' | 'direction' | 'narration'>,
): string {
  const text = `${row.date}|${row.amountPaise}|${row.direction}|${row.narration}`;
  const high = fnv1a(text, 0x811c9dc5).toString(16).padStart(8, '0');
  const low = fnv1a(text, 0x9747b28c).toString(16).padStart(8, '0');
  return `${high}${low}`;
}

/**
 * Turns imported rows into transactions: reads each narration, works out the
 * merchant, gives the row its fingerprint, and sorts by date (rows of the same
 * day keep the order they had in the file).
 */
export function toTxns(
  rows: readonly ImportedRow[],
  patterns?: readonly NarrationPattern[],
): Txn[] {
  const seen = new Map<string, number>();
  const txns = rows.map((row): Txn => {
    const parsed = parseNarration(row.narration, patterns);
    const merchant = merchantIdentity(parsed);
    const base = fingerprint(row);
    // Two identical rows (same day, amount and narration) still need distinct ids.
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return {
      id: occurrence === 1 ? base : `${base}-${occurrence}`,
      date: row.date,
      narration: row.narration,
      amountPaise: row.amountPaise,
      direction: row.direction,
      balancePaise: row.balancePaise,
      reference: parsed.reference ?? row.reference,
      parsed,
      merchantKey: merchant.key,
      merchantName: merchant.name,
    };
  });
  return txns
    .map((txn, index) => ({ txn, index }))
    .sort((a, b) =>
      a.txn.date < b.txn.date ? -1 : a.txn.date > b.txn.date ? 1 : a.index - b.index,
    )
    .map(({ txn }) => txn);
}
