import { isCategoryId, type CategoryId } from '../categorise/categories';
import { EMPTY_OVERRIDES, type Overrides } from '../categorise/overrides';
import { DEFAULT_RULES, normaliseKeyword, type Rule } from '../categorise/rules';
import { DATE_FORMATS } from '../import/dates';
import type { ColumnMapping, MappingProfile } from '../import/mapping';

/**
 * Everything the app remembers between visits, and the JSON file it can be
 * saved to and loaded from. None of it is transaction data: rules, category
 * choices, and column mappings.
 *
 * Whatever comes back from storage or from an imported file is treated as
 * untrusted text and checked field by field before it is used.
 */

export interface Settings {
  rules: Rule[];
  overrides: Overrides;
  profiles: MappingProfile[];
}

export const SETTINGS_APP = 'upi-spend-analyzer';
export const SETTINGS_VERSION = 1;

export function defaultSettings(): Settings {
  return {
    rules: DEFAULT_RULES.map((rule) => ({ ...rule, keywords: [...rule.keywords] })),
    overrides: EMPTY_OVERRIDES,
    profiles: [],
  };
}

const LIMITS = { rules: 300, keywords: 300, text: 120, overrides: 20_000, profiles: 100 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isShortText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= LIMITS.text;
}

/** Reads a list of rules, or returns null if anything about it is wrong. */
export function readRules(value: unknown): Rule[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.rules) return null;
  const rules: Rule[] = [];
  const ids = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || !isShortText(entry.id) || !isCategoryId(entry.category)) return null;
    if (!Array.isArray(entry.keywords) || entry.keywords.length > LIMITS.keywords) return null;
    if (ids.has(entry.id)) return null;
    ids.add(entry.id);
    const keywords: string[] = [];
    for (const keyword of entry.keywords) {
      if (!isShortText(keyword)) return null;
      const clean = normaliseKeyword(keyword);
      if (clean && !keywords.includes(clean)) keywords.push(clean);
    }
    rules.push({ id: entry.id, category: entry.category, keywords });
  }
  return rules;
}

function readCategoryMap(value: unknown): Record<string, CategoryId> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > LIMITS.overrides) return null;
  const result: Record<string, CategoryId> = {};
  for (const [key, category] of entries) {
    if (!isShortText(key) || !isCategoryId(category)) return null;
    result[key] = category;
  }
  return result;
}

export function readOverrides(value: unknown): Overrides | null {
  if (!isRecord(value)) return null;
  const byTxn = readCategoryMap(value.byTxn);
  const byMerchant = readCategoryMap(value.byMerchant);
  return byTxn && byMerchant ? { byTxn, byMerchant } : null;
}

function isColumn(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 500;
}

function isOptionalColumn(value: unknown): value is number | null {
  return value === null || isColumn(value);
}

function readMapping(value: unknown): ColumnMapping | null {
  if (!isRecord(value)) return null;
  const { date, narration, dateFormat, amountMode, debit, credit, amount, marker } = value;
  const { positiveIs, balance, reference } = value;
  if (!isColumn(date) || !isColumn(narration)) return null;
  const format = DATE_FORMATS.find((entry) => entry.id === dateFormat);
  if (!format) return null;
  if (amountMode !== 'debit-credit' && amountMode !== 'amount-marker' && amountMode !== 'signed') {
    return null;
  }
  if (positiveIs !== 'debit' && positiveIs !== 'credit') return null;
  if (![debit, credit, amount, marker, balance, reference].every(isOptionalColumn)) return null;
  return {
    date,
    narration,
    dateFormat: format.id,
    amountMode,
    debit: debit as number | null,
    credit: credit as number | null,
    amount: amount as number | null,
    marker: marker as number | null,
    positiveIs,
    balance: balance as number | null,
    reference: reference as number | null,
  };
}

export function readProfiles(value: unknown): MappingProfile[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.profiles) return null;
  const profiles: MappingProfile[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !isShortText(entry.id) || !isShortText(entry.name)) return null;
    if (typeof entry.signature !== 'string' || entry.signature.length > 4000) return null;
    const mapping = readMapping(entry.mapping);
    if (!mapping) return null;
    profiles.push({ id: entry.id, name: entry.name, signature: entry.signature, mapping });
  }
  return profiles;
}

/** The settings as a JSON document for the user to save. */
export function serialiseSettings(settings: Settings): string {
  return `${JSON.stringify(
    {
      app: SETTINGS_APP,
      version: SETTINGS_VERSION,
      note: 'Rules, category choices and column mappings. No transactions are in this file.',
      rules: settings.rules,
      overrides: settings.overrides,
      profiles: settings.profiles,
    },
    null,
    2,
  )}\n`;
}

export type SettingsParse = { ok: true; settings: Settings } | { ok: false; error: string };

/** Reads a settings file. Anything unexpected is refused with a plain reason. */
export function parseSettings(text: string): SettingsParse {
  if (text.length > 5_000_000)
    return { ok: false, error: 'The file is too large to be a settings file.' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This is not a JSON file.' };
  }
  if (!isRecord(data) || data.app !== SETTINGS_APP) {
    return { ok: false, error: 'This file was not exported from UPI Spend Analyzer.' };
  }
  if (data.version !== SETTINGS_VERSION) {
    return {
      ok: false,
      error: `This file is version ${String(data.version)}; this app reads version ${SETTINGS_VERSION}.`,
    };
  }
  const rules = readRules(data.rules);
  if (!rules) return { ok: false, error: 'The rules in this file are not in the expected shape.' };
  const overrides = readOverrides(data.overrides);
  if (!overrides) {
    return { ok: false, error: 'The category choices in this file are not in the expected shape.' };
  }
  const profiles = readProfiles(data.profiles ?? []);
  if (!profiles) {
    return { ok: false, error: 'The column mappings in this file are not in the expected shape.' };
  }
  return { ok: true, settings: { rules, overrides, profiles } };
}
