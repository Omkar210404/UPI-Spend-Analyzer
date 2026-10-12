import { describe, expect, it } from 'vitest';

import { build, inCategory, spec } from '../testing/make';
import { SIGNAL_DEFAULTS } from './defaults';
import { detectDuplicates } from './duplicates';
import { detectRecurring, groupBySimilarAmount } from './recurring';
import { detectMonthSpikes, detectTransactionSpikes } from './spikes';

describe('recurring payments', () => {
  it('finds a monthly payment of the same amount', () => {
    const txns = build([
      spec('2026-01-05', 'NIMBUS STREAM', 499),
      spec('2026-02-05', 'NIMBUS STREAM', 499),
      spec('2026-03-05', 'NIMBUS STREAM', 499),
      spec('2026-04-06', 'NIMBUS STREAM', 499),
    ]);
    const [signal, ...rest] = detectRecurring(txns);
    expect(rest).toEqual([]);
    expect(signal).toMatchObject({
      merchantName: 'Nimbus Stream',
      typicalPaise: 49900,
      gapsDays: [31, 28, 32],
      medianGapDays: 31,
    });
    expect(signal!.payments).toHaveLength(4);
  });

  it('accepts amounts that vary a little, such as an electricity bill', () => {
    const txns = build([
      spec('2026-01-10', 'BRIGHTPOWER ELECTRICITY', 1480),
      spec('2026-02-11', 'BRIGHTPOWER ELECTRICITY', 1530),
      spec('2026-03-12', 'BRIGHTPOWER ELECTRICITY', 1610),
    ]);
    const [signal] = detectRecurring(txns);
    expect(signal).toMatchObject({ typicalPaise: 153000, minPaise: 148000, maxPaise: 161000 });
  });

  it('needs at least three payments', () => {
    const txns = build([
      spec('2026-01-05', 'NIMBUS STREAM', 499),
      spec('2026-02-05', 'NIMBUS STREAM', 499),
    ]);
    expect(detectRecurring(txns)).toEqual([]);
  });

  it('does not flag frequent shopping at one place', () => {
    const txns = build([
      spec('2026-01-03', 'GREENLEAF GROCERS', 800),
      spec('2026-01-10', 'GREENLEAF GROCERS', 820),
      spec('2026-01-17', 'GREENLEAF GROCERS', 790),
      spec('2026-01-24', 'GREENLEAF GROCERS', 810),
      spec('2026-01-31', 'GREENLEAF GROCERS', 805),
    ]);
    expect(detectRecurring(txns)).toEqual([]);
  });

  it('does not flag monthly payments of very different amounts', () => {
    const txns = build([
      spec('2026-01-05', 'URBAN THREADS', 500),
      spec('2026-02-05', 'URBAN THREADS', 2500),
      spec('2026-03-05', 'URBAN THREADS', 9000),
    ]);
    expect(detectRecurring(txns)).toEqual([]);
  });

  it('does not flag payments that are quarterly or irregular', () => {
    const quarterly = build([
      spec('2026-01-05', 'SURECOVER INSURANCE', 3000),
      spec('2026-04-05', 'SURECOVER INSURANCE', 3000),
      spec('2026-07-05', 'SURECOVER INSURANCE', 3000),
    ]);
    expect(detectRecurring(quarterly)).toEqual([]);
    const irregular = build([
      spec('2026-01-05', 'PAGETURN BOOKS', 300),
      spec('2026-01-19', 'PAGETURN BOOKS', 300),
      spec('2026-03-30', 'PAGETURN BOOKS', 300),
    ]);
    expect(detectRecurring(irregular)).toEqual([]);
  });

  it('separates a subscription from other purchases at the same merchant', () => {
    const txns = build([
      spec('2026-01-05', 'KARTWHEEL ONLINE', 199),
      spec('2026-01-18', 'KARTWHEEL ONLINE', 2400),
      spec('2026-02-05', 'KARTWHEEL ONLINE', 199),
      spec('2026-02-21', 'KARTWHEEL ONLINE', 860),
      spec('2026-03-05', 'KARTWHEEL ONLINE', 199),
    ]);
    const signals = detectRecurring(txns);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ typicalPaise: 19900 });
    expect(signals[0]!.payments.map((txn) => txn.amountPaise)).toEqual([19900, 19900, 19900]);
  });

  it('counts a double charge once instead of losing the pattern', () => {
    const txns = build([
      spec('2026-01-05', 'NIMBUS STREAM', 499),
      spec('2026-02-05', 'NIMBUS STREAM', 499),
      spec('2026-02-05', 'NIMBUS STREAM', 499),
      spec('2026-03-05', 'NIMBUS STREAM', 499),
    ]);
    const [signal] = detectRecurring(txns);
    expect(signal!.payments.map((txn) => txn.date)).toEqual([
      '2026-01-05',
      '2026-02-05',
      '2026-03-05',
    ]);
  });

  it('keeps the longest monthly run when a month was missed', () => {
    const txns = build([
      spec('2026-01-05', 'NIMBUS STREAM', 499),
      spec('2026-03-05', 'NIMBUS STREAM', 499), // February missed
      spec('2026-04-05', 'NIMBUS STREAM', 499),
      spec('2026-05-05', 'NIMBUS STREAM', 499),
    ]);
    const [signal] = detectRecurring(txns);
    expect(signal!.payments.map((txn) => txn.date)).toEqual([
      '2026-03-05',
      '2026-04-05',
      '2026-05-05',
    ]);
  });

  it('ignores money coming in', () => {
    const txns = build([
      spec('2026-01-28', 'ORBIT PAYROLL', 40000, { credit: true }),
      spec('2026-02-28', 'ORBIT PAYROLL', 40000, { credit: true }),
      spec('2026-03-28', 'ORBIT PAYROLL', 40000, { credit: true }),
    ]);
    expect(detectRecurring(txns)).toEqual([]);
  });

  it('uses the thresholds it is given', () => {
    const txns = build([
      spec('2026-01-05', 'NIMBUS STREAM', 499),
      spec('2026-02-05', 'NIMBUS STREAM', 499),
    ]);
    const loose = { ...SIGNAL_DEFAULTS.recurring, minPayments: 2 };
    expect(detectRecurring(txns, loose)).toHaveLength(1);
  });

  it('groups amounts so every member is within the tolerance of the median', () => {
    const txns = build(
      [100, 104, 108, 150, 155, 400].map((rupees, index) =>
        spec(`2026-01-${String(index + 1).padStart(2, '0')}`, 'NIMBUS STREAM', rupees),
      ),
    );
    const groups = groupBySimilarAmount(txns, 0.1).map((group) =>
      group.map((txn) => txn.amountPaise / 100),
    );
    expect(groups).toEqual([[100, 104, 108], [150, 155], [400]]);
  });
});

