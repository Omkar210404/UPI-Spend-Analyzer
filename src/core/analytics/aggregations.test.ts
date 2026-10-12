import { describe, expect, it } from 'vitest';

import { build, spec } from '../testing/make';
import { categoryBreakdown, largestTransactions, topMerchants } from './breakdown';
import { calendarWeeks, dailySpend, heatLevel, heatThresholds } from './calendar';
import { monthOverMonth } from './compare';
import { fullMonths, isPartialMonth, monthlySummary, statementRange, totals } from './monthly';
import { groupBy, mean, median, quantileSorted, sum } from './stats';

// A small statement: 12 March to 30 May 2026.
const txns = build([
  spec('2026-03-12', 'CHAI CORNER CAFE', 100),
  spec('2026-03-20', 'GREENLEAF GROCERS', 900),
  spec('2026-03-28', 'ORBIT PAYROLL', 40000, { credit: true }),
  spec('2026-04-01', 'HILLVIEW LANDLORD RENT', 15000),
  spec('2026-04-03', 'CHAI CORNER CAFE', 120),
  spec('2026-04-03', 'CHAI CORNER CAFE', 80),
  spec('2026-04-10', 'GREENLEAF GROCERS', 1200),
  spec('2026-04-18', 'URBAN THREADS', 2500),
  spec('2026-04-28', 'ORBIT PAYROLL', 40000, { credit: true }),
  spec('2026-05-01', 'HILLVIEW LANDLORD RENT', 15000),
  spec('2026-05-09', 'GREENLEAF GROCERS', 1500),
  spec('2026-05-30', 'ZIPCAB RIDES', 300),
]);

describe('stats', () => {
  it('sum, mean, median', () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(sum([])).toBe(0);
    expect(mean([1, 2, 6])).toBe(3);
    expect(mean([])).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it('nearest-rank quantiles', () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(quantileSorted(sorted, 0.2)).toBe(10);
    expect(quantileSorted(sorted, 0.4)).toBe(20);
    expect(quantileSorted(sorted, 0.5)).toBe(30);
    expect(quantileSorted(sorted, 1)).toBe(50);
    expect(quantileSorted([], 0.5)).toBe(0);
  });

  it('groups in first-seen order', () => {
    const groups = groupBy(['b1', 'a1', 'b2'], (item) => item[0]!);
    expect([...groups.keys()]).toEqual(['b', 'a']);
    expect(groups.get('b')).toEqual(['b1', 'b2']);
  });
});

