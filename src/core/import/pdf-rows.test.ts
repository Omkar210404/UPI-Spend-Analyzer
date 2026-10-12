import { describe, expect, it } from 'vitest';

import { applyMapping, validateMapping } from './mapping';
import { pdfItemsToRows, type PdfTextItem } from './pdf-rows';
import { prepareImport } from './prepare';

// Column left edges on a made-up page: date, narration, debit, credit, balance.
const X = { date: 40, narration: 110, debit: 330, credit: 410, balance: 490 };

function item(text: string, x: number, y: number, page = 1): PdfTextItem {
  return { text, x, y, width: text.length * 5, page };
}

function line(y: number, cells: Partial<Record<keyof typeof X, string>>, page = 1): PdfTextItem[] {
  return Object.entries(cells).map(([column, text]) =>
    item(text, X[column as keyof typeof X], y, page),
  );
}

const HEADER = {
  date: 'Date',
  narration: 'Narration',
  debit: 'Debit',
  credit: 'Credit',
  balance: 'Balance',
};

describe('pdfItemsToRows', () => {
  it('rebuilds rows and columns from positioned text', () => {
    const rows = pdfItemsToRows([
      ...line(100, HEADER),
      ...line(120, {
        date: '01/04/2026',
        narration: 'UPI/DR/423456789012/CHAI CORNER CAFE',
        debit: '40.00',
        balance: '960.00',
      }),
      ...line(140, {
        date: '02/04/2026',
        narration: 'NEFT-DEMON26000001-ORBIT PAYROLL',
        credit: '500.00',
        balance: '1,460.00',
      }),
    ]);
    expect(rows).toEqual([
      ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
      ['01/04/2026', 'UPI/DR/423456789012/CHAI CORNER CAFE', '40.00', '', '960.00'],
      ['02/04/2026', 'NEFT-DEMON26000001-ORBIT PAYROLL', '', '500.00', '1,460.00'],
    ]);
  });

  it('copes with items arriving out of order and at slightly different heights', () => {
    const items = [
      ...line(121.5, { balance: '960.00', debit: '40.00' }),
      ...line(100, HEADER),
      ...line(120, { narration: 'TEA', date: '01/04/2026' }),
    ];
    expect(pdfItemsToRows(items)[1]).toEqual(['01/04/2026', 'TEA', '40.00', '', '960.00']);
  });

  it('joins pieces of text that nearly touch into one cell', () => {
    const rows = pdfItemsToRows([
      ...line(100, HEADER),
      item('01/04/2026', X.date, 120),
      item('UPI/DR/', X.narration, 120),
      item('CHAI', X.narration + 36, 120), // 1 unit after the previous piece ends
      item('CORNER', X.narration + 60, 120), // 4 units after: a space
      item('40.00', X.debit, 120),
    ]);
    expect(rows[1]?.[1]).toBe('UPI/DR/CHAI CORNER');
  });

  it('puts right-aligned amounts under the nearest heading', () => {
    const rows = pdfItemsToRows([
      ...line(100, HEADER),
      item('01/04/2026', X.date, 120),
      item('RENT', X.narration, 120),
      item('18,500.00', X.debit - 12, 120), // starts left of its heading
      item('65,660.00', X.balance - 8, 120),
    ]);
    expect(rows[1]).toEqual(['01/04/2026', 'RENT', '18,500.00', '', '65,660.00']);
  });

  it('keeps the lines above the headings and drops repeated headings on later pages', () => {
    const rows = pdfItemsToRows([
      item('Demo Bank sample statement', 40, 40),
      ...line(100, HEADER),
      ...line(120, { date: '01/04/2026', narration: 'TEA', debit: '40.00' }),
      ...line(60, HEADER, 2),
      ...line(80, { date: '02/04/2026', narration: 'BUS', debit: '15.00' }, 2),
    ]);
    expect(rows.map((row) => row[0])).toEqual([
      'Demo Bank sample statement',
      'Date',
      '01/04/2026',
      '02/04/2026',
    ]);
  });

  it('returns plain lines when nothing looks like column headings', () => {
    expect(pdfItemsToRows([item('Hello', 40, 40), item('World', 200, 40)])).toEqual([
      ['Hello', 'World'],
    ]);
    expect(pdfItemsToRows([])).toEqual([]);
  });

  it('feeds the normal import pipeline, joining a wrapped narration', () => {
    const rows = pdfItemsToRows([
      item('Demo Bank sample statement', 40, 40),
      ...line(100, HEADER),
      ...line(120, {
        date: '01/04/2026',
        narration: 'UPI/DR/423456789012/CHAI CORNER',
        debit: '40.00',
        balance: '960.00',
      }),
      ...line(132, { narration: 'CAFE/DEMO/chaicorner@okdemo/Tea' }),
      ...line(150, {
        date: '02/04/2026',
        narration: 'ATM WDL DEMO NAGAR',
        debit: '500.00',
        balance: '460.00',
      }),
    ]);
    const prepared = prepareImport(rows);
    const validation = validateMapping(prepared.suggestion.draft, prepared.table);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const result = applyMapping(prepared.table, validation.mapping, { mergeContinuations: true });
    expect(result.skipped).toEqual([]);
    expect(result.rows.map((row) => [row.date, row.narration, row.amountPaise])).toEqual([
      ['2026-04-01', 'UPI/DR/423456789012/CHAI CORNER CAFE/DEMO/chaicorner@okdemo/Tea', 4000],
      ['2026-04-02', 'ATM WDL DEMO NAGAR', 50000],
    ]);
  });
});
