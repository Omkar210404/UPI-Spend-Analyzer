import type { CategoryId } from '../categorise/categories';
import { categoryLabel } from '../categorise/categories';
import type { CategorisedTxn } from '../categorise/categoriser';
import { monthOf } from '../import/dates';
import type { IsoMonth } from '../types';
import { SIGNAL_DEFAULTS, type MonthSpikeParams, type TransactionSpikeParams } from './defaults';
import { fullMonths } from './monthly';
import { groupBy, mean, sum } from './stats';

export interface TransactionSpike {
  txn: CategorisedTxn;
  category: CategoryId;
  /**
   * What the payment was compared with: the user's other payments to the same
   * merchant, or, when there are too few of those, their other payments in
   * the same category.
   */
  basis: 'merchant' | 'category';
  /** Plain name of the comparison group, such as "Spice Route Kitchen" or "Health". */
  basisLabel: string;
  /** Average of the other payments in the comparison group. */
  averageOthersPaise: number;
  othersCount: number;
  /** This payment divided by that average. */
  ratio: number;
}

/**
 * Unusually large payments: a money-out payment at least `ratio` times the
 * user's own average, and at least `minAmountPaise`.
 *
 * "Their own average" is the average of their *other* payments to the same
 * merchant (the payment itself is left out). A merchant paid fewer than
 * `minOthers` other times has no usable average, so the payment is compared
 * with the other payments in its category instead. With too few of those as
 * well, nothing is said.
 *
 * Comparing with the merchant first matters: a category mixes ₹30 teas with
 * ₹1,200 dinners, and against that average every ordinary dinner looks huge.
 */
export function detectTransactionSpikes(
  txns: readonly CategorisedTxn[],
  params: TransactionSpikeParams = SIGNAL_DEFAULTS.transactionSpike,
): TransactionSpike[] {
  const debits = txns.filter((txn) => txn.direction === 'debit');
  const byMerchant = groupBy(debits, (txn) => txn.merchantKey);
  const byCategory = groupBy(debits, (txn) => txn.category);
  const totalOf = new Map<CategorisedTxn[], number>();
  const total = (group: CategorisedTxn[]): number => {
    let value = totalOf.get(group);
    if (value === undefined) {
      value = sum(group.map((txn) => txn.amountPaise));
      totalOf.set(group, value);
    }
    return value;
  };

  const spikes: TransactionSpike[] = [];
  for (const txn of debits) {
    if (txn.amountPaise < params.minAmountPaise) continue;

    const merchant = byMerchant.get(txn.merchantKey)!;
    const category = byCategory.get(txn.category)!;
    const useMerchant = merchant.length - 1 >= params.minOthers;
    const group = useMerchant ? merchant : category;
    const othersCount = group.length - 1;
    if (othersCount < params.minOthers) continue;

    const averageOthersPaise = (total(group) - txn.amountPaise) / othersCount;
    if (averageOthersPaise <= 0 || txn.amountPaise < params.ratio * averageOthersPaise) continue;
    spikes.push({
      txn,
      category: txn.category,
      basis: useMerchant ? 'merchant' : 'category',
      basisLabel: useMerchant ? txn.merchantName : categoryLabel(txn.category),
      averageOthersPaise: Math.round(averageOthersPaise),
      othersCount,
      ratio: txn.amountPaise / averageOthersPaise,
    });
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
