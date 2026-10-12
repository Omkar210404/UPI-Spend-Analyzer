import { compact, nameFromVpa, tidyVpa } from '../helpers';
import type { NarrationPattern } from '../types';

const LAYOUT = /^UPI(?:OUT|IN)\/(\d{12})\/([^/\s]+@[^/\s]+)(?:\/.*)?$/i;

export const upiInOut: NarrationPattern = {
  id: 'upi-in-out',
  label: 'Style G: UPIOUT and UPIIN',
  layout: 'UPIOUT/REFERENCE/HANDLE/CODE',
  examples: [
    {
      input: 'UPIOUT/478901234567/freshbasket@demoupi/5411',
      expect: {
        channel: 'UPI',
        counterparty: 'freshbasket',
        vpa: 'freshbasket@demoupi',
        reference: '478901234567',
      },
    },
    {
      input: 'UPIIN/478901234568/kabir.demo@demopay',
      expect: {
        channel: 'UPI',
        counterparty: 'kabir demo',
        vpa: 'kabir.demo@demopay',
        reference: '478901234568',
      },
    },
  ],
  parse(narration) {
    const match = LAYOUT.exec(narration);
    if (!match) return null;
    const vpa = tidyVpa(match[2]);
    return compact({
      channel: 'UPI' as const,
      counterparty: nameFromVpa(vpa),
      vpa,
      reference: match[1],
    });
  },
};
