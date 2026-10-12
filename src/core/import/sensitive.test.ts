import { describe, expect, it } from 'vitest';

import { detectSensitiveColumns } from './sensitive';
import type { RawTable } from './table';

// Every identifier below is a well-known dummy value, not a real one.
const DUMMY_PAN = 'ABCDE1234F';
const DUMMY_CARD = '4111 1111 1111 1111';
const DUMMY_AADHAAR = '1234 5678 9012';
const MASKED_ACCOUNT = 'XXXXXXXX0000';

function table(header: string[], rows: string[][]): RawTable {
  return { header, rows, headerRowIndex: 0 };
}

function kinds(t: RawTable): Record<number, string> {
  return Object.fromEntries(detectSensitiveColumns(t).map((entry) => [entry.column, entry.kind]));
}

describe('detectSensitiveColumns by header', () => {
  it.each([
    ['Account No', 'account-number'],
    ['A/C Number', 'account-number'],
    ['Account', 'account-number'],
    ['Card Number', 'card-number'],
    ['PAN', 'pan'],
    ['Aadhaar No', 'aadhaar'],
    ['Customer ID', 'customer-id'],
    ['CIF', 'customer-id'],
    ['Mobile', 'contact'],
    ['Email', 'contact'],
    ['Account Holder', 'holder-name'],
    ['Customer Name', 'holder-name'],
  ])('flags a column headed %s', (header, kind) => {
    expect(kinds(table(['Date', header], [['01/01/2026', 'x']]))).toEqual({ 1: kind });
  });

  it('does not flag ordinary statement columns', () => {
    const t = table(
      ['Txn Date', 'Narration', 'Chq./Ref.No.', 'Debit', 'Credit', 'Account Balance'],
      [
        ['01/01/2026', 'UPI-TEA STALL-tea@okdemo', '412345678901', '20.00', '', '980.00'],
        ['02/01/2026', 'UPI-BUS PASS-bus@okdemo', '412345678902', '15.00', '', '965.00'],
      ],
    );
    expect(detectSensitiveColumns(t)).toEqual([]);
  });
});

describe('detectSensitiveColumns by content', () => {
  it('flags PAN-shaped values under a vague header', () => {
    const t = table(
      ['Date', 'Info'],
      [
        ['01/01/2026', DUMMY_PAN],
        ['02/01/2026', DUMMY_PAN],
      ],
    );
    expect(kinds(t)).toEqual({ 1: 'pan' });
  });

  it('flags card numbers that pass the card check', () => {
    const t = table(
      ['Date', 'Info'],
      [
        ['01/01/2026', DUMMY_CARD],
        ['02/01/2026', '4111111111111111'],
      ],
    );
    expect(kinds(t)).toEqual({ 1: 'card-number' });
  });

  it('flags Aadhaar-style grouping', () => {
    const t = table(
      ['Date', 'Info'],
      [
        ['01/01/2026', DUMMY_AADHAAR],
        ['02/01/2026', '1234-5678-9012'],
      ],
    );
    expect(kinds(t)).toEqual({ 1: 'aadhaar' });
  });

  it('flags the same long number on every row', () => {
    const t = table(
      ['Date', 'Info', 'Narration'],
      [
        ['01/01/2026', MASKED_ACCOUNT, 'TEA'],
        ['02/01/2026', MASKED_ACCOUNT, 'BUS'],
        ['03/01/2026', MASKED_ACCOUNT, 'TEA'],
      ],
    );
    expect(kinds(t)).toEqual({ 1: 'account-number' });
  });

  it('leaves twelve-digit UPI references alone', () => {
    const t = table(
      ['Date', 'Ref'],
      [
        ['01/01/2026', '412345678901'],
        ['02/01/2026', '412345678902'],
        ['03/01/2026', '412345678903'],
      ],
    );
    expect(detectSensitiveColumns(t)).toEqual([]);
  });

  it('does not judge a column from a single row', () => {
    expect(detectSensitiveColumns(table(['Date', 'Info'], [['01/01/2026', DUMMY_PAN]]))).toEqual(
      [],
    );
  });
});
