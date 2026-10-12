import type { ParsedNarration } from '../types';
import { ach } from './patterns/ach';
import { atm } from './patterns/atm';
import { fallback } from './patterns/fallback';
import { imps } from './patterns/imps';
import { neftRtgs } from './patterns/neft-rtgs';
import { pos } from './patterns/pos';
import { upiHyphen } from './patterns/upi-hyphen';
import { upiInOut } from './patterns/upi-in-out';
import { upiSlashDrCr } from './patterns/upi-slash-drcr';
import { upiSlashNameFirst } from './patterns/upi-slash-name-first';
import { upiSlashP2 } from './patterns/upi-slash-p2';
import { upiSlashRefFirst } from './patterns/upi-slash-ref-first';
import { upiTransferPrefix } from './patterns/upi-transfer-prefix';
import type { NarrationPattern } from './types';

/**
 * Every narration style the app understands, tried in this order. The first
 * pattern that returns a result wins, so more specific styles come first and
 * the catch-all comes last.
 *
 * To add a style: write one file in ./patterns with a few examples, then add
 * it to this list above `fallback`. The registry test runs every example.
 */
export const PATTERNS: readonly NarrationPattern[] = [
  upiHyphen,
  upiSlashDrCr,
  upiTransferPrefix,
  upiSlashP2,
  upiSlashNameFirst,
  upiSlashRefFirst,
  upiInOut,
  imps,
  neftRtgs,
  atm,
  pos,
  ach,
  fallback,
];

/** Reads one narration with the first pattern that understands it. */
export function parseNarration(
  narration: string,
  patterns: readonly NarrationPattern[] = PATTERNS,
): ParsedNarration {
  const text = narration.replace(/\s+/g, ' ').trim();
  for (const pattern of patterns) {
    const result = pattern.parse(text);
    if (result) return { ...result, patternId: pattern.id };
  }
  return { channel: 'OTHER', patternId: 'none' };
}
