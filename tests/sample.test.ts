import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { generateSample, SEED } from '../scripts/generate-sample.mjs';
import { categoryBreakdown, topMerchants } from '../src/core/analytics/breakdown';
import { dailySpend } from '../src/core/analytics/calendar';
import { detectDuplicates } from '../src/core/analytics/duplicates';
import { fullMonths, monthlySummary, totals } from '../src/core/analytics/monthly';
import { detectRecurring } from '../src/core/analytics/recurring';
import { detectMonthSpikes, detectTransactionSpikes } from '../src/core/analytics/spikes';
import { categoriseAll } from '../src/core/categorise/categoriser';
import { EMPTY_OVERRIDES, setMerchantOverride } from '../src/core/categorise/overrides';
import { DEFAULT_RULES } from '../src/core/categorise/rules';
import { toCsv } from '../src/core/export/csv';
import { parseCsvText } from '../src/core/import/csv';
import { applyMapping, validateMapping } from '../src/core/import/mapping';
import { toTxns } from '../src/core/import/normalise';
import { prepareImport } from '../src/core/import/prepare';
import { PATTERNS } from '../src/core/narration/registry';

/**
 * The whole pipeline, end to end, on the synthetic sample statement:
 * read the CSV, find the table, map the columns, parse the narrations,
 * categorise, aggregate, and look for signals.
 */

const samplePath = fileURLToPath(new URL('../src/sample/sample-statement.csv', import.meta.url));
const csv = readFileSync(samplePath, 'utf8');

const prepared = prepareImport(parseCsvText(csv));
const validation = validateMapping(prepared.suggestion.draft, prepared.table);
if (!validation.ok) throw new Error(validation.errors.join(' '));
const imported = applyMapping(prepared.table, validation.mapping);
const raw = toTxns(imported.rows);
const txns = categoriseAll(raw, DEFAULT_RULES, EMPTY_OVERRIDES);

describe('the committed sample', () => {
  it('is exactly what the generator script produces', () => {
    expect(csv).toBe(generateSample(SEED));
    expect(generateSample(SEED)).toBe(generateSample(SEED));
    expect(generateSample(SEED + 1)).not.toBe(csv);
  });

  it('labels itself as synthetic', () => {
    expect(csv.split('\n')[0]).toMatch(/SAMPLE STATEMENT \(synthetic data, not a real account\)/);
  });

  it('contains no phone-shaped, PAN-shaped or card-length numbers', () => {
    expect(csv).not.toMatch(/(?<!\d)[6-9]\d{9}(?!\d)/);
    expect(csv).not.toMatch(/\b[A-Z]{5}\d{4}[A-Z]\b/);
    expect(csv).not.toMatch(/(?<!\d)\d{13,19}(?!\d)/);
  });
});

describe('importing the sample', () => {
  it('finds the header under the account block and maps the columns by itself', () => {
    expect(prepared.table.headerRowIndex).toBe(4);
    expect(prepared.suggestion.draft).toMatchObject({
      date: 0,
      narration: 2,
      reference: 3,
      debit: 5,
      credit: 6,
      balance: 7,
      amountMode: 'debit-credit',
      dateFormat: 'dmy',
    });
    expect(prepared.suggestion.dateDetection.ambiguous).toBe(false);
  });

  it('flags the account number column and keeps none of it', () => {
    expect(
      prepared.sensitive.map((entry) => [prepared.table.header[entry.column], entry.kind]),
    ).toEqual([['Account No', 'account-number']]);
    expect(JSON.stringify(txns)).not.toContain('XXXXXXXX0000');
    expect(JSON.stringify(txns)).not.toContain('SAMPLE HOLDER');
  });

  it('reads every row except the closing line, and says which one it skipped', () => {
    expect(imported.rows.length).toBe(prepared.table.rows.length - 1);
    expect(imported.skipped).toHaveLength(1);
    expect(imported.skipped[0]).toMatchObject({ reason: 'bad-date' });
    expect(imported.skipped[0]!.preview).toMatch(/End of statement/);
  });

  it('reproduces the running balance on every row', () => {
    // Opening balance is the first row's balance with its own movement undone.
    const first = imported.rows[0]!;
    let balance =
      first.balancePaise! + (first.direction === 'debit' ? first.amountPaise : -first.amountPaise);
    for (const row of imported.rows) {
      balance += row.direction === 'credit' ? row.amountPaise : -row.amountPaise;
      expect(row.balancePaise).toBe(balance);
    }
  });

  it('gives every transaction a unique id', () => {
    expect(new Set(txns.map((txn) => txn.id)).size).toBe(txns.length);
  });
});

