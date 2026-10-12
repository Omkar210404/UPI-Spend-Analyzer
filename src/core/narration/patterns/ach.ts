import { compact, tidyName } from '../helpers';
import type { NarrationPattern } from '../types';

// A mandate reference is a trailing token of six or more characters that contains a digit.
const LAYOUT =
  /^(?:ACH|NACH|ECS)(?![A-Za-z])[\s/-]*(?:(?:DR|DEBIT|CR|CREDIT|D|C)(?![A-Za-z])[\s/-]*)?(.+?)(?:[\s/-]+((?=[A-Z0-9]*\d)[A-Z0-9]{6,}))?$/i;

export const ach: NarrationPattern = {
  id: 'ach',
  label: 'ACH, NACH or ECS mandate (automatic debit)',
  layout: 'ACH D- NAME-REFERENCE',
  examples: [
    {
      input: 'ACH D- BRIGHTPOWER ELECTRICITY-DEMO7781234',
      expect: { channel: 'ACH', counterparty: 'BRIGHTPOWER ELECTRICITY', reference: 'DEMO7781234' },
    },
    {
      input: 'NACH-DR-SURECOVER INSURANCE-00012345',
      expect: { channel: 'ACH', counterparty: 'SURECOVER INSURANCE', reference: '00012345' },
    },
    {
      input: 'ECS/HOMEFIRST LOANS',
      expect: { channel: 'ACH', counterparty: 'HOMEFIRST LOANS' },
    },
  ],
  parse(narration) {
    const match = LAYOUT.exec(narration);
    if (!match) return null;
    const counterparty = tidyName(match[1]);
    if (!counterparty) return null;
    return compact({
      channel: 'ACH' as const,
      counterparty,
      reference: match[2]?.toUpperCase(),
    });
  },
};