describe('monthly summary', () => {
  it('finds the statement range', () => {
    expect(statementRange(txns)).toEqual({ first: '2026-03-12', last: '2026-05-30' });
    expect(statementRange([])).toBeNull();
  });

  it('adds up money in and money out per calendar month', () => {
    const months = monthlySummary(txns);
    expect(months.map((month) => month.month)).toEqual(['2026-03', '2026-04', '2026-05']);
    expect(months[0]).toMatchObject({ inPaise: 4000000, outPaise: 100000, netPaise: 3900000 });
    expect(months[1]).toMatchObject({
      inPaise: 4000000,
      outPaise: 1890000,
      netPaise: 2110000,
      count: 6,
      debitCount: 5,
      creditCount: 1,
    });
    expect(months[2]).toMatchObject({ inPaise: 0, outPaise: 1680000, netPaise: -1680000 });
  });

  it('month totals add up to the statement total', () => {
    const months = monthlySummary(txns);
    const all = totals(txns);
    expect(sum(months.map((month) => month.outPaise))).toBe(all.outPaise);
    expect(sum(months.map((month) => month.inPaise))).toBe(all.inPaise);
    expect(sum(months.map((month) => month.count))).toBe(txns.length);
    expect(all.netPaise).toBe(all.inPaise - all.outPaise);
  });

  it('marks a month the statement only partly covers', () => {
    const months = monthlySummary(txns);
    expect(months.map((month) => month.partial)).toEqual([true, false, false]);
    expect(fullMonths(txns)).toEqual(['2026-04', '2026-05']);
  });

  it('judges partial months by the statement edges only', () => {
    const range = { first: '2026-03-04', last: '2026-05-20' };
    expect(isPartialMonth('2026-03', range)).toBe(false); // starts on day 4, within tolerance
    expect(isPartialMonth('2026-04', range)).toBe(false);
    expect(isPartialMonth('2026-05', range)).toBe(true); // ends 11 days before month end
    expect(isPartialMonth('2026-03', { first: '2026-03-07', last: '2026-05-31' })).toBe(true);
    expect(isPartialMonth('2026-05', { first: '2026-03-01', last: '2026-05-26' })).toBe(false);
  });

  it('lists a month with no transactions as zeros', () => {
    const gap = build([
      spec('2026-01-10', 'CHAI CORNER CAFE', 50),
      spec('2026-03-10', 'CHAI CORNER CAFE', 50),
    ]);
    const months = monthlySummary(gap);
    expect(months.map((month) => month.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(months[1]).toMatchObject({ outPaise: 0, inPaise: 0, count: 0 });
  });

  it('returns nothing for no transactions', () => {
    expect(monthlySummary([])).toEqual([]);
    expect(totals([])).toMatchObject({ inPaise: 0, outPaise: 0, count: 0 });
  });
});

describe('category breakdown', () => {
  it('sums money out per category, largest first, with shares that add to one', () => {
    const rows = categoryBreakdown(txns, '2026-04');
    expect(rows.map((row) => [row.category, row.paise, row.count])).toEqual([
      ['rent', 1500000, 1],
      ['other', 250000, 1],
      ['groceries', 120000, 1],
      ['food', 20000, 2],
    ]);
    expect(sum(rows.map((row) => row.share))).toBeCloseTo(1, 10);
    expect(rows[0]!.share).toBeCloseTo(1500000 / 1890000, 10);
  });

  it('ignores money coming in', () => {
    const all = categoryBreakdown(txns);
    expect(all.find((row) => row.category === 'income')).toBeUndefined();
    expect(sum(all.map((row) => row.paise))).toBe(totals(txns).outPaise);
  });

  it('is empty for a period with no spend', () => {
    expect(categoryBreakdown(txns, '2027-01')).toEqual([]);
  });
});

describe('top merchants and largest transactions', () => {
  it('ranks merchants by money out', () => {
    const merchants = topMerchants(txns, 'all', 3);
    expect(merchants.map((m) => [m.merchantName, m.paise, m.count, m.category])).toEqual([
      ['Hillview Landlord Rent', 3000000, 2, 'rent'],
      ['Greenleaf Grocers', 360000, 3, 'groceries'],
      ['Urban Threads', 250000, 1, 'other'],
    ]);
  });

  it('respects the period and the limit', () => {
    expect(topMerchants(txns, '2026-03').map((m) => m.merchantName)).toEqual([
      'Greenleaf Grocers',
      'Chai Corner Cafe',
    ]);
    expect(topMerchants(txns, 'all', 1)).toHaveLength(1);
  });

  it('lists the largest payments, and the largest credits when asked', () => {
    expect(largestTransactions(txns, 'all', 3).map((txn) => txn.amountPaise)).toEqual([
      1500000, 1500000, 250000,
    ]);
    expect(largestTransactions(txns, 'all', 3)[0]!.date).toBe('2026-04-01');
    expect(largestTransactions(txns, 'all', 5, 'credit').map((txn) => txn.merchantName)).toEqual([
      'Orbit Payroll',
      'Orbit Payroll',
    ]);
  });
});

describe('calendar heatmap', () => {
  it('sums money out per day', () => {
    const days = dailySpend(txns);
    expect(days.get('2026-04-03')).toEqual({ paise: 20000, count: 2 });
    expect(days.has('2026-03-28')).toBe(false); // a credit only
    expect(days.size).toBe(9);
  });

  it('takes its colour steps from quantiles of days with spend', () => {
    const thresholds = heatThresholds([100, 200, 300, 400, 500, 600, 700, 800, 900, 100000]);
    expect(thresholds).toEqual([200, 400, 600, 800]);
    // One huge day does not push the ordinary days into the lowest step.
    expect(heatLevel(300, thresholds)).toBe(2);
    expect(heatLevel(900, thresholds)).toBe(5);
    expect(heatLevel(100000, thresholds)).toBe(5);
    expect(heatLevel(100, thresholds)).toBe(1);
    expect(heatLevel(200, thresholds)).toBe(1);
    expect(heatLevel(0, thresholds)).toBe(0);
  });

  it('merges repeated steps and ignores days with no spend', () => {
    expect(heatThresholds([0, 0, 500, 500, 500, 500])).toEqual([]);
    expect(heatLevel(500, [])).toBe(1);
    expect(heatThresholds([])).toEqual([]);
    expect(heatThresholds([100, 100, 100, 100, 900])).toEqual([100]);
  });

  it('lays a month out in weeks starting on Monday', () => {
    const weeks = calendarWeeks('2026-04'); // 1 April 2026 is a Wednesday
    expect(weeks[0]).toEqual([
      null,
      null,
      '2026-04-01',
      '2026-04-02',
      '2026-04-03',
      '2026-04-04',
      '2026-04-05',
    ]);
    expect(weeks).toHaveLength(5);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(calendarWeeks('2026-02').flat().filter(Boolean)).toHaveLength(28);
  });
});

describe('month over month', () => {
  it('compares each category with the previous calendar month', () => {
    const result = monthOverMonth(txns, '2026-05');
    expect(result.previous).toBe('2026-04');
    expect(result.hasPrevious).toBe(true);
    const byCategory = Object.fromEntries(result.rows.map((row) => [row.category, row]));
    expect(byCategory.rent).toMatchObject({
      currentPaise: 1500000,
      previousPaise: 1500000,
      deltaPaise: 0,
      change: 0,
    });
    expect(byCategory.groceries).toMatchObject({ deltaPaise: 30000, change: 0.25 });
    expect(byCategory.food).toMatchObject({ currentPaise: 0, previousPaise: 20000, change: -1 });
    expect(byCategory.transport).toMatchObject({
      currentPaise: 30000,
      previousPaise: 0,
      change: null,
    });
    expect(result.total).toMatchObject({
      currentPaise: 1680000,
      previousPaise: 1890000,
      deltaPaise: -210000,
    });
    expect(result.total.change).toBeCloseTo(-210000 / 1890000, 10);
  });

  it('flags partial months and a missing previous month', () => {
    const april = monthOverMonth(txns, '2026-04');
    expect(april.previousPartial).toBe(true);
    expect(april.currentPartial).toBe(false);
    const march = monthOverMonth(txns, '2026-03');
    expect(march.hasPrevious).toBe(false);
    expect(march.total.change).toBeNull();
  });
});