describe('narrations in the sample', () => {
  it('exercise every pattern in the registry', () => {
    const used = new Set(txns.map((txn) => txn.parsed.patternId));
    expect([...used].sort()).toEqual(PATTERNS.map((pattern) => pattern.id).sort());
  });

  it('yield a merchant for every row and a reference for every UPI row', () => {
    expect(txns.filter((txn) => txn.merchantKey === 'UNKNOWN')).toEqual([]);
    for (const txn of txns.filter((entry) => entry.parsed.channel === 'UPI')) {
      expect(txn.reference, txn.narration).toMatch(/^\d{12}$/);
    }
  });
});

describe('categories in the sample', () => {
  it('uses every spend category', () => {
    const categories = new Set(categoryBreakdown(txns).map((row) => row.category));
    for (const category of [
      'food',
      'groceries',
      'transport',
      'bills',
      'shopping',
      'rent',
      'subscriptions',
      'health',
      'transfers',
      'cash',
      'other',
    ]) {
      expect(categories, category).toContain(category);
    }
  });

  it.each([
    ['Vikram Placeholder', 'rent'],
    ['Nimbus Stream', 'subscriptions'],
    ['Tunewave Music', 'subscriptions'],
    ['Greenleaf Grocers', 'groceries'],
    ['A One Dairy', 'groceries'],
    ['Freshbasket', 'groceries'],
    ['Chai Corner Cafe', 'food'],
    ['Spice Route Kitchen', 'food'],
    ['Midnight Biryani', 'food'],
    ['Zipcab Rides', 'transport'],
    ['Metro Rail Recharge', 'transport'],
    ['Cityfuel Petrol Pump', 'transport'],
    ['Brightpower Electricity', 'bills'],
    ['Fibernest Broadband', 'bills'],
    ['Skylink Mobile Recharge', 'bills'],
    ['Surecover Insurance', 'bills'],
    ['Lakeside Pharmacy', 'health'],
    ['Wellspring Hospital', 'health'],
    ['Pageturn Books', 'shopping'],
    ['Asha Sample', 'transfers'],
    ['ATM cash withdrawal', 'cash'],
    ['Urban Threads', 'other'],
    ['Kartwheel Online', 'other'],
  ])('files %s under %s', (merchant, category) => {
    const debits = txns.filter((txn) => txn.merchantName === merchant && txn.direction === 'debit');
    expect(debits.length, merchant).toBeGreaterThan(0);
    expect(new Set(debits.map((txn) => txn.category))).toEqual(new Set([category]));
  });

  it('moves a whole merchant with one override', () => {
    const overrides = setMerchantOverride(EMPTY_OVERRIDES, 'URBAN THREADS', 'shopping');
    const after = categoriseAll(raw, DEFAULT_RULES, overrides);
    const urban = after.filter((txn) => txn.merchantKey === 'URBAN THREADS');
    expect(urban.length).toBeGreaterThan(2);
    expect(urban.every((txn) => txn.category === 'shopping')).toBe(true);
    const moved = urban.reduce((sum, txn) => sum + txn.amountPaise, 0);
    const before = new Map(categoryBreakdown(txns).map((row) => [row.category, row.paise]));
    const now = new Map(categoryBreakdown(after).map((row) => [row.category, row.paise]));
    expect(now.get('shopping')! - before.get('shopping')!).toBe(moved);
    expect(before.get('other')! - now.get('other')!).toBe(moved);
  });
});

