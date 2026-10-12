import type { CategoryId } from '../categorise/categories';
import type { CategorisedTxn } from '../categorise/categoriser';
import type { Direction } from '../types';
import { inPeriod, type Period } from './monthly';
import { groupBy, sum } from './stats';

function debitsIn(txns: readonly CategorisedTxn[], period: Period): CategorisedTxn[] {
  return txns.filter((txn) => txn.direction === 'debit' && inPeriod(txn, period));
}

export interface CategoryShare {
  category: CategoryId;
  paise: number;
  /** This category's part of all money out in the period, from 0 to 1. */
  share: number;
  count: number;
}

/** Money out per category for the period, largest first. Categories with no spend are left out. */
export function categoryBreakdown(
  txns: readonly CategorisedTxn[],
  period: Period = 'all',
): CategoryShare[] {
  const debits = debitsIn(txns, period);
  const total = sum(debits.map((txn) => txn.amountPaise));
  return [...groupBy(debits, (txn) => txn.category)]
    .map(([category, group]) => {
      const paise = sum(group.map((txn) => txn.amountPaise));
      return {
        category: category as CategoryId,
        paise,
        share: total === 0 ? 0 : paise / total,
        count: group.length,
      };
    })
    .sort((a, b) => b.paise - a.paise || a.category.localeCompare(b.category));
}

export interface MerchantTotal {
  merchantKey: string;
  merchantName: string;
  paise: number;
  count: number;
  /** The category most of this merchant's spend falls in. */
  category: CategoryId;
}

/** The merchants with the most money out in the period. */
export function topMerchants(
  txns: readonly CategorisedTxn[],
  period: Period = 'all',
  limit = 10,
): MerchantTotal[] {
  return [...groupBy(debitsIn(txns, period), (txn) => txn.merchantKey)]
    .map(([merchantKey, group]) => {
      const byCategory = [...groupBy(group, (txn) => txn.category)]
        .map(([category, items]) => ({
          category: category as CategoryId,
          paise: sum(items.map((txn) => txn.amountPaise)),
        }))
        .sort((a, b) => b.paise - a.paise);
      return {
        merchantKey,
        merchantName: group[0]!.merchantName,
        paise: sum(group.map((txn) => txn.amountPaise)),
        count: group.length,
        category: byCategory[0]!.category,
      };
    })
    .sort((a, b) => b.paise - a.paise || a.merchantKey.localeCompare(b.merchantKey))
    .slice(0, limit);
}

/** The largest single transactions in the period, biggest first. */
export function largestTransactions(
  txns: readonly CategorisedTxn[],
  period: Period = 'all',
  limit = 10,
  direction: Direction = 'debit',
): CategorisedTxn[] {
  return txns
    .filter((txn) => txn.direction === direction && inPeriod(txn, period))
    .sort((a, b) => b.amountPaise - a.amountPaise || (a.date < b.date ? -1 : 1))
    .slice(0, limit);
}