describe('possible duplicate charges', () => {
  it('finds the same amount to the same merchant on the same day', () => {
    const txns = build([
      spec('2026-04-12', 'URBAN THREADS', 1299),
      spec('2026-04-12', 'URBAN THREADS', 1299),
      spec('2026-04-20', 'URBAN THREADS', 1299),
    ]);
    const [signal, ...rest] = detectDuplicates(txns);
    expect(rest).toEqual([]);
    expect(signal).toMatchObject({
      kind: 'same-amount',
      merchantName: 'Urban Threads',
      amountPaise: 129900,
      spanDays: 0,
    });
    expect(signal!.payments).toHaveLength(2);
  });

  it('includes the next day but not two days later', () => {
    const nextDay = build([
      spec('2026-04-12', 'URBAN THREADS', 1299),
      spec('2026-04-13', 'URBAN THREADS', 1299),
    ]);
    expect(detectDuplicates(nextDay)[0]).toMatchObject({ spanDays: 1 });
    const twoDays = build([
      spec('2026-04-12', 'URBAN THREADS', 1299),
      spec('2026-04-14', 'URBAN THREADS', 1299),
    ]);
    expect(detectDuplicates(twoDays)).toEqual([]);
  });

  it('needs the same merchant and exactly the same amount', () => {
    const txns = build([
      spec('2026-04-12', 'URBAN THREADS', 1299),
      spec('2026-04-12', 'PAGETURN BOOKS', 1299),
      spec('2026-04-12', 'URBAN THREADS', 1299.5),
    ]);
    expect(detectDuplicates(txns)).toEqual([]);
  });

  it('ignores small payments and money coming in', () => {
    const txns = build([
      spec('2026-04-12', 'CHAI CORNER CAFE', 20),
      spec('2026-04-12', 'CHAI CORNER CAFE', 20),
      spec('2026-04-12', 'ASHA SAMPLE', 500, { credit: true }),
      spec('2026-04-12', 'ASHA SAMPLE', 500, { credit: true }),
    ]);
    expect(detectDuplicates(txns)).toEqual([]);
    const lowerFloor = { ...SIGNAL_DEFAULTS.duplicates, minAmountPaise: 0 };
    expect(detectDuplicates(txns, lowerFloor)).toHaveLength(1);
  });

  it('says so when the rows share one reference', () => {
    const txns = build([
      spec('2026-04-12', 'URBAN THREADS', 1299, { reference: '499999999901' }),
      spec('2026-04-12', 'URBAN THREADS', 1299, { reference: '499999999901' }),
    ]);
    expect(detectDuplicates(txns)[0]).toMatchObject({ kind: 'same-reference' });
  });

  it('groups three in a row into one signal', () => {
    const txns = build([
      spec('2026-04-12', 'URBAN THREADS', 1299),
      spec('2026-04-13', 'URBAN THREADS', 1299),
      spec('2026-04-14', 'URBAN THREADS', 1299),
    ]);
    const signals = detectDuplicates(txns);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ spanDays: 2 });
    expect(signals[0]!.payments).toHaveLength(3);
  });
});

