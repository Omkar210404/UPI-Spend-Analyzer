import { describe, expect, it } from 'vitest';

import type { ImportedRow } from '../import/mapping';
import { toTxns } from '../import/normalise';
import type { Txn } from '../types';
import { CATEGORIES, CATEGORY_IDS, RULE_CATEGORIES } from './categories';
import { categorise, categoriseAll, describeReason } from './categoriser';
import {
  clearMerchantOverride,
  clearTxnOverride,
  countOverrides,
  EMPTY_OVERRIDES,
  lookup,
  setMerchantOverride,
  setTxnOverride,
} from './overrides';
import { DEFAULT_RULES, keywordMatches, matchRules, normaliseKeyword, type Rule } from './rules';

function txn(narration: string, overrides: Partial<ImportedRow> = {}): Txn {
  return toTxns([
    {
      rowNumber: 1,
      date: '2026-04-01',
      narration,
      amountPaise: 10000,
      direction: 'debit',
      balancePaise: null,
      reference: null,
      ...overrides,
    },
  ])[0]!;
}

describe('keyword matching', () => {
  const words = (text: string) => text.split(' ');

  it('matches whole words only', () => {
    expect(keywordMatches('OLA', words('OLA CABS'))).toBe(true);
    expect(keywordMatches('OLA', words('COLABA STORES'))).toBe(false);
    expect(keywordMatches('OLA', words('CHOLA SWEETS'))).toBe(false);
    expect(keywordMatches('TEA', words('STEAM IRON'))).toBe(false);
  });

  it('matches a phrase only when the words sit together in order', () => {
    expect(keywordMatches('PRIME VIDEO', words('PAY PRIME VIDEO IN'))).toBe(true);
    expect(keywordMatches('PRIME VIDEO', words('VIDEO PRIME'))).toBe(false);
    expect(keywordMatches('PRIME VIDEO', words('PRIME TIME VIDEO'))).toBe(false);
  });

  it('matches the start of a word with a trailing star', () => {
    expect(keywordMatches('SWIGGY*', words('SWIGGYINSTAMART'))).toBe(true);
    expect(keywordMatches('SWIGGY*', words('SWIGGY'))).toBe(true);
    expect(keywordMatches('GROCER*', words('GREENLEAF GROCERS'))).toBe(true);
    expect(keywordMatches('GROCER*', words('MYGROCER'))).toBe(false);
  });

  it('cleans keywords as typed', () => {
    expect(normaliseKeyword('  prime-video ')).toBe('PRIME VIDEO');
    expect(normaliseKeyword('swiggy*')).toBe('SWIGGY*');
    expect(normaliseKeyword('*')).toBeNull();
    expect(normaliseKeyword(' ,. ')).toBeNull();
    expect(normaliseKeyword('a*b')).toBe('AB');
  });

  it('ignores case and punctuation in the text', () => {
    const rules: Rule[] = [{ id: 'r', category: 'food', keywords: ['chai corner'] }];
    expect(matchRules('upi/dr/chai-corner/tea', rules)?.keyword).toBe('chai corner');
    expect(matchRules('CHAICORNER', rules)).toBeNull();
  });

  it('returns the first rule that matches, in list order', () => {
    const rules: Rule[] = [
      { id: 'a', category: 'transport', keywords: ['METRO'] },
      { id: 'b', category: 'bills', keywords: ['RECHARGE'] },
    ];
    expect(matchRules('METRO RAIL RECHARGE', rules)?.rule.id).toBe('a');
    expect(matchRules('METRO RAIL RECHARGE', [...rules].reverse())?.rule.id).toBe('b');
  });
});

