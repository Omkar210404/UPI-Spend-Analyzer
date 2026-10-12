import { describe, expect, it } from 'vitest';

import { parseNarration } from '../narration/registry';
import { scrubNarration } from './scrub';

// Dummy values only: a masked placeholder and the standard test card number.
describe('scrubNarration', () => {
  it.each([
    ['POS XXXXXXXXXXXX0000 PAGETURN BOOKS', 'POS PAGETURN BOOKS'],
    ['ATW-XXXXXXXXXXXX0000-DEMO CITY', 'ATW-DEMO CITY'],
    ['POS 4111XXXXXXXX1111 URBAN THREADS', 'POS URBAN THREADS'],
    ['CARD ****0000 PAGETURN BOOKS', 'CARD PAGETURN BOOKS'],
    ['POS 4111111111111111 URBAN THREADS', 'POS URBAN THREADS'],
    [
      'IMPS-512345678902-ROHAN PLACEHOLDER-0000000000000000-Trip',
      'IMPS-512345678902-ROHAN PLACEHOLDER-Trip',
    ],
  ])('cleans %s', (input, expected) => {
    expect(scrubNarration(input)).toBe(expected);
  });

  it.each([
    'UPI/DR/423456789012/CHAI CORNER CAFE/DEMO/chaicorner@okdemo/Tea',
    'UPI/PAGETURN BOOKS/pageturn@okdemo//DEMO BANK/456789012346',
    'NEFT-DEMON26000001-ORBIT TECHNOLOGIES PAYROLL-SALARY APR',
    'RTGS/DEMOR26000077/HILLVIEW ESTATES/Deposit',
    'TO TRANSFER-UPI/DR/434567890123/METRO RAIL RECHARGE/DEMO/metrorail@demoupi/Card topup--',
    'ACH D- BRIGHTPOWER ELECTRICITY-DEMO7781234',
    'INT PD 01-04-2026 TO 30-06-2026',
    'TAXI TO XXX CINEMA',
  ])('leaves %s alone', (input) => {
    expect(scrubNarration(input)).toBe(input);
  });

  it('keeps twelve-digit references', () => {
    expect(scrubNarration('UPIOUT/478901234567/freshbasket@demoupi/5411')).toContain(
      '478901234567',
    );
  });

  it('leaves a narration the patterns can still read', () => {
    expect(parseNarration(scrubNarration('ATW-XXXXXXXXXXXX0000-DEMO CITY'))).toMatchObject({
      patternId: 'atm',
      note: 'DEMO CITY',
    });
    expect(parseNarration(scrubNarration('POS XXXXXXXXXXXX0000 PAGETURN BOOKS'))).toMatchObject({
      patternId: 'pos',
      counterparty: 'PAGETURN BOOKS',
    });
  });
});
