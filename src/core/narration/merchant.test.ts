import { describe, expect, it } from 'vitest';

import { fingerprint, toTxns } from '../import/normalise';
import type { ImportedRow } from '../import/mapping';
import { merchantIdentity, merchantKeyOf, UNKNOWN_MERCHANT_KEY } from './merchant';
import { parseNarration } from './registry';

describe('merchantKeyOf', () => {
  it('ignores case, punctuation and company suffixes', () => {
    const key = merchantKeyOf('GREENLEAF GROCERS');
    expect(merchantKeyOf('Greenleaf Grocers Pvt. Ltd.')).toBe(key);
    expect(merchantKeyOf('  greenleaf   grocers  ')).toBe(key);
    expect(merchantKeyOf('GREENLEAF-GROCERS PRIVATE LIMITED')).toBe(key);
  });

  it('keeps different names apart', () => {
    expect(merchantKeyOf('GREENLEAF GROCERS')).not.toBe(merchantKeyOf('GREENLEAF GROCERY'));
  });

  it('never returns an empty key', () => {
    expect(merchantKeyOf('')).toBe(UNKNOWN_MERCHANT_KEY);
    expect(merchantKeyOf('--')).toBe(UNKNOWN_MERCHANT_KEY);
    expect(merchantKeyOf('LTD')).toBe('LTD');
  });

  it('spells out an ampersand', () => {
    expect(merchantKeyOf('SALT & PEPPER')).toBe('SALT AND PEPPER');
  });
});

describe('merchantIdentity', () => {
  it('uses the payee name when there is one', () => {
    const parsed = parseNarration(
      'UPI/DR/423456789012/CHAI CORNER CAFE/DEMO/chaicorner@okdemo/Tea',
    );
    expect(merchantIdentity(parsed)).toEqual({ key: 'CHAI CORNER CAFE', name: 'Chai Corner Cafe' });
  });

  it('falls back to the handle', () => {
    const parsed = parseNarration('UPIOUT/478901234567/freshbasket@demoupi/5411');
    expect(merchantIdentity(parsed)).toEqual({ key: 'FRESHBASKET', name: 'Freshbasket' });
    const digits = parseNarration('UPIOUT/478901234569/0000000000@demoupi/0000');
    expect(merchantIdentity(digits).key).toBe('0000000000 DEMOUPI');
  });

  it('files every ATM withdrawal under one name', () => {
    const a = merchantIdentity(parseNarration('ATM WDL DEMO NAGAR BRANCH'));
    const b = merchantIdentity(parseNarration('ATW-XXXXXXXXXXXX0000-DEMO CITY'));
    expect(a).toEqual(b);
    expect(a.name).toBe('ATM cash withdrawal');
  });

  it('calls a narration with nothing to go on Unknown', () => {
    expect(merchantIdentity(parseNarration('0000 / 1111'))).toEqual({
      key: UNKNOWN_MERCHANT_KEY,
      name: 'Unknown',
    });
  });
});

function row(overrides: Partial<ImportedRow>): ImportedRow {
  return {
    rowNumber: 1,
    date: '2026-04-01',
    narration: 'UPI/DR/423456789012/CHAI CORNER CAFE/DEMO/chaicorner@okdemo/Tea',
    amountPaise: 2000,
    direction: 'debit',
    balancePaise: null,
    reference: null,
    ...overrides,
  };
}

describe('toTxns', () => {
  it('attaches the parsed narration and the merchant', () => {
    const [txn] = toTxns([row({})]);
    expect(txn).toMatchObject({
      merchantKey: 'CHAI CORNER CAFE',
      merchantName: 'Chai Corner Cafe',
      reference: '423456789012',
      parsed: { patternId: 'upi-slash-drcr', vpa: 'chaicorner@okdemo' },
    });
  });

  it('uses the reference column when the narration has none', () => {
    const [txn] = toTxns([row({ narration: 'SALARY CREDIT', reference: 'DEMO42' })]);
    expect(txn?.reference).toBe('DEMO42');
  });

  it('sorts by date and keeps file order within a day', () => {
    const txns = toTxns([
      row({ date: '2026-04-03', narration: 'C' }),
      row({ date: '2026-04-01', narration: 'A1' }),
      row({ date: '2026-04-02', narration: 'B' }),
      row({ date: '2026-04-01', narration: 'A2' }),
    ]);
    expect(txns.map((txn) => txn.narration)).toEqual(['A1', 'A2', 'B', 'C']);
  });

  it('gives the same row the same id on every import', () => {
    expect(toTxns([row({})])[0]?.id).toBe(toTxns([row({ rowNumber: 99 })])[0]?.id);
    expect(fingerprint(row({}))).toMatch(/^[0-9a-f]{16}$/);
  });

  it('gives different rows different ids, including exact repeats', () => {
    const txns = toTxns([
      row({}),
      row({}),
      row({ amountPaise: 2100 }),
      row({ date: '2026-04-02' }),
    ]);
    const ids = txns.map((txn) => txn.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids[1]).toBe(`${ids[0]}-2`);
  });
});
