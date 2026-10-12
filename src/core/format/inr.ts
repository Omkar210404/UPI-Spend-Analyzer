/**
 * Indian rupee formatting, written by hand so the output is identical in
 * every browser and in the tests (Intl output shifts between ICU versions).
 */

const MINUS = '−';

/** Groups an integer string the Indian way: last three digits, then pairs. `1234567` -> `12,34,567`. */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}`;
}

export interface FormatInrOptions {
  /** `always` shows paise, `never` rounds to the rupee, `auto` hides `.00`. Default `always`. */
  paise?: 'always' | 'never' | 'auto';
  /** Show a leading `+` on positive amounts. */
  plus?: boolean;
}

/** `12345678` paise -> `₹1,23,456.78`. */
export function formatInr(paise: number, options: FormatInrOptions = {}): string {
  const mode = options.paise ?? 'always';
  const negative = paise < 0;
  let absolute = Math.abs(Math.round(paise));
  if (mode === 'never') absolute = Math.round(absolute / 100) * 100;

  const rupees = groupIndian(String(Math.floor(absolute / 100)));
  const fraction = String(absolute % 100).padStart(2, '0');
  const showFraction = mode === 'always' || (mode === 'auto' && fraction !== '00');

  const sign = negative ? MINUS : options.plus && absolute > 0 ? '+' : '';
  return `${sign}₹${rupees}${showFraction ? `.${fraction}` : ''}`;
}

function trimDecimal(value: number): string {
  // Two decimals, without trailing zeros: 1.50 -> 1.5, 2.00 -> 2.
  return value.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * A short form for headline figures. Below one lakh it is the rounded rupee
 * amount; from one lakh up it is written in lakh or crore.
 * `12345600` paise -> `₹1.23 lakh`.
 */
export function formatInrCompact(paise: number): string {
  const negative = paise < 0;
  const rupees = Math.abs(paise) / 100;
  const sign = negative ? MINUS : '';
  if (rupees >= 1_00_00_000) return `${sign}₹${trimDecimal(rupees / 1_00_00_000)} crore`;
  if (rupees >= 1_00_000) return `${sign}₹${trimDecimal(rupees / 1_00_000)} lakh`;
  return formatInr(paise, { paise: 'never' });
}

/** A plain decimal for CSV export: `12345678` paise -> `123456.78`. */
export function paiseToDecimal(paise: number): string {
  const negative = paise < 0;
  const absolute = Math.abs(Math.round(paise));
  const text = `${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}
