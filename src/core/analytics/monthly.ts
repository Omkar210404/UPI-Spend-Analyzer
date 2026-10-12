import type { CategorisedTxn } from '../categorise/categoriser';
import { daysInIsoMonth, fromIso, monthOf, monthRange } from '../import/dates';
import type { IsoDate, IsoMonth } from '../types';
import { PARTIAL_MONTH_TOLERANCE_DAYS } from './defaults';

/** One calendar month, or the whole statement. */
export type Period = IsoMonth | 'all';

export function inPeriod(txn: { date: IsoDate }, period: Period): boolean {
  return period === 'all' || monthOf(txn.date) === period;
}

export interface StatementRange {
  first: IsoDate;
  last: IsoDate;
}

/** The dates of the earliest and latest transaction. */
export function statementRange(txns: readonly { date: IsoDate }[]): StatementRange | null {
  if (txns.length === 0) return null;
  let first = txns[0]!.date;
  let last = first;
  for (const txn of txns) {
    if (txn.date < first) first = txn.date;
    if (txn.date > last) last = txn.date;
  }
  return { first, last };
}

/**
 * Whether the statement only covers part of this month. Only the first and
 * the last month of a statement can be partial.
 */
export function isPartialMonth(
  month: IsoMonth,
  range: StatementRange,
  toleranceDays: number = PARTIAL_MONTH_TOLERANCE_DAYS,
): boolean {
  const startsLate = monthOf(range.first) === month && fromIso(range.first).day > 1 + toleranceDays;
  const endsEarly =
    monthOf(range.last) === month &&
    fromIso(range.last).day < daysInIsoMonth(month) - toleranceDays;
  return startsLate || endsEarly;
}

export interface Totals {
  /** Sum of credits. */
  inPaise: number;
  /** Sum of debits. */
  outPaise: number;
  /** Money in minus money out. */
  netPaise: number;
  count: number;
  debitCount: number;
  creditCount: number;
}

export function totals(txns: readonly CategorisedTxn[], period: Period = 'all'): Totals {
  const result: Totals = {
    inPaise: 0,
    outPaise: 0,
    netPaise: 0,
    count: 0,
    debitCount: 0,
    creditCount: 0,
  };
  for (const txn of txns) {
    if (!inPeriod(txn, period)) continue;
    result.count += 1;
    if (txn.direction === 'debit') {
      result.outPaise += txn.amountPaise;
      result.debitCount += 1;
    } else {
      result.inPaise += txn.amountPaise;
      result.creditCount += 1;
    }
  }
  result.netPaise = result.inPaise - result.outPaise;
  return result;
}

export interface MonthSummary extends Totals {
  month: IsoMonth;
  partial: boolean;
}

/**
 * Money in and money out for every calendar month the statement touches,
 * oldest first. A month with no transactions between the first and last is
 * still listed, with zeros.
 */
export function monthlySummary(txns: readonly CategorisedTxn[]): MonthSummary[] {
  const range = statementRange(txns);
  if (!range) return [];
  return monthRange(monthOf(range.first), monthOf(range.last)).map((month) => ({
    month,
    partial: isPartialMonth(month, range),
    ...totals(txns, month),
  }));
}

/** The months the statement covers in full. */
export function fullMonths(txns: readonly CategorisedTxn[]): IsoMonth[] {
  const range = statementRange(txns);
  if (!range) return [];
  return monthRange(monthOf(range.first), monthOf(range.last)).filter(
    (month) => !isPartialMonth(month, range),
  );
}
