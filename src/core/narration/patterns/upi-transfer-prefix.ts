import { compact, tidy, tidyName, tidyVpa } from '../helpers';
import type { NarrationPattern } from '../types';

const LAYOUT =
  /^(?:TO|BY) TRANSFER[\s-]+UPI\/(?:DR|CR)\/(\d{12})\/([^/]*)\/([^/]*)\/([^/]*)(?:\/(.*?))?-*$/i;

export const upiTransferPrefix: NarrationPattern = {
  id: 'upi-transfer-prefix',
  label: 'Style C: UPI behind a "TO TRANSFER" or "BY TRANSFER" prefix',
  layout: 'TO TRANSFER-UPI/DR/REFERENCE/NAME/BANK/HANDLE/NOTE--',
  examples: [
    {
      input:
        'TO TRANSFER-UPI/DR/434567890123/METRO RAIL RECHARGE/DEMO/metrorail@demoupi/Card topup--',
      expect: {
        channel: 'UPI',
        counterparty: 'METRO RAIL RECHARGE',
        vpa: 'metrorail@demoupi',
        reference: '434567890123',
        note: 'Card topup',
      },
    },
    {
      // Some exports cut the handle short. A cut handle is dropped, not guessed.
      input: 'BY TRANSFER-UPI/CR/434567890124/ROHAN PLACEHOLDER/DEMO/rohan.plac/Refund--',
      expect: {
        channel: 'UPI',
        counterparty: 'ROHAN PLACEHOLDER',
        reference: '434567890124',
        note: 'Refund',
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
