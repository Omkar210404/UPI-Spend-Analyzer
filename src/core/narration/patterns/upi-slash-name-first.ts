import { compact, tidy, tidyName, tidyVpa } from '../helpers';
import type { NarrationPattern } from '../types';

const LAYOUT = /^UPI\/([^/]*)\/([^/\s]+@[^/\s]+)\/([^/]*)\/([^/]*)\/(\d{12})(?:\/.*)?$/i;

export const upiSlashNameFirst: NarrationPattern = {
  id: 'upi-slash-name-first',
  label: 'Style E: UPI, slash separated, name first and reference near the end',
  layout: 'UPI/NAME/HANDLE/NOTE/BANK/REFERENCE/CODE',
  examples: [
    {
      input:
        'UPI/NIMBUS STREAM/nimbus.stream@demopay/Monthly plan/DEMO BANK/456789012345/DMO9f3a2c',
      expect: {
        channel: 'UPI',
        counterparty: 'NIMBUS STREAM',
        vpa: 'nimbus.stream@demopay',
        reference: '456789012345',
        note: 'Monthly plan',
      },
    },
    {
      input: 'UPI/PAGETURN BOOKS/pageturn@okdemo//DEMO BANK/456789012346',
      expect: {
        channel: 'UPI',
        counterparty: 'PAGETURN BOOKS',
        vpa: 'pageturn@okdemo',
        reference: '456789012346',
      },
    },
  ],
  parse(narration) {
    const match = LAYOUT.exec(narration);
    if (!match) return null;
    return compact({
      channel: 'UPI' as const,
      counterparty: tidyName(match[1]),
      vpa: tidyVpa(match[2]),
      reference: match[5],
      note: tidy(match[3]),
    });
  },
};
