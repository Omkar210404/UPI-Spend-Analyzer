import { compact, tidy, tidyName, tidyVpa } from '../helpers';
import type { NarrationPattern } from '../types';

const LAYOUT = /^UPI\/(?:DR|CR)\/(\d{12})\/([^/]*)\/([^/]*)\/([^/\s]+@[^/\s]+)(?:\/(.*))?$/i;

export const upiSlashDrCr: NarrationPattern = {
  id: 'upi-slash-drcr',
  label: 'Style B: UPI, slash separated with DR or CR',
  layout: 'UPI/DR/REFERENCE/NAME/BANK/HANDLE/NOTE',
  examples: [
    {
      input: 'UPI/DR/423456789012/CHAI CORNER CAFE/DEMO/chaicorner@okdemo/Tea',
      expect: {
        channel: 'UPI',
        counterparty: 'CHAI CORNER CAFE',
        vpa: 'chaicorner@okdemo',
        reference: '423456789012',
        note: 'Tea',
      },
    },
    {
      input: 'UPI/CR/423456789013/MEERA TESTER/DEMO/meera.tester@demopay',
      expect: {
        channel: 'UPI',
        counterparty: 'MEERA TESTER',
        vpa: 'meera.tester@demopay',
        reference: '423456789013',
      },
    },
  ],
  parse(narration) {
    const match = LAYOUT.exec(narration);
    if (!match) return null;
    return compact({
      channel: 'UPI' as const,
      counterparty: tidyName(match[2]),
      vpa: tidyVpa(match[4]),
      reference: match[1],
      note: tidy(match[5]),
    });
  },
};
