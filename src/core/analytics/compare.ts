import type { CategoryId } from '../categorise/categories';
import type { CategorisedTxn } from '../categorise/categoriser';
import { monthOf, previousMonth } from '../import/dates';
import type { IsoMonth } from '../types';
import { categoryBreakdown } from './breakdown';
import { isPartialMonth, statementRange } from './monthly';

export interface ChangeRow {
  currentPaise: number;
  previousPaise: number;
  /** Current minus previous. */
  deltaPaise: number;
  /** Change as a share of the previous value (0.25 = 25% up). Null when the previous value is zero. */
  change: number | null;
}

export interface CategoryChange extends ChangeRow {
  category: CategoryId;
}

export interface MonthComparison {
  month: IsoMonth;
  previous: IsoMonth;
  /** False when the statement does not reach back to the previous month. */
  hasPrevious: boolean;
  currentPartial: boolean;
  previousPartial: boolean;
  rows: CategoryChange[];
  total: ChangeRow;
}

function change(currentPaise: number, previousPaise: number): ChangeRow {
  return {
    currentPaise,
    previousPaise,
    deltaPaise: currentPaise - previousPaise,
    change: previousPaise === 0 ? null : (currentPaise - previousPaise) / previousPaise,
  };
}

/**
 * Money out in one month against the calendar month before it, per category
 * and in total. A percentage is only given when there is a previous value to
 * divide by.
 */
export function monthOverMonth(txns: readonly CategorisedTxn[], month: IsoMonth): MonthComparison {
  const previous = previousMonth(month);
  const range = statementRange(txns);
  const current = new Map(categoryBreakdown(txns, month).map((row) => [row.category, row.paise]));
  const before = new Map(categoryBreakdown(txns, previous).map((row) => [row.category, row.paise]));

  const categories = new Set<CategoryId>([...current.keys(), ...before.keys()]);
  const rows = [...categories]
    .map((category) => ({
      category,
      ...change(current.get(category) ?? 0, before.get(category) ?? 0),
    }))
    .sort(
      (a, b) =>
        b.currentPaise - a.currentPaise ||
        b.previousPaise - a.previousPaise ||
        a.category.localeCompare(b.category),
    );

  const sumOf = (values: Map<CategoryId, number>): number =>
    [...values.values()].reduce((total, paise) => total + paise, 0);

  return {
    month,
    previous,
    hasPrevious: range !== null && previous >= monthOf(range.first),
    currentPartial: range !== null && isPartialMonth(month, range),
    previousPartial: range !== null && isPartialMonth(previous, range),
    rows,
    total: change(sumOf(current), sumOf(before)),
  };
}
