/**
 * Removes account and card fragments from a narration before it is kept.
 *
 * Narrations sometimes embed part of a card or account number, masked
 * (`XXXXXXXXXXXX1234`, `****1234`) or in full. The app has no use for these,
 * so they are cut out at import and never reach the screen, the analytics or
 * the CSV export.
 *
 * Two things are removed:
 *  - a run of four or more mask characters (`X` or `*`) with any digits
 *    attached to it;
 *  - a standalone run of 13 to 19 digits, the length of a card or account
 *    number. UPI and IMPS references are 12 digits and are left alone, as
 *    are references that mix letters and digits.
 */
export function scrubNarration(narration: string): string {
  return narration
    .replace(/[\dXx*]*[Xx*]{4,}[\dXx*]*/g, ' ')
    .replace(/(?<![A-Za-z\d])\d{13,19}(?![A-Za-z\d])/g, ' ')
    .replace(/-\s+-/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}
