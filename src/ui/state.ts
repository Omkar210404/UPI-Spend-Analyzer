import type { Period } from '../core/analytics/monthly';
import type { Overrides } from '../core/categorise/overrides';
import type { Rule } from '../core/categorise/rules';
import type {
  ColumnMapping,
  MappingDraft,
  MappingProfile,
  SkippedRow,
} from '../core/import/mapping';
import { findProfile } from '../core/import/mapping';
import { prepareImport, type PreparedImport } from '../core/import/prepare';
import { defaultSettings, type Settings } from '../core/settings/settings';
import type { Txn } from '../core/types';

export type Theme = 'light' | 'dark';
export type Tab = 'overview' | 'transactions' | 'signals' | 'rules' | 'about';
export const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'signals', label: 'Signals' },
  { id: 'rules', label: 'Rules and data' },
  { id: 'about', label: 'How it works' },
];

export type ImportSource = 'csv' | 'pdf' | 'sample';

/** A file that has been read and is waiting for its columns to be confirmed. */
export interface PendingImport {
  fileName: string;
  source: ImportSource;
  /** Every row of the file. Held only while the mapping screen is open. */
  fileRows: string[][];
  prepared: PreparedImport;
  draft: MappingDraft;
  /** Columns the user has said are not sensitive after all. */
  unflagged: number[];
  /** A saved mapping that matched this file's columns, if any. */
  profile: MappingProfile | null;
}

/** The statement being analysed. It lives in memory only and is gone on reload. */
export interface Statement {
  fileName: string;
  source: ImportSource;
  txns: Txn[];
  skipped: SkippedRow[];
  /** Names of the file's columns that were not imported. */
  droppedColumns: string[];
}

/** Filters for the transactions list. Set from the overview when a bar is clicked. */
export interface TxnFilter {
  search: string;
  category: string;
  direction: 'all' | 'debit' | 'credit';
}

export const EMPTY_FILTER: TxnFilter = { search: '', category: 'all', direction: 'all' };

export interface AppState {
  tab: Tab;
  pending: PendingImport | null;
  statement: Statement | null;
  settings: Settings;
  theme: Theme;
  period: Period;
  filter: TxnFilter;
  /** The latest status message, read out by screen readers. */
  notice: string;
}

export type Action =
  | { type: 'file-read'; fileName: string; source: ImportSource; fileRows: string[][] }
  | { type: 'set-header-row'; index: number }
  | { type: 'set-draft'; draft: MappingDraft }
  | { type: 'unflag-column'; column: number }
  | { type: 'cancel-import' }
  | { type: 'statement-loaded'; statement: Statement; saveProfile: MappingProfile | null }
  | { type: 'close-statement' }
  | { type: 'set-tab'; tab: Tab }
  | { type: 'set-period'; period: Period }
  | { type: 'set-filter'; filter: TxnFilter }
  | { type: 'show-transactions'; filter: Partial<TxnFilter> }
  | { type: 'set-theme'; theme: Theme }
  | { type: 'set-rules'; rules: Rule[] }
  | { type: 'set-overrides'; overrides: Overrides; notice?: string }
  | { type: 'set-profiles'; profiles: MappingProfile[] }
  | { type: 'replace-settings'; settings: Settings; notice: string }
  | { type: 'notice'; text: string };

export function initialState(settings: Settings | null, theme: Theme): AppState {
  return {
    tab: 'overview',
    pending: null,
    statement: null,
    settings: settings ?? defaultSettings(),
    theme,
    period: 'all',
    filter: EMPTY_FILTER,
    notice: '',
  };
}

function pendingFor(
  fileName: string,
  source: ImportSource,
  fileRows: string[][],
  profiles: readonly MappingProfile[],
  headerRowIndex?: number,
): PendingImport {
  const prepared = prepareImport(fileRows, headerRowIndex);
  const profile = findProfile(profiles, prepared.table);
  return {
    fileName,
    source,
    fileRows,
    prepared,
    draft: profile ? profile.mapping : prepared.suggestion.draft,
    unflagged: [],
    profile,
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'file-read':
      return {
        ...state,
        pending: pendingFor(
          action.fileName,
          action.source,
          action.fileRows,
          state.settings.profiles,
        ),
      };
    case 'set-header-row': {
      if (!state.pending) return state;
      const { fileName, source, fileRows } = state.pending;
      return {
        ...state,
        pending: pendingFor(fileName, source, fileRows, state.settings.profiles, action.index),
      };
    }
    case 'set-draft':
      return state.pending
        ? { ...state, pending: { ...state.pending, draft: action.draft } }
        : state;
    case 'unflag-column':
      return state.pending
        ? {
            ...state,
            pending: { ...state.pending, unflagged: [...state.pending.unflagged, action.column] },
          }
        : state;
    case 'cancel-import':
      return { ...state, pending: null };
    case 'statement-loaded': {
      const profiles = action.saveProfile
        ? [
            ...state.settings.profiles.filter(
              (profile) => profile.signature !== action.saveProfile!.signature,
            ),
            action.saveProfile,
          ]
        : state.settings.profiles;
      const count = action.statement.txns.length;
      const skipped = action.statement.skipped.length;
      return {
        ...state,
        // The file's raw rows are dropped here: only the mapped columns live on.
        pending: null,
        statement: action.statement,
        settings: { ...state.settings, profiles },
        tab: 'overview',
        period: 'all',
        filter: EMPTY_FILTER,
        notice: `${count} transactions imported${skipped ? `, ${skipped} rows skipped` : ''}.`,
      };
    }
    case 'close-statement':
      return { ...state, statement: null, pending: null, tab: 'overview', period: 'all' };
    case 'set-tab':
      return { ...state, tab: action.tab };
    case 'set-period':
      return { ...state, period: action.period };
    case 'set-filter':
      return { ...state, filter: action.filter };
    case 'show-transactions':
      return { ...state, tab: 'transactions', filter: { ...EMPTY_FILTER, ...action.filter } };
    case 'set-theme':
      return { ...state, theme: action.theme };
    case 'set-rules':
      return { ...state, settings: { ...state.settings, rules: action.rules } };
    case 'set-overrides':
      return {
        ...state,
        settings: { ...state.settings, overrides: action.overrides },
        notice: action.notice ?? state.notice,
      };
    case 'set-profiles':
      return { ...state, settings: { ...state.settings, profiles: action.profiles } };
    case 'replace-settings':
      return { ...state, settings: action.settings, notice: action.notice };
    case 'notice':
      return { ...state, notice: action.text };
  }
}

export type { ColumnMapping };
