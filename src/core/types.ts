/**
 * Shared shapes for the logic layer.
 *
 * Two conventions hold everywhere in src/core:
 *  - money is an integer number of paise (100 paise = 1 rupee), never a float;
 *  - a date is a plain calendar date written `yyyy-mm-dd`, with no time zone.
 */

/** A calendar date as `yyyy-mm-dd`. */
export type IsoDate = string;

/** A calendar month as `yyyy-mm`. */
export type IsoMonth = string;

export type Direction = 'debit' | 'credit';

export type Channel = 'UPI' | 'IMPS' | 'NEFT' | 'RTGS' | 'ATM' | 'POS' | 'ACH' | 'OTHER';

/** What a narration parser could read out of one narration line. */
export interface ParsedNarration {
  channel: Channel;
  /** Payee or merchant name as written in the narration. */
  counterparty?: string;
  /** UPI handle such as `shop@bank`, lowercased. */
  vpa?: string;
  /** Transaction reference (UPI RRN, IMPS or NEFT reference). */
  reference?: string;
  /** Free-text remark the payer or the bank attached. */
  note?: string;
  /** True when the narration itself marks a person-to-person transfer. */
  personToPerson?: boolean;
  /** Which pattern produced this result. */
  patternId: string;
}

/** One statement row after import, before categorisation. */
export interface Txn {
  /** Stable fingerprint of the row, used to key a per-transaction override. */
  id: string;
  date: IsoDate;
  narration: string;
  amountPaise: number;
  direction: Direction;
  balancePaise: number | null;
  reference: string | null;
  parsed: ParsedNarration;
  /** Normalised merchant identity; equal keys are treated as the same merchant. */
  merchantKey: string;
  /** Readable form of the merchant key. */
  merchantName: string;
}
