import type { CategorisedTxn } from '../categorise/categoriser';
import { daysBetween } from '../import/dates';
import { UNKNOWN_MERCHANT_KEY } from '../narration/merchant';
import { SIGNAL_DEFAULTS, type DuplicateParams } from './defaults';
import { groupBy } from './stats';

export interface DuplicateSignal {
  /**
   * `same-reference`: the rows carry the same transaction reference, so it is
   * one payment listed more than once (for example two overlapping exports).
   * `same-amount`: different or missing references, so it may be two charges.
   */
  kind: 'same-reference' | 'same-amount';
  merchantKey: string;
  merchantName: string;
  amountPaise: number;
  /** Days from the first of these payments to the last. */
  spanDays: number;
  /** The payments, oldest first. */
  payments: CategorisedTxn[];
}

/**
 * Possible duplicate charges: money-out payments to the same merchant, for
 * exactly the same amount, at most `windowDays` apart.
 *
 * Statements usually carry a date and no time, so "a short window" here means
 * the same day or the next. Payments under `minAmountPaise` are ignored.
 * Two real purchases of the same price on one day look exactly like this, so
 * it is a prompt to check, nothing more.
 */
export function detectDuplicates(
  txns: readonly CategorisedTxn[],
  params: DuplicateParams = SIGNAL_DEFAULTS.duplicates,
): DuplicateSignal[] {
  const candidates = txns.filter(
    (txn) =>
      txn.direction === 'debit' &&
      txn.amountPaise >= params.minAmountPaise &&
      txn.merchantKey !== UNKNOWN_MERCHANT_KEY,
  );
  const signals: DuplicateSignal[] = [];

  for (const group of groupBy(
    candidates,
    (txn) => `${txn.merchantKey}|${txn.amountPaise}`,
  ).values()) {
    if (group.length < 2) continue;
    const byDate = [...group].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let cluster: CategorisedTxn[] = [];
    const flush = (): void => {
      if (cluster.length >= 2) {
        const first = cluster[0]!;
        const references = cluster.map((txn) => txn.reference);
        const sameReference =
          references.every((reference) => reference !== null) && new Set(references).size === 1;
        signals.push({
          kind: sameReference ? 'same-reference' : 'same-amount',
          merchantKey: first.merchantKey,
          merchantName: first.merchantName,
          amountPaise: first.amountPaise,
          spanDays: daysBetween(first.date, cluster[cluster.length - 1]!.date),
          payments: cluster,
        });
      }
      cluster = [];
    };

    for (const payment of byDate) {
      const last = cluster[cluster.length - 1];
      if (last && daysBetween(last.date, payment.date) > params.windowDays) flush();
      cluster.push(payment);
    }
    flush();
  }

  return signals.sort(
    (a, b) =>
      b.amountPaise - a.amountPaise ||
      (a.payments[0]!.date < b.payments[0]!.date ? -1 : 1) ||
      a.merchantKey.localeCompare(b.merchantKey),
  );
}
