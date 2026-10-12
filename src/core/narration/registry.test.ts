import { describe, expect, it } from 'vitest';

import { PATTERNS, parseNarration } from './registry';

describe('narration patterns', () => {
  it('have unique ids, and the catch-all is last', () => {
    const ids = PATTERNS.map((pattern) => pattern.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[ids.length - 1]).toBe('fallback');
  });

  it('each carry at least one example', () => {
    for (const pattern of PATTERNS) {
      expect(pattern.examples.length, pattern.id).toBeGreaterThan(0);
    }
  });

  // One test per example per pattern: the pattern reads its own examples exactly...
  for (const pattern of PATTERNS) {
    describe(pattern.id, () => {
      for (const example of pattern.examples) {
        it(`reads ${example.input}`, () => {
          expect(pattern.parse(example.input)).toEqual(example.expect);
        });

        // ...and no earlier pattern in the registry claims it first.
        it(`is the pattern the registry picks for ${example.input}`, () => {
          expect(parseNarration(example.input)).toEqual({
            ...example.expect,
            patternId: pattern.id,
          });
        });
      }
    });
  }
});

describe('patterns reject narrations that are not in their style', () => {
  const specific = PATTERNS.filter((pattern) => pattern.id !== 'fallback');

  it.each([
    'SALARY CREDIT ORBIT TECHNOLOGIES',
    'INT PD 01-01-2026 TO 31-03-2026',
    'CASH DEPOSIT DEMO NAGAR BRANCH',
    'ATM CASH DEPOSIT DEMO NAGAR',
    'UPI 489012345678 PAID TO lakeside.pharmacy@okdemo',
    'POSTAGE CHARGES',
    'ACHIEVERS CLUB FEE',
    'ATMOSPHERE LOUNGE',
    'NEFT RETURN',
    '',
  ])('no specific pattern claims %j', (narration) => {
    for (const pattern of specific) {
      expect(pattern.parse(narration), pattern.id).toBeNull();
    }
  });

  it('a UPI reference must be exactly twelve digits', () => {
    expect(
      parseNarration('UPI/DR/12345/CHAI CORNER CAFE/DEMO/chaicorner@okdemo/Tea').patternId,
    ).toBe('fallback');
    expect(parseNarration('UPI/P2M/1234567890123/ZIPCAB RIDES/Ride').patternId).toBe('fallback');
  });
});

describe('parseNarration', () => {
  it('ignores extra spaces and letter case in the fixed words', () => {
    const parsed = parseNarration(
      '  upi/dr/423456789012/Chai  Corner Cafe/DEMO/ChaiCorner@OkDemo/Tea ',
    );
    expect(parsed).toMatchObject({
      patternId: 'upi-slash-drcr',
      counterparty: 'Chai Corner Cafe',
      vpa: 'chaicorner@okdemo',
    });
  });

  it('never returns the masked card fragment from a card or ATM narration', () => {
    for (const narration of [
      'POS XXXXXXXXXXXX0000 PAGETURN BOOKS',
      'ATW-XXXXXXXXXXXX0000-DEMO NAGAR',
    ]) {
      const { patternId, ...fields } = parseNarration(narration);
      expect(patternId).not.toBe('fallback');
      expect(JSON.stringify(fields)).not.toMatch(/X{4}|0000/);
    }
  });

  it('gives a handle that is only digits no made-up name', () => {
    const parsed = parseNarration('UPIOUT/478901234569/0000000000@demoupi/0000');
    expect(parsed.counterparty).toBeUndefined();
    expect(parsed.vpa).toBe('0000000000@demoupi');
  });

  it('can run with a custom pattern list', () => {
    const only = PATTERNS.filter((pattern) => pattern.id === 'fallback');
    expect(
      parseNarration('UPI/P2M/445678901234/ZIPCAB RIDES/Ride fare/DEMO BANK', only).patternId,
    ).toBe('fallback');
    expect(parseNarration('anything', []).patternId).toBe('none');
  });
});