describe('aggregations on the sample', () => {
  it('covers six full months, April to September 2026', () => {
    const months = monthlySummary(txns);
    expect(months.map((month) => month.month)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(fullMonths(txns)).toHaveLength(6);
  });

  it('has month totals that add up to the statement totals and the balance change', () => {
    const months = monthlySummary(txns);
    const all = totals(txns);
    expect(months.reduce((sum, month) => sum + month.outPaise, 0)).toBe(all.outPaise);
    expect(months.reduce((sum, month) => sum + month.inPaise, 0)).toBe(all.inPaise);
    const first = imported.rows[0]!;
    const opening =
      first.balancePaise! + (first.direction === 'debit' ? first.amountPaise : -first.amountPaise);
    const closing = imported.rows[imported.rows.length - 1]!.balancePaise!;
    expect(closing - opening).toBe(all.netPaise);
    expect(opening).toBe(84_200_00);
  });

  it('has a category breakdown that adds up to all money out', () => {
    const rows = categoryBreakdown(txns);
    expect(rows.reduce((sum, row) => sum + row.paise, 0)).toBe(totals(txns).outPaise);
    expect(rows[0]!.category).toBe('rent');
  });

  it('ranks the landlord as the top merchant', () => {
    expect(topMerchants(txns, 'all', 1)[0]).toMatchObject({
      merchantName: 'Vikram Placeholder',
      paise: 6 * 18500_00,
      count: 6,
    });
  });

  it('has daily totals that add up to all money out', () => {
    const days = [...dailySpend(txns).values()];
    expect(days.reduce((sum, day) => sum + day.paise, 0)).toBe(totals(txns).outPaise);
  });

  it('exports every transaction to CSV and reads the same amounts back', () => {
    const exported = parseCsvText(toCsv(txns));
    expect(exported).toHaveLength(txns.length + 1);
    const debitTotal = exported
      .slice(1)
      .reduce((sum, row) => sum + Math.round(Number(row[4] || 0) * 100), 0);
    expect(debitTotal).toBe(totals(txns).outPaise);
  });
});

describe('signals on the sample', () => {
  it('finds the planted monthly payments and not the quarterly insurance', () => {
    const recurring = detectRecurring(txns);
    const names = recurring.map((signal) => signal.merchantName);
    // Exactly the six planted payments: no weekly shop, no daily tea, no quarterly insurance.
    expect([...names].sort()).toEqual([
      'Brightpower Electricity',
      'Fibernest Broadband',
      'Nimbus Stream',
      'Skylink Mobile Recharge',
      'Tunewave Music',
      'Vikram Placeholder',
    ]);

    const rent = recurring.find((signal) => signal.merchantName === 'Vikram Placeholder')!;
    expect(rent).toMatchObject({ typicalPaise: 18500_00, medianGapDays: 31 });
    expect(rent.payments).toHaveLength(6);
    const recharge = recurring.find((signal) => signal.merchantName === 'Skylink Mobile Recharge')!;
    expect(new Set(recharge.gapsDays)).toEqual(new Set([28]));
  });

  it('finds the planted double charge', () => {
    const duplicates = detectDuplicates(txns);
    const planted = duplicates.find((signal) => signal.merchantName === 'Urban Threads');
    expect(planted).toMatchObject({ kind: 'same-amount', amountPaise: 1849_00, spanDays: 0 });
    expect(planted!.payments.map((txn) => txn.date)).toEqual(['2026-07-14', '2026-07-14']);
  });

  it('finds the planted large restaurant bill', () => {
    const spikes = detectTransactionSpikes(txns);
    const dinner = spikes.find(
      (spike) =>
        spike.txn.merchantName === 'Spice Route Kitchen' && spike.txn.amountPaise === 6400_00,
    );
    expect(dinner).toBeDefined();
    expect(dinner).toMatchObject({ category: 'food', basis: 'merchant' });
    expect(dinner!.ratio).toBeGreaterThan(3);
    // The ordinary weekly shop and the monthly fuel fill-up are not flagged.
    const flagged = new Set(spikes.map((spike) => spike.txn.merchantName));
    expect(flagged).toEqual(
      new Set(['Spice Route Kitchen', 'Wellspring Hospital', 'Surecover Insurance']),
    );
  });

  it('finds August as a heavy month for health', () => {
    const spikes = detectMonthSpikes(txns);
    const health = spikes.find((spike) => spike.category === 'health');
    expect(health).toMatchObject({ month: '2026-08', otherMonths: 5 });
    expect(health!.totalPaise).toBeGreaterThanOrEqual(14500_00);
  });
});
