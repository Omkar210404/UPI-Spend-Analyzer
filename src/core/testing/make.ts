import type { CategoryId } from '../categorise/categories';
import { categoriseAll, type CategorisedTxn } from '../categorise/categoriser';
import { EMPTY_OVERRIDES } from '../categorise/overrides';
import { DEFAULT_RULES } from '../categorise/rules';
import type { ImportedRow } from '../import/mapping';
import { toTxns } from '../import/normalise';
import type { IsoDate } from '../types';

/**
 * Test helper: builds categorised transactions through the real pipeline
 * (narration parser, merchant key, categoriser) from a compact description.
 * Only tests import this file.
 */
export interface Spec {
  date: IsoDate;
  /** Payee name, written into a Style B UPI narration. */
  merchant: string;
  rupees: number;
  credit?: boolean;
  /** Reference to use. A unique one is generated when omitted. */
  reference?: string;
  /** Use this narration instead of building one from the merchant. */
  narration?: string;
}

let counter = 0;

export function spec(
  date: IsoDate,
  merchant: string,
  rupees: number,
  extra: Partial<Spec> = {},
): Spec {
  return { date, merchant, rupees, ...extra };
}

export function build(specs: readonly Spec[]): CategorisedTxn[] {
  const rows = specs.map((entry, index): ImportedRow => {
    counter += 1;
    const reference = entry.reference ?? String(400000000000 + counter);
    const handle = `${entry.merchant.toLowerCase().replace(/[^a-z]/g, '')}@okdemo`;
    return {
      rowNumber: index + 1,
      date: entry.date,
      narration:
        entry.narration ??
        `UPI/${entry.credit ? 'CR' : 'DR'}/${reference}/${entry.merchant}/DEMO/${handle}`,
      amountPaise: Math.round(entry.rupees * 100),
      direction: entry.credit ? 'credit' : 'debit',
      balancePaise: null,
      reference: null,
    };
  });
  return categoriseAll(toTxns(rows), DEFAULT_RULES, EMPTY_OVERRIDES);
}

/** The same transactions with every category replaced, for tests about one category. */
export function inCategory(
  txns: readonly CategorisedTxn[],
  category: CategoryId,
): CategorisedTxn[] {
  return txns.map((txn) => ({ ...txn, category }));
}
