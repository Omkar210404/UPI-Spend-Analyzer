import { describe, expect, it } from 'vitest';

import { parseCsvText } from './csv';
import {
  applyMapping,
  createProfile,
  findProfile,
  suggestMapping,
  validateMapping,
  type ColumnMapping,
  type MappingDraft,
} from './mapping';
import { detectSensitiveColumns } from './sensitive';
import { buildTable, detectHeaderRow, type RawTable } from './table';

function tableFrom(csv: string): RawTable {
  const rows = parseCsvText(csv);
  return buildTable(rows, detectHeaderRow(rows));
}

function mappingFor(table: RawTable): ColumnMapping {
  const { draft } = suggestMapping(table, detectSensitiveColumns(table));
  const result = validateMapping(draft, table);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.mapping;
}

const DEBIT_CREDIT = `Demo Bank
Account Number,XXXXXXXX0000
Txn Date,Value Date,Narration,Chq./Ref.No.,Account No,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/04/2026,01/04/2026,UPI-TEA STALL-tea@okdemo-DEMO0001234-412345678901-CHAI,412345678901,XXXXXXXX0000,20.00,,"1,23,980.00"
13/04/2026,13/04/2026,NEFT-DEMON26000001-ORBIT PAYROLL,DEMON26000001,XXXXXXXX0000,,"45,000.00","1,68,980.00"
14/04/2026,14/04/2026,ATM WDL DEMO NAGAR,0,XXXXXXXX0000,"2,000.00",0.00,"1,66,980.00"
`;

describe('suggestMapping', () => {
  it('maps a debit and credit layout from its headers', () => {
    const table = tableFrom(DEBIT_CREDIT);
    const { draft, dateDetection } = suggestMapping(table, detectSensitiveColumns(table));
    expect(draft).toMatchObject({
      date: 0,
      narration: 2,
      reference: 3,
      debit: 5,
      credit: 6,
      balance: 7,
      amountMode: 'debit-credit',
      dateFormat: 'dmy',
    });
    expect(dateDetection.ambiguous).toBe(false);
  });

  it('never suggests a column flagged as sensitive', () => {
    const table = tableFrom('Date,Account Details,Amount\n13/01/2026,XXXXXXXX0000,-5\n');
    const sensitive = detectSensitiveColumns(table);
    expect(sensitive.map((entry) => entry.column)).toEqual([1]);
    expect(suggestMapping(table, sensitive).draft.narration).toBeNull();
  });

  it('picks amount with a Dr/Cr column', () => {
    const table = tableFrom(
      'Date,Description,Amount,Dr/Cr,Balance\n13-Jan-2026,TEA,20.00,DR,980.00\n14-Jan-2026,SALARY,500.00,CR,1480.00\n',
    );
    expect(suggestMapping(table).draft).toMatchObject({
      amountMode: 'amount-marker',
      amount: 2,
      marker: 3,
      dateFormat: 'dmony',
    });
  });

  it('picks amount with the marker inside the cell', () => {
    const table = tableFrom(
      'Date,Particulars,Amount\n13/01/2026,TEA,20.00 Dr\n14/01/2026,PAY,500.00 Cr\n',
    );
    expect(suggestMapping(table).draft).toMatchObject({
      amountMode: 'amount-marker',
      marker: null,
    });
  });

  it('picks a signed amount when there is no marker', () => {
    const table = tableFrom('Date,Details,Amount\n2026-01-13,TEA,-20.00\n2026-01-14,PAY,500.00\n');
    expect(suggestMapping(table).draft).toMatchObject({
      amountMode: 'signed',
      amount: 2,
      dateFormat: 'ymd',
    });
  });

  it('falls back to cell contents when the headers say nothing', () => {
    const table = buildTable(
      [
        ['A', 'B', 'C'],
        ['13/01/2026', 'UPI TEA STALL PAYMENT', '-20.00'],
        ['14/01/2026', 'SALARY FROM ORBIT PAYROLL', '500.00'],
      ],
      0,
    );
    const { draft } = suggestMapping(table);
    expect(draft.date).toBe(0);
    expect(draft.narration).toBe(1);
  });
});

