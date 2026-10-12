import type { CategoryId } from '../categorise/categories';
import type { CategorisedTxn } from '../categorise/categoriser';
import { monthOf } from '../import/dates';
import type { IsoMonth } from '../types';
import { SIGNAL_DEFAULTS, type MonthSpikeParams, type TransactionSpikeParams } from './defaults';
import { fullMonths } from './monthly';
import { groupBy, mean, sum } from './stats';

export interface TransactionSpike {
  txn: CategorisedTxn;
  category: CategoryId;
  /** Average of the other money-out payments in the same category. */
  averageOthersPaise: number;
  othersCount: number;
  /** This payment divided by that average. */
  ratio: number;
}

/**
 * Unusually large payments: a money-out payment at least `ratio` times the
 * average of the *other* payments in its category (the payment itself is left
 * out of the average), at least `minAmountPaise`, with at least `minOthers`
 * other payments to compare against.
 *
 * The comparison is only with the user's own payments in this statement.
 */
export function detectTransactionSpikes(
  txns: readonly CategorisedTxn[],
  params: TransactionSpikeParams = SIGNAL_DEFAULTS.transactionSpike,
): TransactionSpike[] {
  const debits = txns.filter((txn) => txn.direction === 'debit');
  const spikes: TransactionSpike[] = [];

  for (const [category, group] of groupBy(debits, (txn) => txn.category)) {
    const othersCount = group.length - 1;
    if (othersCount < params.minOthers) continue;
    const total = sum(group.map((txn) => txn.amountPaise));
    for (const txn of group) {
      if (txn.amountPaise < params.minAmountPaise) continue;
      const averageOthersPaise = (total - txn.amountPaise) / othersCount;
      if (averageOthersPaise <= 0 || txn.amountPaise < params.ratio * averageOthersPaise) continue;
      spikes.push({
        txn,
        category: category as CategoryId,
        averageOthersPaise: Math.round(averageOthersPaise),
        othersCount,
        ratio: txn.amountPaise / averageOthersPaise,
      });
    }
  }
  return spikes.sort((a, b) => b.ratio - a.ratio || b.txn.amountPaise - a.txn.amountPaise);
}

export interface MonthSpike {
  category: CategoryId;
  month: IsoMonth;
  totalPaise: number;
  /** Average of this category's total in the other full months. */
  averageOthersPaise: number;
  otherMonths: number;
  /** Total divided by that average. Null when the average is zero. */
  ratio: number | null;
}

/**
 * Unusually heavy months: a category whose money out in one month is at least
 * `ratio` times its average in the *other* full months, and at least
 * `minIncreasePaise` above that average, with at least `minOtherMonths` other
 * full months to compare against. Months the statement only partly covers are
 * left out on both sides. A month with no spend in the category counts as zero.
 */
export function detectMonthSpikes(
  txns: readonly CategorisedTxn[],
  params: MonthSpikeParams = SIGNAL_DEFAULTS.monthSpike,
): MonthSpike[] {
  const months = fullMonths(txns);
  const otherMonths = months.length - 1;
  if (otherMonths < params.minOtherMonths) return [];

  const debits = txns.filter(
    (txn) => txn.direction === 'debit' && months.includes(monthOf(txn.date)),
  );
  const spikes: MonthSpike[] = [];

  for (const [category, group] of groupBy(debits, (txn) => txn.category)) {
    const perMonth = new Map<IsoMonth, number>(months.map((month) => [month, 0]));
    for (const txn of group) {
      const month = monthOf(txn.date);
      perMonth.set(month, perMonth.get(month)! + txn.amountPaise);
    }
    for (const month of months) {
      const totalPaise = perMonth.get(month)!;
      const others = months.filter((other) => other !== month).map((other) => perMonth.get(other)!);
      const averageOthersPaise = mean(others);
      if (totalPaise - averageOthersPaise < params.minIncreasePaise) continue;
      if (averageOthersPaise > 0 && totalPaise < params.ratio * averageOthersPaise) continue;
      spikes.push({
        category: category as CategoryId,
        month,
        totalPaise,
        averageOthersPaise: Math.round(averageOthersPaise),
        otherMonths,
        ratio: averageOthersPaise > 0 ? totalPaise / averageOthersPaise : null,
      });
    }
  }

  return spikes.sort(
    (a, b) =>
      b.totalPaise - b.averageOthersPaise - (a.totalPaise - a.averageOthersPaise) ||
      a.month.localeCompare(b.month),
  );
}
