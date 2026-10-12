import type { IsoDate, IsoMonth } from '../types';

/**
 * Calendar dates without `Date`.
 *
 * A statement date is a day on a calendar, not an instant. Building `Date`
 * objects from it invites time-zone shifts (a 1 March row turning into 28
 * February), so everything here is integer arithmetic on year, month and day.
 */

export type DateFormatId = 'dmy' | 'mdy' | 'ymd' | 'dmony' | 'mondy';

export interface DateFormatInfo {
  id: DateFormatId;
  label: string;
  example: string;
}

export const DATE_FORMATS: readonly DateFormatInfo[] = [
  { id: 'dmy', label: 'Day / month / year', example: '31/01/2026, 31-01-26, 31.01.2026' },
  {
    id: 'dmony',
    label: 'Day, month name, year',
    example: '31-Jan-2026, 31 Jan 26, 31 January 2026',
  },
  { id: 'ymd', label: 'Year - month - day', example: '2026-01-31, 2026/01/31' },
  { id: 'mdy', label: 'Month / day / year', example: '01/31/2026' },
  { id: 'mondy', label: 'Month name, day, year', example: 'Jan 31, 2026' },
];

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1990 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

export function toIso(year: number, month: number, day: number): IsoDate {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function fromIso(date: IsoDate): { year: number; month: number; day: number } {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

/** A two-digit year in a statement is read as 20xx below 70 and 19xx otherwise. */
function expandYear(text: string): number {
  const value = Number(text);
  if (text.length === 4) return value;
  return value < 70 ? 2000 + value : 1900 + value;
}

/** Accepts `Jan`, `January`, `Sept`: any prefix of the full name, three letters or more. */
function monthFromName(name: string): number | null {
  const lower = name.toLowerCase();
  const month = MONTHS[lower.slice(0, 3)];
  if (month === undefined) return null;
  const full = MONTH_NAMES[month - 1]!.toLowerCase();
  return full.startsWith(lower) || lower === 'sept' ? month : null;
}

/** Drops a trailing time such as ` 10:30:15`, `T10:30` or ` 10:30 PM`. */
function stripTime(text: string): string {
  return text
    .replace(/[\sT]+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*([AaPp][Mm])?\s*(Z|[+-]\d{2}:?\d{2})?$/, '')
    .trim();
}

const NUMERIC = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/;
const DAY_MONTH_NAME = /^(\d{1,2})[\s/.-]*([A-Za-z]{3,9})[\s/.,-]*(\d{2}|\d{4})$/;
const MONTH_NAME_DAY = /^([A-Za-z]{3,9})[\s/.-]*(\d{1,2})(?:st|nd|rd|th)?[\s/.,-]+(\d{2}|\d{4})$/;

/**
 * Parses one date cell in the given format.
 * Returns null when the text is not a real calendar date in that format.
 */
export function parseDate(raw: string, format: DateFormatId): IsoDate | null {
  const text = stripTime(raw.replace(/\u00a0/g, ' ').trim());
  if (text === '') return null;

  let year: number;
  let month: number | null;
  let day: number;

  if (format === 'dmy' || format === 'mdy' || format === 'ymd') {
    const match = NUMERIC.exec(text);
    if (!match) return null;
    const [, a, b, c] = match as unknown as [string, string, string, string];
    if (format === 'ymd') {
      if (a.length !== 4) return null;
      year = Number(a);
      month = Number(b);
      day = Number(c);
    } else {
      if (a.length > 2 || c.length === 3 || c.length === 1) return null;
      year = expandYear(c);
      month = Number(format === 'dmy' ? b : a);
      day = Number(format === 'dmy' ? a : b);
    }
  } else if (format === 'dmony') {
    const match = DAY_MONTH_NAME.exec(text);
    if (!match) return null;
    day = Number(match[1]);
    month = monthFromName(match[2]!);
    year = expandYear(match[3]!);
  } else {
    const match = MONTH_NAME_DAY.exec(text);
    if (!match) return null;
    month = monthFromName(match[1]!);
    day = Number(match[2]);
    year = expandYear(match[3]!);
  }

  if (month === null || !isValidYmd(year, month, day)) return null;
  return toIso(year, month, day);
}

export interface DateFormatDetection {
  /** The format to use, or null when nothing parsed the column. */
  format: DateFormatId | null;
  /** True when day-first and month-first both fit every value. */
  ambiguous: boolean;
  /** One plain sentence saying why this format was picked. */
  reason: string;
}

function isOrdered(values: IsoDate[]): boolean {
  let ascending = true;
  let descending = true;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i]! < values[i - 1]!) ascending = false;
    if (values[i]! > values[i - 1]!) descending = false;
  }
  return ascending || descending;
}