describe('validateMapping', () => {
  const table = tableFrom('Date,Narration,Debit,Credit\n13/01/2026,TEA,20.00,\n');
  const base: MappingDraft = {
    date: 0,
    narration: 1,
    dateFormat: 'dmy',
    amountMode: 'debit-credit',
    debit: 2,
    credit: 3,
    amount: null,
    marker: null,
    positiveIs: 'credit',
    balance: null,
    reference: null,
  };

  it('accepts a complete mapping', () => {
    expect(validateMapping(base, table).ok).toBe(true);
  });

  it('asks for the required columns', () => {
    const result = validateMapping({ ...base, date: null, credit: null }, table);
    expect(result).toEqual({
      ok: false,
      errors: ['Choose the date column.', 'Choose the credit (money in) column.'],
    });
    const single = validateMapping({ ...base, amountMode: 'signed', amount: null }, table);
    expect(single).toEqual({ ok: false, errors: ['Choose the amount column.'] });
  });

  it('refuses one column for two fields, and columns that do not exist', () => {
    const twice = validateMapping({ ...base, credit: 2 }, table);
    expect(twice.ok).toBe(false);
    expect(!twice.ok && twice.errors[0]).toMatch(/chosen for both/);
    expect(validateMapping({ ...base, balance: 9 }, table).ok).toBe(false);
  });
});

