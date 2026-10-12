import type { CategoryId } from '../categorise/categories';
import type { CategorisedTxn } from '../categorise/categoriser';
import { daysBetween } from '../import/dates';
import { UNKNOWN_MERCHANT_KEY } from '../narration/merchant';
import { SIGNAL_DEFAULTS, type RecurringParams } from './defaults';
import { groupBy, median } from './stats';

export interface RecurringSignal {
  merchantKey: string;
  merchantName: string;
  category: CategoryId;
  /** Median amount of the payments. */
  typicalPaise: number;
  minPaise: number;
  maxPaise: number;
  /** Days between each payment and the next. */
  gapsDays: number[];
  medianGapDays: number;
  /** The payments that form the pattern, oldest first. */
  payments: CategorisedTxn[];
}

/**
 * Splits one merchant's payments into groups of similar amount.
 *
 * Amounts are taken smallest first. An amount joins the current group if,
 * with it included, the group's smallest and largest amounts both stay
 * within the tolerance of the group's median. Otherwise it starts a new group.
 */
export function groupBySimilarAmount(
  txns: readonly CategorisedTxn[],
  tolerance: number,
): CategorisedTxn[][] {
  const sorted = [...txns].sort((a, b) => a.amountPaise - b.amountPaise);
  const groups: CategorisedTxn[][] = [];
  let current: CategorisedTxn[] = [];
  for (const txn of sorted) {
    const candidate = [...current, txn];
    const middle = median(candidate.map((entry) => entry.amountPaise));
    const fits =
      candidate[0]!.amountPaise >= middle * (1 - tolerance) &&
      txn.amountPaise <= middle * (1 + tolerance);
    if (current.length === 0 || fits) {
      current = candidate;
    } else {
      groups.push(current);
      current = [txn];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/** The longest stretch of consecutive payments whose gaps all fall in the allowed range. */
function longestMonthlyRun(
  payments: readonly CategorisedTxn[],
  params: RecurringParams,
): CategorisedTxn[] {
  let best: CategorisedTxn[] = [];
  let run: CategorisedTxn[] = [];
  for (const payment of payments) {
    const last = run[run.length - 1];
    const gap = last ? daysBetween(last.date, payment.date) : 0;
    if (last && gap >= params.minGapDays && gap <= params.maxGapDays) {
      run.push(payment);
    } else {
      run = [payment];
    }
    if (run.length > best.length) best = [...run];
  }
  return best;
}

/**
 * Recurring payments: the same merchant, a similar amount, roughly monthly.
 *
 * For each merchant, money-out payments are grouped by similar amount. Within
 * a group, payments a day or less apart count once. The signal is the longest
 * run of at least `minPayments` payments in which every gap is between
 * `minGapDays` and `maxGapDays`, provided the median gap is between
 * `medianGapMinDays` and `medianGapMaxDays`.
 *
 * This only describes a pattern in past payments. It does not know whether a
 * mandate exists or whether the payment will happen again.
 */
export function detectRecurring(
  txns: readonly CategorisedTxn[],
  params: RecurringParams = SIGNAL_DEFAULTS.recurring,
): RecurringSignal[] {
  const debits = txns.filter(
    (txn) => txn.direction === 'debit' && txn.merchantKey !== UNKNOWN_MERCHANT_KEY,
  );
  const signals: RecurringSignal[] = [];

  for (const [merchantKey, ofMerchant] of groupBy(debits, (txn) => txn.merchantKey)) {
    if (ofMerchant.length < params.minPayments) continue;
    for (const group of groupBySimilarAmount(ofMerchant, params.amountTolerance)) {
      const byDate = [...group].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const distinct: CategorisedTxn[] = [];
      for (const payment of byDate) {
        const last = distinct[distinct.length - 1];
        if (last && daysBetween(last.date, payment.date) <= params.sameChargeWindowDays) continue;
        distinct.push(payment);
      }

      const run = longestMonthlyRun(distinct, params);
      if (run.length < params.minPayments) continue;
      const gapsDays = run
        .slice(1)
        .map((payment, index) => daysBetween(run[index]!.date, payment.date));
      const medianGapDays = median(gapsDays);
      if (medianGapDays < params.medianGapMinDays || medianGapDays > params.medianGapMaxDays) {
        continue;
      }

      const amounts = run.map((payment) => payment.amountPaise);
      const latest = run[run.length - 1]!;
      signals.push({
        merchantKey,
        merchantName: latest.merchantName,
        category: latest.category,
        typicalPaise: Math.round(median(amounts)),
        minPaise: Math.min(...amounts),
        maxPaise: Math.max(...amounts),
        gapsDays,
        medianGapDays,
        payments: run,
      });
    }
  }

  return signals.sort(
    (a, b) => b.typicalPaise - a.typicalPaise || a.merchantKey.localeCompare(b.merchantKey),
  );
}
