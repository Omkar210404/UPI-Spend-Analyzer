import { compact, dropNumberRuns, tidy } from '../helpers';
import type { NarrationPattern } from '../types';

const LAYOUT =
  /^(?:ATM[\s/-]*(?:CASH[\s/-]*)?(?:WDL|WITHDRAWAL|WD)?|ATW|NWD|CASH[\s/-]*(?:WDL|WITHDRAWAL))(?![A-Za-z])(.*)$/i;
const DEPOSIT = /\b(DEP|DEPOSIT|CDM)\b/i;

/** The name every cash withdrawal is filed under, wherever the machine was. */
export const ATM_COUNTERPARTY = 'ATM cash withdrawal';

export const atm: NarrationPattern = {
  id: 'atm',
  label: 'ATM cash withdrawal',
  layout: 'ATM WDL LOCATION, ATW-CARD-LOCATION or CASH WITHDRAWAL ...',
  examples: [
    {
      input: 'ATM WDL DEMO NAGAR BRANCH',
      expect: { channel: 'ATM', counterparty: ATM_COUNTERPARTY, note: 'DEMO NAGAR BRANCH' },
    },
    {
      // The masked card fragment is discarded and never shown.
      input: 'ATW-XXXXXXXXXXXX0000-DEMO NAGAR',
      expect: { channel: 'ATM', counterparty: ATM_COUNTERPARTY, note: 'DEMO NAGAR' },
    },
    {
      input: 'CASH WITHDRAWAL ATM/000123/DEMO CITY',
      expect: { channel: 'ATM', counterparty: ATM_COUNTERPARTY, note: 'ATM DEMO CITY' },
    },
  ],
  parse(narration) {
    const match = LAYOUT.exec(narration);
    if (!match || DEPOSIT.test(narration)) return null;
    return compact({
      channel: 'ATM' as const,
      counterparty: ATM_COUNTERPARTY,
      // What is left after the card fragment and codes are removed is the location.
      note: tidy(dropNumberRuns(match[1] ?? '').replace(/[/-]+/g, ' ')),
    });
  },
};
