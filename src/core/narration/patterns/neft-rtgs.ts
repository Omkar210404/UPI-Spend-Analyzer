import { compact, tidy, tidyName } from '../helpers';
import type { NarrationPattern } from '../types';

// The reference starts with four letters (the sending bank) followed by letters and digits.
const LAYOUT =
  /^(NEFT|RTGS)(?:[\s/-]+(?:CR|DR))?[\s/-]+([A-Z]{4}[A-Z0-9]{6,18})[\s/-]+(.+?)(?:[-/](.*))?$/i;

export const neftRtgs: NarrationPattern = {
  id: 'neft-rtgs',
  label: 'NEFT or RTGS transfer',
  layout: 'NEFT-REFERENCE-NAME-NOTE',
  examples: [
    {
      input: 'NEFT-DEMON26000001-ORBIT TECHNOLOGIES PAYROLL-SALARY APR',
      expect: {
        channel: 'NEFT',
        counterparty: 'ORBIT TECHNOLOGIES PAYROLL',
        reference: 'DEMON26000001',
        note: 'SALARY APR',
      },
    },
    {
      input: 'NEFT CR-DEMON26000002-ORBIT TECHNOLOGIES PAYROLL',
      expect: {
        channel: 'NEFT',
        counterparty: 'ORBIT TECHNOLOGIES PAYROLL',
        reference: 'DEMON26000002',
      },
    },
    {
      input: 'RTGS/DEMOR26000077/HILLVIEW ESTATES/Deposit',
      expect: {
        channel: 'RTGS',
        counterparty: 'HILLVIEW ESTATES',
        reference: 'DEMOR26000077',
        note: 'Deposit',
      },
    },
  ],
  parse(narration) {
    const match = LAYOUT.exec(narration);
    if (!match) return null;
    return compact({
      channel: match[1]!.toUpperCase() === 'RTGS' ? ('RTGS' as const) : ('NEFT' as const),
      counterparty: tidyName(match[3]),
      reference: match[2]!.toUpperCase(),
      note: tidy(match[4]),
    });
  },
};
