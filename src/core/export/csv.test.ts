import { describe, expect, it } from 'vitest';

import { categoriseAll } from '../categorise/categoriser';
import { EMPTY_OVERRIDES, setTxnOverride } from '../categorise/overrides';
import { DEFAULT_RULES } from '../categorise/rules';
import { parseCsvText } from '../import/csv';
import type { ImportedRow } from '../import/mapping';
import { toTxns } from '../import/normalise';
import { csvCell, EXPORT_HEADER, toCsv } from './csv';

function rows(): ImportedRow[] {
  return [
    {
      rowNumber: 1,
      date: '2026-04-01',
      narration: 'UPI/DR/423456789012/CHAI CORNER CAFE/DEMO/chaicorner@okdemo/Tea, with "sugar"',
      amountPaise: 12345678,
      direction: 'debit',
      balancePaise: 500000,
      reference: null,
    },
    {
      rowNumber: 2,
      date: '2026-04-02',
      narration: 'NEFT-DEMON26000001-ORBIT TECHNOLOGIES PAYROLL-SALARY APR',
      amountPaise: 4500000,
      direction: 'credit',
      balancePaise: null,
      reference: null,
    },
  ];
}

describe('csvCell', () => {
  it('quotes cells with commas, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('defuses cells a spreadsheet would run as a formula', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('+91')).toBe("'+91");
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell('@handle')).toBe("'@handle");
    expect(csvCell('=1,2')).toBe('"\'=1,2"');
  });
});

describe('toCsv', () => {
  const txns = categoriseAll(toTxns(rows()), DEFAULT_RULES, EMPTY_OVERRIDES);

  it('writes a header and one line per transaction', () => {
    const lines = toCsv(txns).trimEnd().split('\r\n');
    expect(lines[0]).toBe(EXPORT_HEADER.join(','));
    expect(lines).toHaveLength(3);
  });

  it('reads back as the same values', () => {
    const parsed = parseCsvText(toCsv(txns));
    expect(parsed[0]).toEqual([...EXPORT_HEADER]);
    expect(parsed[1]).toEqual([
      '2026-04-01',
      'Chai Corner Cafe',
      'Food and dining',
      'Keyword rule: CAFE',
      '123456.78',
      '',
      '5000.00',
      'UPI',
      'chaicorner@okdemo',
      '423456789012',
      'Tea, with "sugar"',
      'UPI/DR/423456789012/CHAI CORNER CAFE/DEMO/chaicorner@okdemo/Tea, with "sugar"',
    ]);
    expect(parsed[2]?.slice(0, 7)).toEqual([
      '2026-04-02',
      'Orbit Technologies Payroll',
      'Income and credits',
      'Default for money in',
      '',
      '45000.00',
      '',
    ]);
  });

  it('records when a category was the user’s own choice', () => {
    const id = txns[0]!.id;
    const overridden = categoriseAll(
      toTxns(rows()),
      DEFAULT_RULES,
      setTxnOverride(EMPTY_OVERRIDES, id, 'health'),
    );
    const parsed = parseCsvText(toCsv(overridden));
    expect(parsed[1]?.slice(2, 4)).toEqual(['Health', 'Your choice (this transaction)']);
  });

  it('writes only the header for no transactions', () => {
    expect(toCsv([])).toBe(`${EXPORT_HEADER.join(',')}\r\n`);
  });
});
