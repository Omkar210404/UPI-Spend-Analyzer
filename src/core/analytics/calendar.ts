import type { CategorisedTxn } from '../categorise/categoriser';
import { daysInIsoMonth, weekdayMondayFirst } from '../import/dates';
import type { IsoDate, IsoMonth } from '../types';
import { quantileSorted } from './stats';

export interface DaySpend {
  paise: number;
  count: number;
}

/** Money out per day. Days with no spend are absent. */
export function dailySpend(txns: readonly CategorisedTxn[]): Map<IsoDate, DaySpend> {
  const days = new Map<IsoDate, DaySpend>();
  for (const txn of txns) {
    if (txn.direction !== 'debit') continue;
    const day = days.get(txn.date) ?? { paise: 0, count: 0 };
    day.paise += txn.amountPaise;
    day.count += 1;
    days.set(txn.date, day);
  }
  return days;
}

/** Number of colour steps a day with spend can take. */
export const HEAT_LEVELS = 5;

/**
 * The upper bounds of the heatmap's colour steps.
 *
 * The bounds are the 20th, 40th, 60th and 80th percentiles of the days that
 * had any spend, so each step holds about a fifth of those days. Splitting the
 * range evenly instead would let one rent payment push every other day into
 * the palest step. Repeated bounds are merged, so there can be fewer steps.
 */
export function heatThresholds(dailyTotals: readonly number[]): number[] {
  const sorted = dailyTotals.filter((value) => value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const bounds: number[] = [];
  for (let step = 1; step < HEAT_LEVELS; step += 1) {
    const bound = quantileSorted(sorted, step / HEAT_LEVELS);
    if (bound !== bounds[bounds.length - 1] && bound < sorted[sorted.length - 1]!) {
      bounds.push(bound);
    }
  }
  return bounds;
}

/** 0 for a day with no spend, otherwise 1 (lowest step) up to `thresholds.length + 1`. */
export function heatLevel(paise: number, thresholds: readonly number[]): number {
  if (paise <= 0) return 0;
  let level = 1;
  for (const bound of thresholds) {
    if (paise > bound) level += 1;
  }
  return level;
}

/**
 * A month laid out as weeks from Monday to Sunday. Cells outside the month
 * are null.
 */
export function calendarWeeks(month: IsoMonth): (IsoDate | null)[][] {
  const lead = weekdayMondayFirst(`${month}-01`);
  const cells: (IsoDate | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInIsoMonth(month); day += 1) {
    cells.push(`${month}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (IsoDate | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}