describe('applyMapping', () => {
  it('reads a debit and credit layout into rows', () => {
    const table = tableFrom(DEBIT_CREDIT);
    const { rows, skipped } = applyMapping(table, mappingFor(table));
    expect(skipped).toEqual([]);
    expect(rows).toEqual([
      {
        rowNumber: 1,
        date: '2026-04-01',
        narration: 'UPI-TEA STALL-tea@okdemo-DEMO0001234-412345678901-CHAI',
        amountPaise: 2000,
        direction: 'debit',
        balancePaise: 12398000,
        reference: '412345678901',
      },
      {
        rowNumber: 2,
        date: '2026-04-13',
        narration: 'NEFT-DEMON26000001-ORBIT PAYROLL',
        amountPaise: 4500000,
        direction: 'credit',
        balancePaise: 16898000,
        reference: 'DEMON26000001',
      },
      {
        rowNumber: 3,
        date: '2026-04-14',
        narration: 'ATM WDL DEMO NAGAR',
        amountPaise: 200000,
        direction: 'debit',
        balancePaise: 16698000,
        reference: null,
      },
    ]);
  });

  it('leaves unmapped columns behind, including the account number', () => {
    const table = tableFrom(DEBIT_CREDIT);
    const result = applyMapping(table, mappingFor(table));
    expect(JSON.stringify(result)).not.toContain('XXXXXXXX0000');
  });

  it('reads a single amount with a Dr/Cr column', () => {
    const table = tableFrom(
      'Date,Description,Amount,Dr/Cr\n13-Jan-2026,TEA,20.00,DR\n14-Jan-2026,SALARY,"1,500.00",Cr\n',
    );
    const { rows } = applyMapping(table, mappingFor(table));
    expect(rows.map((row) => [row.amountPaise, row.direction])).toEqual([
      [2000, 'debit'],
      [150000, 'credit'],
    ]);
  });

  it('reads a marker inside the amount cell', () => {
    const table = tableFrom(
      'Date,Particulars,Amount\n13/01/2026,TEA,20.00 Dr\n14/01/2026,PAY,500.00Cr\n',
    );
    const { rows } = applyMapping(table, mappingFor(table));
    expect(rows.map((row) => row.direction)).toEqual(['debit', 'credit']);
  });

  it('reads a signed amount, with negative as money out by default', () => {
    const table = tableFrom('Date,Details,Amount\n2026-01-13,TEA,-20.00\n2026-01-14,PAY,500.00\n');
    const mapping = mappingFor(table);
    expect(applyMapping(table, mapping).rows.map((row) => row.direction)).toEqual([
      'debit',
      'credit',
    ]);
    const flipped = applyMapping(table, { ...mapping, positiveIs: 'debit' });
    expect(flipped.rows.map((row) => row.direction)).toEqual(['credit', 'debit']);
  });

  it('reports every row it cannot read, with the reason', () => {
    const table = tableFrom(
      [
        'Date,Narration,Debit,Credit',
        '13/01/2026,TEA,20.00,',
        'Opening Balance,,,',
        '31/02/2026,BAD DATE,5.00,',
        '14/01/2026,NO AMOUNT,,',
        '15/01/2026,BAD AMOUNT,12x,',
        '16/01/2026,BOTH,5.00,6.00',
        ',NO DATE,7.00,',
        '17/01/2026,BUS,15.00,',
      ].join('\n'),
    );
    const { rows, skipped } = applyMapping(table, mappingFor(table));
    expect(rows.map((row) => row.narration)).toEqual(['TEA', 'BUS']);
    expect(skipped.map((row) => [row.rowNumber, row.reason])).toEqual([
      [2, 'bad-date'],
      [3, 'bad-date'],
      [4, 'no-amount'],
      [5, 'bad-amount'],
      [6, 'both-debit-and-credit'],
      [7, 'no-date'],
    ]);
    expect(rows.length + skipped.length).toBe(table.rows.length);
  });

  it('reports a missing Dr/Cr marker', () => {
    const table = tableFrom('Date,Description,Amount,Dr/Cr\n13/01/2026,TEA,20.00,\n');
    expect(applyMapping(table, mappingFor(table)).skipped[0]?.reason).toBe('no-marker');
  });

  it('shows only mapped cells in a skipped row preview', () => {
    const table = tableFrom(
      'Date,Narration,Account No,Debit,Credit\n31/02/2026,BAD DATE,XXXXXXXX0000,5.00,\n01/03/2026,OK,XXXXXXXX0000,5.00,\n',
    );
    const { skipped } = applyMapping(table, mappingFor(table));
    expect(skipped[0]?.preview).toBe('31/02/2026 | BAD DATE | 5.00');
  });

  it('reads a debit balance as overdrawn', () => {
    const table = tableFrom(
      'Date,Narration,Debit,Credit,Balance\n13/01/2026,FEE,20.00,,150.00 Dr\n',
    );
    expect(applyMapping(table, mappingFor(table)).rows[0]?.balancePaise).toBe(-15000);
  });

  it('joins wrapped narration lines when asked to', () => {
    const table = tableFrom(
      'Date,Narration,Debit,Credit\n13/01/2026,UPI-TEA STALL-,20.00,\n,tea@okdemo-CHAI,,\n14/01/2026,BUS,15.00,\n',
    );
    const mapping = mappingFor(table);
    const merged = applyMapping(table, mapping, { mergeContinuations: true });
    expect(merged.rows.map((row) => row.narration)).toEqual([
      'UPI-TEA STALL- tea@okdemo-CHAI',
      'BUS',
    ]);
    expect(merged.skipped).toEqual([]);
    expect(applyMapping(table, mapping).skipped.map((row) => row.reason)).toEqual(['no-date']);
  });
});

describe('mapping profiles', () => {
  it('finds a saved profile for the same header layout only', () => {
    const table = tableFrom(DEBIT_CREDIT);
    const profile = createProfile('p1', ' Demo Bank ', table, mappingFor(table));
    expect(profile.name).toBe('Demo Bank');

    const sameLayout = tableFrom(DEBIT_CREDIT.replace('20.00', '25.00'));
    expect(findProfile([profile], sameLayout)).toBe(profile);

    const otherLayout = tableFrom('Date,Details,Amount\n2026-01-13,TEA,-20.00\n');
    expect(findProfile([profile], otherLayout)).toBeNull();
  });

  it('holds no row data', () => {
    const table = tableFrom(DEBIT_CREDIT);
    const text = JSON.stringify(createProfile('p1', 'Demo', table, mappingFor(table)));
    expect(text).not.toContain('TEA STALL');
    expect(text).not.toContain('XXXXXXXX0000');
  });
});
