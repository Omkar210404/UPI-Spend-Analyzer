import { describe, expect, it } from 'vitest';

import {
  dayNumber,
  daysBetween,
  daysInIsoMonth,
  detectDateFormat,
  formatDate,
  formatMonth,
  monthOf,
  monthRange,
  parseDate,
  previousMonth,
  weekdayMondayFirst,
} from './dates';

describe('parseDate', () => {
  it.each([
    ['31/01/2026', '2026-01-31'],
    ['31-01-2026', '2026-01-31'],
    ['31.01.2026', '2026-01-31'],
    ['1/2/2026', '2026-02-01'],
    ['01/02/26', '2026-02-01'],
    ['15/08/99', '1999-08-15'],
  ])('reads day-first %s', (input, expected) => {
    expect(parseDate(input, 'dmy')).toBe(expected);
  });

  it.each([
    ['31-Jan-2026', '2026-01-31'],
    ['31 Jan 2026', '2026-01-31'],
    ['31-Jan-26', '2026-01-31'],
    ['1 January 2026', '2026-01-01'],
    ['01Jan2026', '2026-01-01'],
    ['05 Sept 2025', '2025-09-05'],
    ['07-MAR-2026', '2026-03-07'],
    ['31 Jan, 2026', '2026-01-31'],
  ])('reads a month name in %s', (input, expected) => {
    expect(parseDate(input, 'dmony')).toBe(expected);
  });

  it('reads year-first, month-first and month-name-first dates', () => {
    expect(parseDate('2026-01-31', 'ymd')).toBe('2026-01-31');
    expect(parseDate('2026/1/5', 'ymd')).toBe('2026-01-05');
    expect(parseDate('01/31/2026', 'mdy')).toBe('2026-01-31');
    expect(parseDate('Jan 31, 2026', 'mondy')).toBe('2026-01-31');
    expect(parseDate('March 3rd, 2026', 'mondy')).toBe('2026-03-03');
  });

  it('ignores a time after the date', () => {
    expect(parseDate('31/01/2026 10:30:15', 'dmy')).toBe('2026-01-31');
    expect(parseDate('31/01/2026 10:30 PM', 'dmy')).toBe('2026-01-31');
    expect(parseDate('2026-01-31T10:30:00Z', 'ymd')).toBe('2026-01-31');
    expect(parseDate('31-Jan-2026 09:05', 'dmony')).toBe('2026-01-31');
  });

  it('rejects dates that are not on the calendar', () => {
    expect(parseDate('31/02/2026', 'dmy')).toBeNull();
    expect(parseDate('29/02/2025', 'dmy')).toBeNull();
    expect(parseDate('00/01/2026', 'dmy')).toBeNull();
    expect(parseDate('13/13/2026', 'dmy')).toBeNull();
    expect(parseDate('31/04/2026', 'dmy')).toBeNull();
  });

  it('accepts 29 February only in a leap year', () => {
    expect(parseDate('29/02/2024', 'dmy')).toBe('2024-02-29');
    expect(parseDate('29/02/2000', 'dmy')).toBe('2000-02-29');
    expect(parseDate('29/02/2100', 'dmy')).toBeNull();
  });

  it('rejects text that is not a date in the given format', () => {
    expect(parseDate('', 'dmy')).toBeNull();
    expect(parseDate('Opening Balance', 'dmy')).toBeNull();
    expect(parseDate('2026-01-31', 'dmy')).toBeNull();
    expect(parseDate('31/01/2026', 'ymd')).toBeNull();
    expect(parseDate('31 Jam 2026', 'dmony')).toBeNull();
    expect(parseDate('31 Marble 2026', 'dmony')).toBeNull();
    expect(parseDate('31/01/202', 'dmy')).toBeNull();
  });

  it('reads the day and month the other way round in month-first format', () => {
    expect(parseDate('03/04/2026', 'dmy')).toBe('2026-04-03');
    expect(parseDate('03/04/2026', 'mdy')).toBe('2026-03-04');
  });
});

describe('detectDateFormat', () => {
  it('knows day-first when a day is above 12', () => {
    const result = detectDateFormat(['01/04/2026', '13/04/2026', '28/04/2026']);
    expect(result.format).toBe('dmy');
    expect(result.ambiguous).toBe(false);
  });

  it('knows month-first when the second part is above 12', () => {
    const result = detectDateFormat(['04/01/2026', '04/13/2026', '04/28/2026']);
    expect(result.format).toBe('mdy');
    expect(result.ambiguous).toBe(false);
  });

  it('defaults to day-first and says so when both fit', () => {
    const result = detectDateFormat(['01/02/2026', '03/04/2026', '05/06/2026']);
    expect(result.format).toBe('dmy');
    expect(result.ambiguous).toBe(true);
    expect(result.reason).toMatch(/both fit/);
  });

  it('uses row order to break a tie', () => {
    // Read month-first these run 5 Jan, 6 Jan, 7 Jan, 8 Jan. Read day-first they jump around.
    const result = detectDateFormat(['01/05/2026', '01/06/2026', '01/07/2026', '02/01/2026']);
    expect(result.format).toBe('mdy');
    expect(result.ambiguous).toBe(true);
    expect(result.reason).toMatch(/date order/);
  });

  it('detects month names and year-first columns', () => {
    expect(detectDateFormat(['01-Jan-2026', '15-Feb-2026']).format).toBe('dmony');
    expect(detectDateFormat(['2026-01-01', '2026-02-15']).format).toBe('ymd');
    expect(detectDateFormat(['Jan 01, 2026', 'Feb 15, 2026']).format).toBe('mondy');
  });

  it('tolerates a few cells that are not dates', () => {
    const result = detectDateFormat(['14/01/2026', '15/01/2026', '16/01/2026', 'Total', '']);
    expect(result.format).toBe('dmy');
  });

  it('gives up on a column that is not dates', () => {
    expect(detectDateFormat(['abc', 'def', '12']).format).toBeNull();
    expect(detectDateFormat([]).format).toBeNull();
    expect(detectDateFormat(['', '  ']).format).toBeNull();
  });
});

describe('calendar arithmetic', () => {
  it('counts days from the epoch', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dayNumber('2000-03-01')).toBe(11017);
  });

  it('measures gaps across month ends and leap days', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2025-02-28', '2025-03-01')).toBe(1);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(daysBetween('2026-03-05', '2026-02-05')).toBe(-28);
    expect(daysBetween('2026-01-05', '2026-01-05')).toBe(0);
  });

  it('knows the weekday', () => {
    expect(weekdayMondayFirst('2026-01-05')).toBe(0); // a Monday
    expect(weekdayMondayFirst('2026-01-11')).toBe(6); // a Sunday
    expect(weekdayMondayFirst('1970-01-01')).toBe(3); // a Thursday
  });

  it('steps through months', () => {
    expect(monthOf('2026-03-07')).toBe('2026-03');
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-03')).toBe('2026-02');
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(daysInIsoMonth('2024-02')).toBe(29);
    expect(daysInIsoMonth('2026-04')).toBe(30);
  });

  it('writes dates and months for display', () => {
    expect(formatDate('2026-03-07')).toBe('7 Mar 2026');
    expect(formatMonth('2026-03')).toBe('March 2026');
    expect(formatMonth('2026-03', 'short')).toBe('Mar 26');
  });
});
