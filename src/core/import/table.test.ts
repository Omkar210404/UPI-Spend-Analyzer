import { describe, expect, it } from 'vitest';

import { parseCsvText } from './csv';
import { buildTable, detectHeaderRow, headerKind, headerSignature } from './table';

describe('parseCsvText', () => {
  it('splits rows and trims cells', () => {
    expect(parseCsvText('a, b ,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps commas and line breaks that are inside quotes', () => {
    const rows = parseCsvText('Date,Narration,Amount\n01/01/2026,"UPI, tea\nstall","1,234.50"\n');
    expect(rows[1]).toEqual(['01/01/2026', 'UPI, tea stall', '1,234.50']);
  });

  it('drops blank lines and a byte-order mark', () => {
    const bom = String.fromCharCode(0xfeff);
    const rows = parseCsvText(`${bom}Date,Amount\n\n , \n01/01/2026,5\n`);
    expect(rows).toEqual([
      ['Date', 'Amount'],
      ['01/01/2026', '5'],
    ]);
  });

  it('works out tab, semicolon and pipe delimiters', () => {
    expect(parseCsvText('Date\tAmount\n01/01/2026\t5\n')[1]).toEqual(['01/01/2026', '5']);
    expect(parseCsvText('Date;Amount\n01/01/2026;5\n')[1]).toEqual(['01/01/2026', '5']);
    expect(parseCsvText('Date|Amount\n01/01/2026|5\n')[1]).toEqual(['01/01/2026', '5']);
  });
});

describe('headerKind', () => {
  it.each([
    ['Date', 'date'],
    ['Txn Date', 'date'],
    ['Value Dt', 'date'],
    ['Transaction Date', 'date'],
    ['Narration', 'narration'],
    ['Description', 'narration'],
    ['Particulars', 'narration'],
    ['Transaction Remarks', 'narration'],
    ['Debit', 'debit'],
    ['Withdrawal Amt.', 'debit'],
    ['Debit Amount', 'debit'],
    ['Credit', 'credit'],
    ['Deposit Amt.', 'credit'],
    ['Amount (INR)', 'amount'],
    ['Dr/Cr', 'marker'],
    ['Debit/Credit', 'marker'],
    ['Transaction Type', 'marker'],
    ['Balance', 'balance'],
    ['Closing Balance', 'balance'],
    ['Chq./Ref.No.', 'reference'],
    ['Transaction ID', 'reference'],
  ])('reads %s as %s', (header, kind) => {
    expect(headerKind(header)).toBe(kind);
  });

  it('returns null for headers it does not know', () => {
    expect(headerKind('')).toBeNull();
    expect(headerKind('Branch')).toBeNull();
    expect(headerKind('S No')).toBeNull();
  });
});

describe('detectHeaderRow', () => {
  it('skips the block about the account above the table', () => {
    const rows = [
      ['Demo Bank Statement of Account'],
      ['Name', 'SAMPLE HOLDER'],
      ['Account Number', 'XXXXXXXX0000'],
      ['Statement period', '01/01/2026 to 31/01/2026'],
      ['Txn Date', 'Narration', 'Debit', 'Credit', 'Balance'],
      ['01/01/2026', 'UPI-TEA STALL', '20.00', '', '980.00'],
    ];
    expect(detectHeaderRow(rows)).toBe(4);
  });

  it('uses the first row when the file is only a table', () => {
    const rows = [
      ['Date', 'Description', 'Amount', 'Dr/Cr'],
      ['01/01/2026', 'UPI-TEA STALL', '20.00', 'DR'],
    ];
    expect(detectHeaderRow(rows)).toBe(0);
  });

  it('falls back to the first row when nothing looks like a header', () => {
    expect(detectHeaderRow([['01/01/2026', 'TEA', '20.00']])).toBe(0);
    expect(detectHeaderRow([])).toBe(0);
  });
});

describe('buildTable', () => {
  it('keeps only the header and the rows under it', () => {
    const rows = [
      ['Account Number', 'XXXXXXXX0000'],
      ['Date', 'Narration', 'Amount'],
      ['01/01/2026', 'TEA', '20.00'],
      ['02/01/2026', 'BUS', '15.00'],
    ];
    const table = buildTable(rows, 1);
    expect(table.header).toEqual(['Date', 'Narration', 'Amount']);
    expect(table.rows).toHaveLength(2);
    expect(JSON.stringify(table)).not.toContain('XXXXXXXX0000');
  });

  it('pads short rows, names blank headers and drops empty trailing columns', () => {
    const rows = [
      ['Date', '', 'Amount', '', ''],
      ['01/01/2026', 'TEA', '20.00', '', ''],
      ['02/01/2026'],
    ];
    const table = buildTable(rows, 0);
    expect(table.header).toEqual(['Date', 'Column 2', 'Amount']);
    expect(table.rows[1]).toEqual(['02/01/2026', '', '']);
  });
});

describe('headerSignature', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(headerSignature(['Txn Date', 'Withdrawal Amt.'])).toBe(
      headerSignature(['  txn  date ', 'WITHDRAWAL AMT']),
    );
    expect(headerSignature(['Date', 'Debit'])).not.toBe(headerSignature(['Date', 'Credit']));
  });
});