describe('default rules', () => {
  it('use only categories a rule may assign, each with keywords that survive cleaning', () => {
    for (const rule of DEFAULT_RULES) {
      expect(RULE_CATEGORIES).toContain(rule.category);
      expect(rule.keywords.length).toBeGreaterThan(0);
      for (const keyword of rule.keywords) expect(normaliseKeyword(keyword)).toBe(keyword);
    }
    expect(new Set(DEFAULT_RULES.map((rule) => rule.id)).size).toBe(DEFAULT_RULES.length);
  });

  it.each([
    [
      'UPI-GREENLEAF GROCERS-greenleaf.grocers@okdemo-DEMO0001234-412345678901-GROCERIES',
      'groceries',
    ],
    ['UPI/DR/423456789012/CHAI CORNER CAFE/DEMO/chaicorner@okdemo/Tea', 'food'],
    [
      'TO TRANSFER-UPI/DR/434567890123/METRO RAIL RECHARGE/DEMO/metrorail@demoupi/Card topup--',
      'transport',
    ],
    ['UPI/P2M/445678901234/ZIPCAB RIDES/Ride fare/DEMO BANK', 'transport'],
    [
      'UPI/NIMBUS STREAM/nimbus.stream@demopay/Monthly plan/DEMO BANK/456789012345/DMO9f3a2c',
      'subscriptions',
    ],
    ['ACH D- BRIGHTPOWER ELECTRICITY-DEMO7781234', 'bills'],
    ['UPI 489012345678 PAID TO lakeside.pharmacy@okdemo', 'health'],
    ['POS XXXXXXXXXXXX0000 PAGETURN BOOKS', 'shopping'],
    ['UPI/P2A/445678901236/HILLVIEW LANDLORD/Rent April/DEMO BANK', 'rent'],
    ['ATM WDL DEMO NAGAR BRANCH', 'cash'],
    ['UPI/P2A/445678901235/ASHA SAMPLE/Dinner split/DEMO BANK', 'transfers'],
    ['POS/URBAN THREADS/DEMO CITY/140426', 'other'],
  ])('file %s under %s', (narration, category) => {
    expect(categorise(txn(narration), DEFAULT_RULES, EMPTY_OVERRIDES).category).toBe(category);
  });

  it('a keyword rule beats the person marker', () => {
    const result = categorise(
      txn('UPI/P2A/445678901236/HILLVIEW LANDLORD/Rent April/DEMO BANK'),
      DEFAULT_RULES,
      EMPTY_OVERRIDES,
    );
    expect(result.reason).toMatchObject({ kind: 'rule', ruleId: 'default-rent' });
  });
});

