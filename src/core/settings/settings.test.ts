import { describe, expect, it } from 'vitest';

import { setMerchantOverride, setTxnOverride, EMPTY_OVERRIDES } from '../categorise/overrides';
import type { MappingProfile } from '../import/mapping';
import {
  defaultSettings,
  parseSettings,
  readOverrides,
  readProfiles,
  readRules,
  serialiseSettings,
  type Settings,
} from './settings';

const PROFILE: MappingProfile = {
  id: 'p1',
  name: 'Demo Bank',
  signature: 'txn date|narration|debit|credit',
  mapping: {
    date: 0,
    narration: 1,
    dateFormat: 'dmy',
    amountMode: 'debit-credit',
    debit: 2,
    credit: 3,
    amount: null,
    marker: null,
    positiveIs: 'credit',
    balance: null,
    reference: null,
  },
};

function sample(): Settings {
  let overrides = setTxnOverride(EMPTY_OVERRIDES, '0123456789abcdef', 'health');
  overrides = setMerchantOverride(overrides, 'URBAN THREADS', 'shopping');
  return {
    rules: [
      { id: 'r1', category: 'food', keywords: ['CAFE', 'CHAI CORNER'] },
      { id: 'r2', category: 'transport', keywords: ['METRO', 'ZIPCAB*'] },
    ],
    overrides,
    profiles: [PROFILE],
  };
}

describe('settings JSON', () => {
  it('round-trips rules, overrides and profiles exactly', () => {
    const settings = sample();
    const parsed = parseSettings(serialiseSettings(settings));
    expect(parsed).toEqual({ ok: true, settings });
  });

  it('round-trips the defaults', () => {
    const settings = defaultSettings();
    expect(parseSettings(serialiseSettings(settings))).toEqual({ ok: true, settings });
  });

  it('says in the file that it holds no transactions', () => {
    const data = JSON.parse(serialiseSettings(sample())) as Record<string, unknown>;
    expect(data.app).toBe('upi-spend-analyzer');
    expect(data.version).toBe(1);
    expect(data.note).toMatch(/No transactions/);
  });

  it.each([
    ['not json', /not a JSON file/],
    ['[]', /not exported from/],
    ['{"app":"something-else","version":1}', /not exported from/],
    ['{"app":"upi-spend-analyzer","version":2,"rules":[],"overrides":{}}', /version 2/],
    ['{"app":"upi-spend-analyzer","version":1,"rules":"x","overrides":{}}', /rules/],
    [
      '{"app":"upi-spend-analyzer","version":1,"rules":[],"overrides":{"byTxn":{},"byMerchant":{"M":"gambling"}}}',
      /category choices/,
    ],
    [
      '{"app":"upi-spend-analyzer","version":1,"rules":[],"overrides":{"byTxn":{},"byMerchant":{}},"profiles":[{"id":"p"}]}',
      /column mappings/,
    ],
  ])('refuses %s', (text, message) => {
    const result = parseSettings(text);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(message);
  });

  it('accepts a file without profiles', () => {
    const text =
      '{"app":"upi-spend-analyzer","version":1,"rules":[],"overrides":{"byTxn":{},"byMerchant":{}}}';
    expect(parseSettings(text)).toEqual({
      ok: true,
      settings: { rules: [], overrides: EMPTY_OVERRIDES, profiles: [] },
    });
  });
});

describe('readRules', () => {
  it('cleans keywords and drops repeats and empties', () => {
    const rules = readRules([
      { id: 'r', category: 'food', keywords: [' cafe ', 'CAFE', '*', 'tea-stall'] },
    ]);
    expect(rules).toEqual([{ id: 'r', category: 'food', keywords: ['CAFE', 'TEA STALL'] }]);
  });

  it.each([
    [null],
    [{}],
    [[{ id: 'r', category: 'nope', keywords: [] }]],
    [[{ id: '', category: 'food', keywords: [] }]],
    [[{ id: 'r', category: 'food', keywords: 'CAFE' }]],
    [[{ id: 'r', category: 'food', keywords: [5] }]],
    [
      [
        { id: 'r', category: 'food', keywords: [] },
        { id: 'r', category: 'rent', keywords: [] },
      ],
    ],
  ])('refuses %j', (value) => {
    expect(readRules(value)).toBeNull();
  });
});

describe('readOverrides and readProfiles', () => {
  it('refuse the wrong shapes', () => {
    expect(readOverrides(null)).toBeNull();
    expect(readOverrides({ byTxn: {} })).toBeNull();
    expect(readOverrides({ byTxn: [], byMerchant: {} })).toBeNull();
    expect(readOverrides({ byTxn: { t: 'food' }, byMerchant: { M: 5 } })).toBeNull();
    expect(readProfiles('x')).toBeNull();
    expect(readProfiles([{ ...PROFILE, mapping: { ...PROFILE.mapping, date: -1 } }])).toBeNull();
    expect(
      readProfiles([{ ...PROFILE, mapping: { ...PROFILE.mapping, dateFormat: 'x' } }]),
    ).toBeNull();
    expect(
      readProfiles([{ ...PROFILE, mapping: { ...PROFILE.mapping, debit: 'two' } }]),
    ).toBeNull();
  });

  it('accept what the app itself writes', () => {
    expect(readProfiles([PROFILE])).toEqual([PROFILE]);
    expect(readOverrides({ byTxn: { t: 'food' }, byMerchant: {} })).toEqual({
      byTxn: { t: 'food' },
      byMerchant: {},
    });
  });
});
