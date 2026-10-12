import { compact, tidy, tidyName } from '../helpers';
import type { NarrationPattern } from '../types';

const LAYOUT = /^UPI\/(P2M|P2A)\/(\d{12})\/([^/]*)(?:\/([^/]*))?(?:\/([^/]*))?$/i;

export const upiSlashP2: NarrationPattern = {
  id: 'upi-slash-p2',
  label: 'Style D: UPI with a P2M (to merchant) or P2A (to person) marker',
  layout: 'UPI/P2M/REFERENCE/NAME/NOTE/BANK',
  examples: [
    {
      input: 'UPI/P2M/445678901234/ZIPCAB RIDES/Ride fare/DEMO BANK',
      expect: {
        channel: 'UPI',
        counterparty: 'ZIPCAB RIDES',
        reference: '445678901234',
        note: 'Ride fare',
      },
    },
    {
      input: 'UPI/P2A/445678901235/ASHA SAMPLE/Dinner split/DEMO BANK',
      expect: {
        channel: 'UPI',
        counterparty: 'ASHA SAMPLE',
        reference: '445678901235',
        note: 'Dinner split',
        personToPerson: true,
      },
    },
  ],
  parse(narration) {
    const match = LAYOUT.exec(narration);
    if (!match) return null;
    return compact({
      channel: 'UPI' as const,
      counterparty: tidyName(match[3]),
      reference: match[2],
      note: tidy(match[4]),
      personToPerson: match[1]!.toUpperCase() === 'P2A' ? true : undefined,
    });
  },
};