describe('categorise', () => {
  const tea = txn('UPI/DR/423456789012/CHAI CORNER CAFE/DEMO/chaicorner@okdemo/Tea');
  const salary = txn('NEFT-DEMON26000001-ORBIT TECHNOLOGIES PAYROLL-SALARY APR', {
    direction: 'credit',
  });

  it('files money coming in under income, whatever the rules say', () => {
    const rules: Rule[] = [{ id: 'r', category: 'food', keywords: ['PAYROLL'] }];
    expect(categorise(salary, rules, EMPTY_OVERRIDES)).toEqual({
      category: 'income',
      reason: { kind: 'credit' },
    });
  });

  it('files an ATM withdrawal under cash before looking at rules', () => {
    const rules: Rule[] = [{ id: 'r', category: 'food', keywords: ['ATM'] }];
    expect(categorise(txn('ATM WDL DEMO NAGAR'), rules, EMPTY_OVERRIDES).category).toBe('cash');
  });

  it('says which rule and keyword matched', () => {
    expect(categorise(tea, DEFAULT_RULES, EMPTY_OVERRIDES)).toEqual({
      category: 'food',
      reason: { kind: 'rule', ruleId: 'default-food', keyword: 'CAFE' },
    });
  });

  it('falls to other with no rules', () => {
    expect(categorise(tea, [], EMPTY_OVERRIDES)).toEqual({
      category: 'other',
      reason: { kind: 'none' },
    });
  });

  it('lets a merchant override beat the rules, for money out and money in', () => {
    const overrides = setMerchantOverride(EMPTY_OVERRIDES, tea.merchantKey, 'shopping');
    expect(categorise(tea, DEFAULT_RULES, overrides)).toEqual({
      category: 'shopping',
      reason: { kind: 'merchant-override' },
    });
    const payroll = setMerchantOverride(EMPTY_OVERRIDES, salary.merchantKey, 'transfers');
    expect(categorise(salary, DEFAULT_RULES, payroll).category).toBe('transfers');
  });

  it('lets a transaction override beat a merchant override', () => {
    let overrides = setMerchantOverride(EMPTY_OVERRIDES, tea.merchantKey, 'shopping');
    overrides = setTxnOverride(overrides, tea.id, 'health');
    expect(categorise(tea, DEFAULT_RULES, overrides)).toEqual({
      category: 'health',
      reason: { kind: 'txn-override' },
    });
  });

  it('applies a merchant override to every transaction from that merchant and no other', () => {
    const second = txn('UPI/DR/423456789099/CHAI CORNER CAFE/DEMO/chaicorner@okdemo/Snacks', {
      date: '2026-04-02',
    });
    const other = txn('UPI/P2M/445678901234/ZIPCAB RIDES/Ride fare/DEMO BANK');
    const overrides = setMerchantOverride(EMPTY_OVERRIDES, tea.merchantKey, 'shopping');
    const result = categoriseAll([tea, second, other], DEFAULT_RULES, overrides);
    expect(result.map((entry) => entry.category)).toEqual(['shopping', 'shopping', 'transport']);
  });

  it('explains every kind of reason in a sentence', () => {
    const p2a = txn('UPI/P2A/445678901235/ASHA SAMPLE/Dinner split/DEMO BANK');
    const cases = [
      categorise(tea, DEFAULT_RULES, EMPTY_OVERRIDES),
      categorise(tea, [], EMPTY_OVERRIDES),
      categorise(salary, DEFAULT_RULES, EMPTY_OVERRIDES),
      categorise(txn('ATM WDL DEMO NAGAR'), DEFAULT_RULES, EMPTY_OVERRIDES),
      categorise(p2a, DEFAULT_RULES, EMPTY_OVERRIDES),
      categorise(tea, DEFAULT_RULES, setTxnOverride(EMPTY_OVERRIDES, tea.id, 'rent')),
      categorise(tea, DEFAULT_RULES, setMerchantOverride(EMPTY_OVERRIDES, tea.merchantKey, 'rent')),
    ];
    const sentences = cases.map((entry) => describeReason(entry.reason, entry.category));
    expect(new Set(sentences).size).toBe(cases.length);
    expect(sentences[0]).toBe('A Food and dining rule matched the keyword "CAFE".');
  });
});

describe('overrides', () => {
  it('never change the object they are given', () => {
    const before = setTxnOverride(EMPTY_OVERRIDES, 't1', 'food');
    const snapshot = JSON.stringify(before);
    setTxnOverride(before, 't2', 'rent');
    setMerchantOverride(before, 'M', 'rent', ['t1']);
    clearTxnOverride(before, 't1');
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(EMPTY_OVERRIDES).toEqual({ byTxn: {}, byMerchant: {} });
  });

  it('replace per-transaction choices when a merchant-wide choice is made', () => {
    let overrides = setTxnOverride(EMPTY_OVERRIDES, 't1', 'food');
    overrides = setTxnOverride(overrides, 't2', 'health');
    overrides = setTxnOverride(overrides, 't9', 'rent');
    overrides = setMerchantOverride(overrides, 'CHAI CORNER CAFE', 'shopping', ['t1', 't2']);
    expect(overrides).toEqual({
      byTxn: { t9: 'rent' },
      byMerchant: { 'CHAI CORNER CAFE': 'shopping' },
    });
    expect(countOverrides(overrides)).toBe(2);
  });

  it('can be cleared one at a time', () => {
    let overrides = setTxnOverride(EMPTY_OVERRIDES, 't1', 'food');
    overrides = setMerchantOverride(overrides, 'M', 'rent');
    overrides = clearTxnOverride(overrides, 't1');
    overrides = clearMerchantOverride(overrides, 'M');
    expect(overrides).toEqual(EMPTY_OVERRIDES);
  });

  it('do not find inherited properties', () => {
    expect(lookup({}, 'constructor')).toBeUndefined();
    expect(lookup({}, 'toString')).toBeUndefined();
    expect(lookup({ a: 1 }, 'a')).toBe(1);
  });
});

describe('categories', () => {
  it('cover every id once, in the same order', () => {
    expect(CATEGORIES.map((category) => category.id)).toEqual([...CATEGORY_IDS]);
  });
});
