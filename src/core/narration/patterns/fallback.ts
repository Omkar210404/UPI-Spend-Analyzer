import type { Channel } from '../../types';
import { compact, nameFromVpa, tidyName, tidyVpa, VPA_ANYWHERE } from '../helpers';
import type { NarrationPattern } from '../types';

function channelOf(narration: string): Channel {
  if (/\bUPI/i.test(narration)) return 'UPI';
  if (/\bIMPS\b/i.test(narration)) return 'IMPS';
  if (/\bNEFT\b/i.test(narration)) return 'NEFT';
  if (/\bRTGS\b/i.test(narration)) return 'RTGS';
  return 'OTHER';
}

/** The narration with numbers, codes and separators removed: what is left is usually a name. */
function wordsOnly(narration: string): string | undefined {
  const words = narration
    .replace(/[/_|:,]+/g, ' ')
    .split(/\s+/)
    .filter(
      (word) => !/\d/.test(word) && !/^(UPI|IMPS|NEFT|RTGS|DR|CR|TO|BY|TRANSFER)$/i.test(word),
    );
  return tidyName(words.join(' ').slice(0, 48));
}

/**
 * The last resort, which always matches. It makes no claim about layout: it
 * keeps any UPI handle and twelve-digit reference it can see, and uses the
 * handle, or failing that the words of the narration, as the name.
 */
export const fallback: NarrationPattern = {
  id: 'fallback',
  label: 'Anything else (best effort)',
  layout: 'Any text. A UPI handle and a 12-digit reference are picked up if present.',
  examples: [
    {
      input: 'UPI 489012345678 PAID TO lakeside.pharmacy@okdemo',
      expect: {
        channel: 'UPI',
        counterparty: 'lakeside pharmacy',
        vpa: 'lakeside.pharmacy@okdemo',
        reference: '489012345678',
      },
    },
    {
      input: 'SALARY CREDIT ORBIT TECHNOLOGIES',
      expect: { channel: 'OTHER', counterparty: 'SALARY CREDIT ORBIT TECHNOLOGIES' },
    },
    {
      input: 'INT PD 01-01-2026 TO 31-03-2026',
      expect: { channel: 'OTHER', counterparty: 'INT PD' },
    },
  ],
  parse(narration) {
    const vpa = tidyVpa(VPA_ANYWHERE.exec(narration)?.[0]);
    const reference = /(?<!\d)\d{12}(?!\d)/.exec(narration)?.[0];
    return compact({
      channel: channelOf(narration),
      counterparty: nameFromVpa(vpa) ?? wordsOnly(narration),
      vpa,
      reference,
    });
  },
};
