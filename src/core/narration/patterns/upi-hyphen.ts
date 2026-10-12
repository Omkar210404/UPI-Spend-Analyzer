import { compact, tidy, tidyName, tidyVpa } from '../helpers';
import type { NarrationPattern } from '../types';

// The handle's local part is matched without hyphens here, so a hyphen inside
// the payee name (`A-ONE DAIRY`) stays with the name.
const LAYOUT =
  /^UPI-(.+?)-([a-z0-9][a-z0-9._]*@[a-z][a-z0-9]+)-([A-Z0-9]{4,11})-(\d{12})(?:-(.*))?$/i;

export const upiHyphen: NarrationPattern = {
  id: 'upi-hyphen',
  label: 'Style A: UPI, hyphen separated',
  layout: 'UPI-NAME-HANDLE-BANKCODE-REFERENCE-NOTE',
  examples: [
    {
      input: 'UPI-GREENLEAF GROCERS-greenleaf.grocers@okdemo-DEMO0001234-412345678901-GROCERIES',
      expect: {
        channel: 'UPI',
        counterparty: 'GREENLEAF GROCERS',
        vpa: 'greenleaf.grocers@okdemo',
        reference: '412345678901',
        note: 'GROCERIES',
      },
    },
    {
      input: 'UPI-A-ONE DAIRY-aonedairy@demoupi-DEMO0005678-412345678905',
      expect: {
        channel: 'UPI',
        counterparty: 'A-ONE DAIRY',
        vpa: 'aonedairy@demoupi',
        reference: '412345678905',
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
      reference: match[4],
      note: tidy(match[5]),
    });
  },
};
