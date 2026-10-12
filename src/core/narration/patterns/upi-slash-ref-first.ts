import { compact, nameFromVpa, tidy, tidyVpa } from '../helpers';
import type { NarrationPattern } from '../types';

const LAYOUT = /^UPI\/(\d{12})\/([^/]*)\/([^/\s]+@[^/\s]+)(?:\/([^/]*))?$/i;

export const upiSlashRefFirst: NarrationPattern = {
  id: 'upi-slash-ref-first',
  label: 'Style F: UPI, slash separated, reference first and no name',
  layout: 'UPI/REFERENCE/NOTE/HANDLE/BANK',
  examples: [
    {
      // No name in this style, so one is read off the handle.
      input: 'UPI/467890123456/Payment from app/quick.mart@okdemo/DEMO BANK',
      expect: {
        channel: 'UPI',
        counterparty: 'quick mart',
        vpa: 'quick.mart@okdemo',
        reference: '467890123456',
        note: 'Payment from app',
      },
    },
  ],
  parse(narration) {
    const match = LAYOUT.exec(narration);
    if (!match) return null;
    const vpa = tidyVpa(match[3]);
    return compact({
      channel: 'UPI' as const,
      counterparty: nameFromVpa(vpa),
      vpa,
      reference: match[1],
      note: tidy(match[2]),
    });
  },
};
