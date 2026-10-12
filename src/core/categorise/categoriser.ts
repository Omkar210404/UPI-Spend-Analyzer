import type { Txn } from '../types';
import { categoryLabel, type CategoryId } from './categories';
import { lookup, type Overrides } from './overrides';
import { matchRules, type Rule } from './rules';

/** Why a transaction ended up in its category. Shown to the user next to every transaction. */
export type CategoryReason =
  | { kind: 'txn-override' }
  | { kind: 'merchant-override' }
  | { kind: 'credit' }
  | { kind: 'atm' }
  | { kind: 'rule'; ruleId: string; keyword: string }
  | { kind: 'person-marker' }
  | { kind: 'none' };

export interface CategorisedTxn extends Txn {
  category: CategoryId;
  reason: CategoryReason;
}

/** The text keyword rules are matched against: the narration plus the merchant name. */
function ruleText(txn: Txn): string {
  return `${txn.merchantName} ${txn.narration}`;
}

/**
 * Decides one transaction's category. In order:
 *  1. the user's choice for this exact transaction;
 *  2. the user's choice for this merchant;
 *  3. money coming in is "Income and credits";
 *  4. an ATM narration is a cash withdrawal;
 *  5. the first keyword rule that matches;
 *  6. a narration marked as a transfer to a person is "Transfers to people";
 *  7. otherwise "Other".
 */
export function categorise(
  txn: Txn,
  rules: readonly Rule[],
  overrides: Overrides,
): { category: CategoryId; reason: CategoryReason } {
  const own = lookup(overrides.byTxn, txn.id);
  if (own) return { category: own, reason: { kind: 'txn-override' } };

  const merchant = lookup(overrides.byMerchant, txn.merchantKey);
  if (merchant) return { category: merchant, reason: { kind: 'merchant-override' } };

  if (txn.direction === 'credit') return { category: 'income', reason: { kind: 'credit' } };

  if (txn.parsed.channel === 'ATM') return { category: 'cash', reason: { kind: 'atm' } };

  const match = matchRules(ruleText(txn), rules);
  if (match) {
    return {
      category: match.rule.category,
      reason: { kind: 'rule', ruleId: match.rule.id, keyword: match.keyword },
    };
  }

  if (txn.parsed.personToPerson) {
    return { category: 'transfers', reason: { kind: 'person-marker' } };
  }
  return { category: 'other', reason: { kind: 'none' } };
}

export function categoriseAll(
  txns: readonly Txn[],
  rules: readonly Rule[],
  overrides: Overrides,
): CategorisedTxn[] {
  return txns.map((txn) => ({ ...txn, ...categorise(txn, rules, overrides) }));
}

/** One sentence explaining a category, for the transaction detail view. */
export function describeReason(reason: CategoryReason, category: CategoryId): string {
  const label = categoryLabel(category);
  switch (reason.kind) {
    case 'txn-override':
      return `You chose ${label} for this transaction.`;
    case 'merchant-override':
      return `You chose ${label} for every transaction from this merchant.`;
    case 'credit':
      return 'Money coming in is filed under Income and credits unless you change it.';
    case 'atm':
      return 'The narration is an ATM cash withdrawal.';
    case 'rule':
      return `A ${label} rule matched the keyword "${reason.keyword}".`;
    case 'person-marker':
      return 'The narration marks this as a transfer to a person (P2A).';
    case 'none':
      return 'No rule matched, so it is filed under Other.';
  }
}