describe('unusually large payments', () => {
  const ordinary = [120, 80, 150, 90, 110, 100].map((rupees, index) =>
    spec(`2026-04-${String(index + 1).padStart(2, '0')}`, 'CHAI CORNER CAFE', rupees),
  );

  it('flags a payment several times the average of the others in its category', () => {
    const txns = build([...ordinary, spec('2026-04-20', 'CHAI CORNER CAFE', 2600)]);
    const [spike, ...rest] = detectTransactionSpikes(txns);
    expect(rest).toEqual([]);
    expect(spike).toMatchObject({
      category: 'food',
      othersCount: 6,
      averageOthersPaise: 10833, // (120+80+150+90+110+100) / 6 = 108.33
    });
    expect(spike!.txn.amountPaise).toBe(260000);
    expect(spike!.ratio).toBeCloseTo(2600 / (650 / 6), 10);
  });

  it('leaves the payment itself out of the average', () => {
    // With itself included the average would be 464.29 and 2600 would be 5.6x, not 24x.
    const txns = build([...ordinary, spec('2026-04-20', 'CHAI CORNER CAFE', 2600)]);
    expect(detectTransactionSpikes(txns)[0]!.ratio).toBeCloseTo(24, 0);
  });

  it('does not flag a payment under three times the average', () => {
    const txns = build([...ordinary, spec('2026-04-20', 'CHAI CORNER CAFE', 320)]);
    expect(detectTransactionSpikes(txns)).toEqual([]);
  });

  it('does not flag small amounts even when the ratio is high', () => {
    const tiny = [10, 12, 9, 11, 10, 8].map((rupees, index) =>
      spec(`2026-04-${String(index + 1).padStart(2, '0')}`, 'CHAI CORNER CAFE', rupees),
    );
    const txns = build([...tiny, spec('2026-04-20', 'CHAI CORNER CAFE', 400)]);
    expect(detectTransactionSpikes(txns)).toEqual([]);
  });

  it('needs enough other payments to compare against', () => {
    const txns = build([...ordinary.slice(0, 4), spec('2026-04-20', 'CHAI CORNER CAFE', 2600)]);
    expect(detectTransactionSpikes(txns)).toEqual([]);
  });

  it('compares within a category, not across the whole statement', () => {
    const txns = build([
      ...ordinary,
      spec('2026-04-01', 'HILLVIEW LANDLORD RENT', 15000), // large, but alone in its category
    ]);
    expect(detectTransactionSpikes(txns)).toEqual([]);
  });
});

