import { compact, dropNumberRuns, tidy, tidyName } from '../helpers';
import type { NarrationPattern } from '../types';

const LAYOUT = /^(?:POS|ECOM PUR|ECOM|PUR|PCD)(?![A-Za-z])[\s/-]*(.*)$/i;

export const pos: NarrationPattern = {
  id: 'pos',
  label: 'Card payment at a shop or online',
  layout: 'POS/MERCHANT/CITY/DATE or POS CARD MERCHANT',
  examples: [
    {
      input: 'POS/URBAN THREADS/DEMO CITY/140426',
      expect: { channel: 'POS', counterparty: 'URBAN THREADS', note: 'DEMO CITY' },
    },
    {
      // The masked card fragment is discarded and never shown.
      input: 'POS XXXXXXXXXXXX0000 PAGETURN BOOKS',
      expect: { channel: 'POS', counterparty: 'PAGETURN BOOKS' },
    },
    {
      input: 'ECOM PUR/KARTWHEEL ONLINE',
      expect: { channel: 'POS', counterparty: 'KARTWHEEL ONLINE' },
    },
  ],
  parse(narration) {
    const match = LAYOUT.exec(narration);
    if (!match) return null;
    const parts = dropNumberRuns(match[1] ?? '')
      .split('/')
      .map((part) => tidy(part))
      .filter((part): part is string => part !== undefined);
    const counterparty = tidyName(parts[0]);
    if (!counterparty) return null;
    return compact({ channel: 'POS' as const, counterparty, note: parts[1] });
  },
};
