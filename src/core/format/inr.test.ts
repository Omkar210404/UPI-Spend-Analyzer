import { describe, expect, it } from 'vitest';

import { formatInr, formatInrCompact, groupIndian, paiseToDecimal } from './inr';

describe('groupIndian', () => {
  it.each([
    ['0', '0'],
    ['999', '999'],
    ['1000', '1,000'],
    ['12345', '12,345'],
    ['123456', '1,23,456'],
    ['1234567', '12,34,567'],
    ['12345678', '1,23,45,678'],
    ['1234567890', '1,23,45,67,890'],
  ])('groups %s as %s', (input, expected) => {
    expect(groupIndian(input)).toBe(expected);
  });
});

describe('formatInr', () => {
  it('writes lakh and crore grouping with paise', () => {
    expect(formatInr(0)).toBe('₹0.00');
    expect(formatInr(5)).toBe('₹0.05');
    expect(formatInr(50000)).toBe('₹500.00');
    expect(formatInr(12345678)).toBe('₹1,23,456.78');
    expect(formatInr(1_00_00_000_00)).toBe('₹1,00,00,000.00');
  });

  it('marks negatives with a minus sign before the rupee sign', () => {
    expect(formatInr(-50000)).toBe('−₹500.00');
  });

  it('can hide or round away the paise', () => {
    expect(formatInr(50000, { paise: 'auto' })).toBe('₹500');
    expect(formatInr(50050, { paise: 'auto' })).toBe('₹500.50');
    expect(formatInr(50049, { paise: 'never' })).toBe('₹500');
    expect(formatInr(50050, { paise: 'never' })).toBe('₹501');
    expect(formatInr(99999, { paise: 'never' })).toBe('₹1,000');
  });

  it('can show a plus on gains', () => {
    expect(formatInr(50000, { plus: true })).toBe('+₹500.00');
    expect(formatInr(0, { plus: true })).toBe('₹0.00');
    expect(formatInr(-50000, { plus: true })).toBe('−₹500.00');
  });
});

describe('formatInrCompact', () => {
  it('keeps small amounts in full, to the rupee', () => {
    expect(formatInrCompact(0)).toBe('₹0');
    expect(formatInrCompact(4599950)).toBe('₹46,000');
    expect(formatInrCompact(99_999_00)).toBe('₹99,999');
  });

  it('writes lakh and crore in words', () => {
    expect(formatInrCompact(1_00_000_00)).toBe('₹1 lakh');
    expect(formatInrCompact(1_23_456_00)).toBe('₹1.23 lakh');
    expect(formatInrCompact(12_50_000_00)).toBe('₹12.5 lakh');
    expect(formatInrCompact(1_00_00_000_00)).toBe('₹1 crore');
    expect(formatInrCompact(3_45_00_000_00)).toBe('₹3.45 crore');
    expect(formatInrCompact(-2_50_000_00)).toBe('−₹2.5 lakh');
  });
});

describe('paiseToDecimal', () => {
  it('writes a plain decimal for export', () => {
    expect(paiseToDecimal(12345678)).toBe('123456.78');
    expect(paiseToDecimal(5)).toBe('0.05');
    expect(paiseToDecimal(-50000)).toBe('-500.00');
  });
});