/**
 * Works out which format a whole date column is written in.
 *
 * A format is a candidate when it parses the most cells. Day-first and
 * month-first can both fit (03/04/2026); then the one that keeps the rows in
 * date order wins, and if that does not settle it either, day-first is used
 * because that is how Indian statements are written. The caller is told.
 */
export function detectDateFormat(values: readonly string[]): DateFormatDetection {
  const cells = values.map((value) => value.trim()).filter((value) => value !== '');
  if (cells.length === 0) {
    return { format: null, ambiguous: false, reason: 'The column is empty.' };
  }

  const parsed = new Map<DateFormatId, IsoDate[]>();
  for (const { id } of DATE_FORMATS) {
    const dates: IsoDate[] = [];
    for (const cell of cells) {
      const date = parseDate(cell, id);
      if (date) dates.push(date);
    }
    parsed.set(id, dates);
  }

  const best = Math.max(...[...parsed.values()].map((dates) => dates.length));
  // A statement column also holds a few non-date cells (totals, notes); most must parse.
  if (best === 0 || best < cells.length * 0.6) {
    return { format: null, ambiguous: false, reason: 'Most values do not look like dates.' };
  }
  const candidates = DATE_FORMATS.map((f) => f.id).filter((id) => parsed.get(id)!.length === best);

  if (candidates.includes('dmy') && candidates.includes('mdy')) {
    const dayFirstOrdered = isOrdered(parsed.get('dmy')!);
    const monthFirstOrdered = isOrdered(parsed.get('mdy')!);
    if (monthFirstOrdered && !dayFirstOrdered) {
      return {
        format: 'mdy',
        ambiguous: true,
        reason:
          'Day-first and month-first both fit. Month-first was picked because it keeps the rows in date order.',
      };
    }
    return {
      format: 'dmy',
      ambiguous: true,
      reason:
        dayFirstOrdered && !monthFirstOrdered
          ? 'Day-first and month-first both fit. Day-first was picked because it keeps the rows in date order.'
          : 'Day-first and month-first both fit. Day-first was picked because Indian statements are written that way.',
    };
  }

  const format = candidates[0]!;
  return { format, ambiguous: false, reason: `Every date fits ${describeFormat(format)}.` };
}

function describeFormat(id: DateFormatId): string {
  return DATE_FORMATS.find((format) => format.id === id)!.label.toLowerCase();
}

/** Days since 1970-01-01 for a calendar date (Howard Hinnant's days-from-civil). */
export function dayNumber(date: IsoDate): number {
  const { year, month, day } = fromIso(date);
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return dayNumber(to) - dayNumber(from);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayMondayFirst(date: IsoDate): number {
  // 1970-01-01 was a Thursday (index 3 when Monday is 0).
  return (((dayNumber(date) + 3) % 7) + 7) % 7;
}

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7);
}

export function previousMonth(month: IsoMonth): IsoMonth {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, '0')}`;
}

export function nextMonth(month: IsoMonth): IsoMonth {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`;
}

/** Every month from `first` to `last`, both included. */
export function monthRange(first: IsoMonth, last: IsoMonth): IsoMonth[] {
  const months: IsoMonth[] = [];
  for (let month = first; month <= last; month = nextMonth(month)) months.push(month);
  return months;
}

export function daysInIsoMonth(month: IsoMonth): number {
  return daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
}

/** `2026-03` becomes `March 2026`. */
export function formatMonth(month: IsoMonth, style: 'long' | 'short' = 'long'): string {
  const name = MONTH_NAMES[Number(month.slice(5, 7)) - 1]!;
  const year = month.slice(0, 4);
  return style === 'long' ? `${name} ${year}` : `${name.slice(0, 3)} ${year.slice(2)}`;
}

/** `2026-03-07` becomes `7 Mar 2026`. */
export function formatDate(date: IsoDate): string {
  const { year, month, day } = fromIso(date);
  return `${day} ${MONTH_NAMES[month - 1]!.slice(0, 3)} ${year}`;
}