describe('unusually heavy months', () => {
  // Full months January to April; shopping is about 2,000 a month except March.
  function shopping(march: number) {
    return inCategory(
      build([
        spec('2026-01-01', 'URBAN THREADS', 1000),
        spec('2026-01-20', 'URBAN THREADS', 1000),
        spec('2026-02-15', 'URBAN THREADS', 2200),
        spec('2026-03-10', 'URBAN THREADS', march),
        spec('2026-04-12', 'URBAN THREADS', 1800),
        spec('2026-04-30', 'CHAI CORNER CAFE', 1),
      ]),
      'shopping',
    );
  }

  it('flags a month well above the average of the other full months', () => {
    const [spike, ...rest] = detectMonthSpikes(shopping(9000));
    expect(rest).toEqual([]);
    expect(spike).toMatchObject({
      category: 'shopping',
      month: '2026-03',
      totalPaise: 900000,
      otherMonths: 3,
      averageOthersPaise: 200033, // (2000 + 2200 + 1801) / 3
    });
    expect(spike!.ratio).toBeCloseTo(900000 / (600100 / 3), 10);
  });

  it('does not flag a month under 1.5 times the average', () => {
    expect(detectMonthSpikes(shopping(2900))).toEqual([]);
  });

  it('does not flag a big ratio on a small increase', () => {
    const txns = inCategory(
      build([
        spec('2026-01-01', 'CHAI CORNER CAFE', 100),
        spec('2026-02-01', 'CHAI CORNER CAFE', 100),
        spec('2026-03-01', 'CHAI CORNER CAFE', 600),
        spec('2026-03-31', 'CHAI CORNER CAFE', 1),
      ]),
      'food',
    );
    expect(detectMonthSpikes(txns)).toEqual([]);
  });

  it('needs at least two other full months', () => {
    const txns = inCategory(
      build([
        spec('2026-01-01', 'URBAN THREADS', 1000),
        spec('2026-02-01', 'URBAN THREADS', 9000),
        spec('2026-02-28', 'URBAN THREADS', 1),
      ]),
      'shopping',
    );
    expect(detectMonthSpikes(txns)).toEqual([]);
  });

  it('leaves partial months out on both sides', () => {
    // The statement ends on 12 May, so May is partial: it is neither judged nor used as a baseline.
    const txns = inCategory(
      build([
        spec('2026-01-01', 'URBAN THREADS', 2000),
        spec('2026-02-01', 'URBAN THREADS', 2000),
        spec('2026-03-01', 'URBAN THREADS', 2000),
        spec('2026-04-01', 'URBAN THREADS', 2000),
        spec('2026-05-12', 'URBAN THREADS', 30000),
      ]),
      'shopping',
    );
    expect(detectMonthSpikes(txns)).toEqual([]);
  });

  it('reports a first-ever spend in a category without a ratio', () => {
    const txns = [
      ...inCategory(
        build([
          spec('2026-01-01', 'CHAI CORNER CAFE', 100),
          spec('2026-02-01', 'CHAI CORNER CAFE', 100),
          spec('2026-03-31', 'CHAI CORNER CAFE', 100),
        ]),
        'food',
      ),
      ...inCategory(build([spec('2026-02-10', 'LAKESIDE CLINIC', 7000)]), 'health'),
    ];
    const spikes = detectMonthSpikes(txns);
    expect(spikes).toHaveLength(1);
    expect(spikes[0]).toMatchObject({
      category: 'health',
      month: '2026-02',
      averageOthersPaise: 0,
      ratio: null,
    });
  });
});
