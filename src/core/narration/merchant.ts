import type { ParsedNarration } from '../types';
import { nameFromVpa } from './helpers';
import { ATM_COUNTERPARTY } from './patterns/atm';

/**
 * Merchant identity: the key the app groups by.
 *
 * Two transactions belong to the same merchant when their keys are equal.
 * The key is the payee name in capitals with punctuation and company
 * suffixes removed, so `Greenleaf Grocers Pvt. Ltd.` and `GREENLEAF GROCERS`
 * meet. It does not try to be clever beyond that: one shop appearing under
 * two different names stays two merchants.
 */

export const UNKNOWN_MERCHANT_KEY = 'UNKNOWN';

const COMPANY_SUFFIXES = new Set(['PVT', 'PRIVATE', 'LTD', 'LIMITED', 'LLP', 'INC', 'CORP']);

export function merchantKeyOf(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word !== '');
  while (words.length > 1 && COMPANY_SUFFIXES.has(words[words.length - 1]!)) words.pop();
  return words.join(' ') || UNKNOWN_MERCHANT_KEY;
}

function titleCase(key: string): string {
  return key
    .toLowerCase()
    .split(' ')
    .map((word) => (word === '' ? word : word[0]!.toUpperCase() + word.slice(1)))
    .join(' ');
}

export interface MerchantIdentity {
  key: string;
  name: string;
}

export function merchantIdentity(parsed: ParsedNarration): MerchantIdentity {
  if (parsed.channel === 'ATM') {
    return { key: merchantKeyOf(ATM_COUNTERPARTY), name: ATM_COUNTERPARTY };
  }
  // A handle that is only digits yields no name; the handle itself then identifies the payee.
  const source = parsed.counterparty ?? nameFromVpa(parsed.vpa) ?? parsed.vpa;
  if (source === undefined) return { key: UNKNOWN_MERCHANT_KEY, name: 'Unknown' };
  const key = merchantKeyOf(source);
  return { key, name: key === UNKNOWN_MERCHANT_KEY ? 'Unknown' : titleCase(key) };
}
