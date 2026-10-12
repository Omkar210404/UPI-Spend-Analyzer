import { compact, tidy, tidyName } from '../helpers';
import type { NarrationPattern } from '../types';

const MMT = /^MMT\/IMPS\/(\d{12})\/([^/]*)\/([^/]*)(?:\/([^/]*))?$/i;
const PLAIN = /^IMPS[-/](?:P2A[-/])?(\d{12})[-/]([^-/]+)[-/]([^-/]+)(?:[-/](.*))?$/i;

export const imps: NarrationPattern = {
  id: 'imps',
  label: 'IMPS transfer',
  layout: 'MMT/IMPS/REFERENCE/NOTE/NAME/BANK or IMPS-REFERENCE-NAME-BANK-NOTE',
  examples: [
    {
      input: 'MMT/IMPS/512345678901/Flat deposit/HILLVIEW ESTATES/DEMO BANK',
      expect: {
        channel: 'IMPS',
        counterparty: 'HILLVIEW ESTATES',
        reference: '512345678901',
        note: 'Flat deposit',
      },
    },
    {
      input: 'IMPS-512345678902-ROHAN PLACEHOLDER-DEMO BANK-Trip share',
      expect: {
        channel: 'IMPS',
        counterparty: 'ROHAN PLACEHOLDER',
        reference: '512345678902',
        note: 'Trip share',
      },
    },
  ],
  parse(narration) {
    const mmt = MMT.exec(narration);
    if (mmt) {
      return compact({
        channel: 'IMPS' as const,
        counterparty: tidyName(mmt[3]),
        reference: mmt[1],
        note: tidy(mmt[2]),
      });
    }
    const plain = PLAIN.exec(narration);
    if (plain) {
      return compact({
        channel: 'IMPS' as const,
        counterparty: tidyName(plain[2]),
        reference: plain[1],
        note: tidy(plain[4]),
      });
    }
    return null;
  },
};
