import type { CategoryId } from './categories';

/**
 * The user's own category choices, which beat every rule.
 *
 * `byTxn` is keyed by a transaction's fingerprint, `byMerchant` by merchant
 * key. Every function here returns a new object and leaves its input alone.
 */
export interface Overrides {
  byTxn: Readonly<Record<string, CategoryId>>;
  byMerchant: Readonly<Record<string, CategoryId>>;
}

export const EMPTY_OVERRIDES: Overrides = { byTxn: {}, byMerchant: {} };

function without<T>(
  record: Readonly<Record<string, T>>,
  keys: readonly string[],
): Record<string, T> {
  const remove = new Set(keys);
  return Object.fromEntries(Object.entries(record).filter(([key]) => !remove.has(key)));
}

/** A safe lookup: a key such as `constructor` must not find an inherited property. */
export function lookup<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

export function setTxnOverride(
  overrides: Overrides,
  txnId: string,
  category: CategoryId,
): Overrides {
  return { ...overrides, byTxn: { ...overrides.byTxn, [txnId]: category } };
}

export function clearTxnOverride(overrides: Overrides, txnId: string): Overrides {
  return { ...overrides, byTxn: without(overrides.byTxn, [txnId]) };
}

/**
 * Sets the category for every transaction from one merchant.
 * Per-transaction choices already made for that merchant's transactions are
 * removed, so the merchant-wide choice is what applies to all of them.
 */
export function setMerchantOverride(
  overrides: Overrides,
  merchantKey: string,
  category: CategoryId,
  txnIdsOfMerchant: readonly string[] = [],
): Overrides {
  return {
    byTxn: without(overrides.byTxn, txnIdsOfMerchant),
    byMerchant: { ...overrides.byMerchant, [merchantKey]: category },
  };
}

export function clearMerchantOverride(overrides: Overrides, merchantKey: string): Overrides {
  return { ...overrides, byMerchant: without(overrides.byMerchant, [merchantKey]) };
}

export function countOverrides(overrides: Overrides): number {
  return Object.keys(overrides.byTxn).length + Object.keys(overrides.byMerchant).length;
}
