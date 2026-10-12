import { describe, expect, it } from 'vitest';

import { parseAmount, parseMarker } from './amounts';

const NBSP = String.fromCharCode(160);

function value(paise: number, extra: { negative?: boolean; marker?: 'DR' | 'CR' | null } = {}) {
  return { kind: 'value', paise, negative: extra.negative ?? false, marker: extra.marker ?? null };
}

describe('parseAmount', () => {
  it.each([
    ['500', 50000],
    ['500.5', 50050],
    ['500.50', 50050],
    ['0.05', 5],
    ['.5', 50],
    ['1,234.56', 123456],
    ['1,23,456.78', 12345678],
    ['12,34,56,789.00', 1234567_8900],
    ['123,456.78', 12345678],
    ['0', 0],
    ['0.00', 0],
    ['500.000', 50000],
  ])('reads %s', (input, paise) => {
    expect(parseAmount(input)).toEqual(value(paise));
  });

  it.each([
    ['₹500', 50000],
    ['₹ 1,23,456.78', 12345678],
    ['Rs. 500', 50000],
    ['Rs.500.00', 50000],
    ['Rs500', 50000],
    ['INR 500.00', 50000],
    ['500.00 INR', 50000],
    [`₹${NBSP}1,000`, 100000],
    ['  750.25  ', 75025],
  ])('ignores the currency in %s', (input, paise) => {
    expect(parseAmount(input)).toEqual(value(paise));
  });

  it.each([
    ['500.00 Dr', 'DR'],
    ['500.00Dr', 'DR'],
    ['500.00 DR.', 'DR'],
    ['500.00 (Dr)', 'DR'],
    ['500.00 Cr', 'CR'],
    ['500.00CR', 'CR'],
    ['Cr 500.00', 'CR'],
    ['500.00 Debit', 'DR'],
    ['500.00 credit', 'CR'],
  ])('finds the marker in %s', (input, marker) => {
    expect(parseAmount(input)).toEqual(value(50000, { marker: marker as 'DR' | 'CR' }));
  });

  it.each(['-500.00', '(500.00)', '500.00-', '−500.00', '- 500.00', '-₹500', '₹-500'])(
    'reads %s as negative',
    (input) => {
      expect(parseAmount(input)).toEqual(value(50000, { negative: true }));
    },
  );

  it('reads an explicit plus as positive', () => {
    expect(parseAmount('+500.00')).toEqual(value(50000));
  });

  it.each(['', '   ', '-', '--', 'NA', 'N/A', 'nil', NBSP])('treats %j as empty', (input) => {
    expect(parseAmount(input)).toEqual({ kind: 'empty' });
  });

  it.each([
    'abc',
    '12a',
    '1.2.3',
    '1,,000',
    ',500',
    '500,',
    '1.234,56',
    '12.345',
    '5 0 0 x',
    '99999999999999',
  ])('rejects %s', (input) => {
    expect(parseAmount(input).kind).toBe('invalid');
  });

  it('does not lose paise to floating point', () => {
    // 1.15 * 100 is 114.99999999999999 in floating point.
    expect(parseAmount('1.15')).toEqual(value(115));
    expect(parseAmount('0.29')).toEqual(value(29));
    expect(parseAmount('4,35,999.99')).toEqual(value(43599999));
  });
});

describe('parseMarker', () => {
  it('reads debit and credit markers', () => {
    for (const text of ['DR', 'Dr.', 'D', 'debit', 'Withdrawal', '(Dr)']) {
      expect(parseMarker(text)).toBe('DR');
    }
    for (const text of ['CR', 'Cr.', 'C', 'Credit', 'deposit']) {
      expect(parseMarker(text)).toBe('CR');
    }
  });

  it('returns null for anything else', () => {
    expect(parseMarker('')).toBeNull();
    expect(parseMarker('UPI')).toBeNull();
  });
});
